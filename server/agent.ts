// The assistant. Claude chooses which shop operation to call; the operations
// and the rules engine decide what actually happens. Replies are written to be
// spoken aloud by Sarvam text-to-speech.
import Anthropic from "@anthropic-ai/sdk";
import * as ops from "./ops";
import { restockPlan, standingOrderHealth } from "./forecast";
import { all } from "./db";
import * as area from "./area";
import { KINDS, SETUP_LAKH } from "./kinds";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.CLAUDE_EFFORT || "low") as "low" | "medium" | "high";
const client = new Anthropic();
export const claudeReady = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export type Persona = "owner" | "customer";
export type Screen = "home" | "sell" | "stock" | "pay" | "collect" | "rules" | "area";
export type AgentEvent =
  | { type: "tool"; name: string; screen?: Screen; focus?: Record<string, unknown>; ok: boolean }
  | { type: "say"; text: string };

type ToolDef = Anthropic.Tool & { screen?: Screen; personas: Persona[]; run: (input: any, ctx: Ctx) => unknown };
type Ctx = { persona: Persona; customerId?: number };

const obj = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: "object" as const, properties, required, additionalProperties: false });

const TOOLS: ToolDef[] = [
  { name: "get_overview", personas: ["owner"], screen: "home",
    description: "Today's picture of the shop across all four jobs: orders waiting, stock running low, bills and cash, udhaar outstanding, and anything waiting for the owner's PIN. Call this for 'how is today', 'what needs me', or a morning brief.",
    input_schema: obj({}), run: () => ops.overview() },

  { name: "get_briefing", personas: ["owner"], screen: "home",
    description: "The morning briefing: what was already done for the owner inside their signed rules since last evening, the decisions that need them (most urgent first), the live weather for the week and the next festival with what it makes sell. Call this when the app says the owner has just opened it, or when they ask what happened or what you did.",
    input_schema: obj({}), run: () => ops.briefing() },

  // Sell
  { name: "list_orders", personas: ["owner"], screen: "sell",
    description: "Customer orders with their status (new, packing, ready, done), items, totals and how each will be collected.",
    input_schema: obj({}), run: () => ops.snapshot().orders.filter((o) => o.status !== "done").map(slimOrder) },
  { name: "set_order_status", personas: ["owner"], screen: "sell",
    description: "Move an order along: 'packing' when the owner starts on it, 'ready' when the bag is packed (the customer is told), 'done' when it is handed over (stock and money are updated).",
    input_schema: obj({ order_id: { type: "integer" }, status: { type: "string", enum: ["packing", "ready", "done"] } }, ["order_id", "status"]),
    run: (i) => ops.setOrderStatus(i.order_id, i.status) },
  { name: "get_usual", personas: ["owner", "customer"],
    description: "What a regular customer usually orders, with prices and whether each item is in stock.",
    input_schema: obj({ customer: { type: "string", description: "Customer name" } }, ["customer"]),
    run: (i, ctx) => ops.usualFor(ctx.persona === "customer" && ctx.customerId ? ctx.customerId : i.customer) },
  { name: "find_items", personas: ["owner", "customer"],
    description: "Look up items the shop stocks by spoken name in Tamil, Hindi or English. Returns price, unit and stock on hand. Use before placing an order when unsure an item exists.",
    input_schema: obj({ names: { type: "array", items: { type: "string" } } }, ["names"]),
    run: (i) => (i.names as string[]).map((n) => { const it = ops.findItem(n); return it ? { asked: n, sku: it.sku, name: it.name_en, name_ta: it.name_ta, name_hi: it.name_hi, unit: it.unit, price: it.price, stock: it.stock } : { asked: n, stocked: false }; }) },
  { name: "place_order", personas: ["owner", "customer"], screen: "sell",
    description: "Place a customer's order. Give either explicit lines or usual=true for their usual basket. fulfil is 'pickup' (default) or 'parcel' for a bike parcel when they cannot come. pay is 'upi', 'cash' or 'udhaar' (credit, checked against the owner's udhaar rule).",
    input_schema: obj({ customer: { type: "string" }, usual: { type: "boolean" },
      lines: { type: "array", items: obj({ item: { type: "string" }, qty: { type: "number" } }, ["item", "qty"]) },
      fulfil: { type: "string", enum: ["pickup", "parcel"] }, pay: { type: "string", enum: ["upi", "cash", "udhaar"] },
      said: { type: "string", description: "The customer's own words, verbatim" } }, ["customer"]),
    run: (i, ctx) => ops.createOrder({ ...i, customer: ctx.persona === "customer" && ctx.customerId ? ctx.customerId : i.customer }) },
  { name: "make_bill", personas: ["owner"], screen: "sell",
    description: "Make a bill for a sale happening at the counter right now, from the items the owner calls out ('one kilo sugar, two Parle-G, half litre oil'). This is the shop's bill book: it takes the items out of stock and records the money at once. No customer name is needed for a walk-in. Give a price only when the owner says one, or for something not in the item list. pay is 'cash' (default), 'upi', or 'udhaar' (needs a regular's name and is checked against the udhaar rule). Use place_order instead when a regular is ordering ahead for pick-up or parcel.",
    input_schema: obj({ lines: { type: "array", items: obj({ item: { type: "string" }, qty: { type: "number" }, price: { type: "number", description: "Rupees per unit, only if the owner said it" } }, ["item", "qty"]) },
      customer: { type: "string" }, pay: { type: "string", enum: ["cash", "upi", "udhaar"] }, said: { type: "string", description: "The owner's own words, verbatim" } }, ["lines"]),
    run: (i) => ops.counterSale(i) },
  { name: "cancel_bill", personas: ["owner"], screen: "sell",
    description: "Cancel a counter bill made today by mistake, by its number (TH-12). Stock and money go back. To correct a bill, cancel it and make it again.",
    input_schema: obj({ bill_no: { type: "string" } }, ["bill_no"]), run: (i) => ops.cancelBill(i.bill_no) },

  // Stock
  { name: "get_restock_plan", personas: ["owner"], screen: "stock",
    description: "What to restock first and why: days of stock left, forecast daily sales, the upcoming festival and weather effects, suggested order quantity and cost per item. Also lists standing supplier orders that bring in more than the shop sells.",
    input_schema: obj({}), run: () => {
      const p = restockPlan();
      return { festival: p.festival && { name: p.festival.name, in_days: p.festival.in_days }, weather: p.weather.summary,
        order_first: p.lines.filter((l) => l.urgency !== "ok" && l.order_qty > 0).slice(0, 10).map((l) => ({ item: l.name_en, name_ta: l.name_ta, name_hi: l.name_hi,
          days_left: l.days_left, stock: `${l.stock} ${l.unit}`, order_qty: `${l.order_qty} ${l.unit}`, cost: l.line_cost, supplier: l.supplier, urgency: l.urgency, why: l.reasons.map((r) => r.text) })),
        suggested_total: p.lines.filter((l) => l.urgency !== "ok").reduce((s, l) => s + l.line_cost, 0),
        standing_orders: standingOrderHealth().map((s) => ({ standing_id: s.id, item: s.name_en, supplier: s.supplier, brings: `${s.qty} ${s.unit} ${s.cadence}`, sells_per_day: s.daily,
          leftover_now: s.leftover, surplus_per_week: s.surplus_per_week, waste_per_week_rupees: s.waste_per_week, suggested_qty: s.suggested_qty, status: s.status })) };
    } },
  { name: "place_restock_order", personas: ["owner"], screen: "stock",
    description: "Order stock from suppliers. Either give explicit lines, or scope='urgent' for what runs out today plus festival items, or scope='all_suggested' for the whole week's suggestion. Suppliers are paid later, on delivery.",
    input_schema: obj({ scope: { type: "string", enum: ["urgent", "all_suggested"] },
      lines: { type: "array", items: obj({ item: { type: "string" }, qty: { type: "number" } }, ["item", "qty"]) } }),
    run: (i) => ops.placeRestock(i) },
  { name: "adjust_standing_order", personas: ["owner"], screen: "stock",
    description: "Pause, resume, cut or cancel a standing supplier order (for example the daily milk or weekly bread). For 'cut' give the new quantity. Only do this when the owner asks for it.",
    input_schema: obj({ standing_id: { type: "integer" }, action: { type: "string", enum: ["pause", "resume", "cut", "cancel"] }, qty: { type: "number" } }, ["standing_id", "action"]),
    run: (i) => ops.adjustStanding(i.standing_id, i.action, i.qty) },

  { name: "record_delivery", personas: ["owner"], screen: "stock",
    description: "Record what actually arrived from a supplier, as the owner counts it in ('KPN delivered 50 sugar and 25 jaggery'). Adds it to stock. The supplier's bill is later checked against this count.",
    input_schema: obj({ supplier: { type: "string" }, lines: { type: "array", items: obj({ item: { type: "string" }, qty: { type: "number" } }, ["item", "qty"]) } }, ["supplier", "lines"]),
    run: (i) => ops.recordDelivery(i.supplier, i.lines) },

  // Pay
  { name: "list_bills", personas: ["owner"], screen: "pay",
    description: "Supplier bills with amount billed, the correct amount after checking against what was delivered, when each is due, and what the owner's rules say about paying it. Includes cash on hand and any shortfall this week.",
    input_schema: obj({}), run: () => {
      const s = ops.snapshot();
      return { cash: s.cash, bills: s.bills.map((b) => ({ bill_id: b.id, supplier: b.supplier, ref: b.ref, billed: b.amount, correct_amount: b.correct_amount, overcharge: b.overcharge,
        due_in_days: b.due_in, status: b.status, new_supplier: !b.trusted, rule_check: b.verdict })) };
    } },
  { name: "check_bill", personas: ["owner"], screen: "pay",
    description: "Check one supplier bill line by line against what was actually delivered. Reports any item billed but not received and the correct amount to pay.",
    input_schema: obj({ bill_id: { type: "integer" } }, ["bill_id"]), run: (i) => ops.checkBill(i.bill_id) },
  { name: "pay_bill", personas: ["owner"], screen: "pay",
    description: "Pay a supplier bill for the correct (delivered) amount. The rules engine decides: 'paid' if inside the owner's limits, 'needs_pin' if the owner must approve on screen, 'refused' if cash does not cover it. You cannot override the result.",
    input_schema: obj({ bill_id: { type: "integer" } }, ["bill_id"]), run: (i) => ops.payBill(i.bill_id) },
  { name: "get_loan_offer", personas: ["owner"], screen: "pay",
    description: "Whether a stock loan is on offer to cover this week's shortfall, with amount, fee and daily repayment. Terms are illustrative.",
    input_schema: obj({}), run: () => ops.loanOffer() },
  { name: "request_loan", personas: ["owner"], screen: "pay",
    description: "Ask for the stock loan on offer. Always needs the owner's PIN on screen; this only raises the request.",
    input_schema: obj({}), run: () => ops.requestLoan() },

  // Collect
  { name: "list_dues", personas: ["owner"], screen: "collect",
    description: "Udhaar (credit) outstanding by customer: amount, how many days old, reminders already sent.",
    input_schema: obj({}), run: () => ops.snapshot().dues.map((d) => ({ customer: d.customer, amount: d.amount, days: d.days, reminders_sent: d.reminders })) },
  { name: "send_reminders", personas: ["owner"], screen: "collect",
    description: "Send udhaar reminders with a Paytm payment link. Each message is written for that person from how long they have owed, how often they order and whether they were reminded before. Give a customer name for one person, min_days for everyone owing longer than that, or neither for everyone. The result includes each message; read one out only if asked.",
    input_schema: obj({ customer: { type: "string" }, min_days: { type: "integer" }, language: { type: "string", enum: ["ta-IN", "hi-IN", "en-IN"] } }),
    run: (i) => ops.sendReminders(i) },
  { name: "record_due_payment", personas: ["owner"], screen: "collect",
    description: "Record money received against a customer's udhaar, in full or in part.",
    input_schema: obj({ customer: { type: "string" }, amount: { type: "number" } }, ["customer", "amount"]),
    run: (i) => ops.recordDuePayment(i.customer, i.amount, "owner") },

  // Rules
  { name: "list_rules", personas: ["owner"], screen: "rules",
    description: "The rules the owner has spoken and signed, in their own words.",
    input_schema: obj({}), run: () => ({ rules: ops.rulesView().map((r) => ({ rule_id: r.id, kind: r.kind, params: r.params, spoken: r.spoken })),
      suppliers: all("SELECT id, name FROM suppliers"), standing_items: all("SELECT DISTINCT i.id, i.name_en FROM standing_orders so JOIN items i ON i.id = so.item_id") }) },
  { name: "propose_rule", personas: ["owner"], screen: "rules",
    description: `Draft a rule from what the owner just said. It is NOT saved until the owner enters their PIN on screen. Kinds and params:
- pay_limit: {supplier_id: integer or null for all suppliers, max_amount: rupees}. Pay without asking up to this amount.
- new_supplier: {}. Never pay a supplier that has not been paid before without the owner.
- standing_guard: {item_id, leftover_gt: number, action: "pause"|"cut"|"cancel"}. When more than leftover_gt units are left over, pause/cut/cancel that standing order.
- credit_limit: {max_due: rupees}. No more udhaar for anyone who owes over this.
'spoken' is the rule in the owner's own words, in their language, as one clear sentence. Call list_rules first if you need supplier or item ids.`,
    input_schema: obj({ kind: { type: "string", enum: ["pay_limit", "new_supplier", "standing_guard", "credit_limit"] },
      params: { type: "object", additionalProperties: true }, spoken: { type: "string" } }, ["kind", "params", "spoken"]),
    run: (i) => ops.proposeRule(i.kind, i.params, i.spoken) },
  { name: "propose_rule_removal", personas: ["owner"], screen: "rules",
    description: "Ask to remove a rule. Needs the owner's PIN on screen.",
    input_schema: obj({ rule_id: { type: "integer" } }, ["rule_id"]), run: (i) => ops.proposeRuleRemoval(i.rule_id) },

  // Area
  { name: "area_gaps", personas: ["owner"], screen: "area",
    description: "For a locality or street in Chennai: how many businesses of each kind are listed within walking distance, how that compares with similar localities, which kinds are thin or crowded, the busiest streets, and what brings people there (schools, hospitals, stations, temples). Also lists every kind of shop a first-time owner could open, with a rough setup cost. Counts come from open map listings (Overture Maps, OpenStreetMap) and are incomplete; treat them as a guide. Use for 'what is missing in X', 'how many pharmacies near X', and as the first step of 'what should I open in X'.",
    input_schema: obj({ place: { type: "string", description: "Locality or street name, e.g. 'West Tambaram' or 'Velachery'" }, radius_m: { type: "integer", description: "400 to 2000, default 800" },
      budget_rupees: { type: "integer", description: "What the person can invest, if they said" },
      lat: { type: "number", description: "Only when the message gives a map point: its latitude. Never say coordinates aloud." }, lon: { type: "number" } }, ["place"]),
    run: (i) => area.reportForAgent(i.place, i.radius_m, i.budget_rupees, Number.isFinite(i.lat) && Number.isFinite(i.lon) ? { lat: i.lat, lon: i.lon } : undefined) },
  { name: "show_shortlist", personas: ["owner"], screen: "area",
    description: `Put your shortlist of businesses to open on the owner's screen, after area_gaps. Give two or three options, best first. For each: kind_key from could_open; 'why' in one or two plain sentences that cite the numbers you saw (count here against similar areas, the nearest one, the streets or the schools, hospitals or stations that would feed it); 'watch_out' with the main risk (already crowded nearby, cost near the top of the budget, thin data). Write why and watch_out in the language the owner is speaking. Prefer kinds that are thin here and that the things bringing people to the area would feed; do not suggest a kind that is crowded or over budget. Never promise earnings or returns.`,
    input_schema: obj({ place: { type: "string" }, lat: { type: "number" }, lon: { type: "number" }, radius_m: { type: "integer" }, budget_rupees: { type: "integer" },
      options: { type: "array", items: obj({ kind_key: { type: "string", enum: Object.keys(SETUP_LAKH) }, why: { type: "string" }, watch_out: { type: "string" } }, ["kind_key", "why", "watch_out"]) } }, ["place", "lat", "lon", "options"]),
    run: (i) => {
      const options = (i.options as any[]).slice(0, 3).map((o) => { const k = KINDS.find((x) => x.key === o.kind_key); if (!k) throw new ops.OpError(`Unknown kind ${o.kind_key}`);
        return { key: k.key, label: k.label, ta: k.ta, hi: k.hi, color: k.color, setup_lakh: SETUP_LAKH[k.key], why: String(o.why), watch_out: String(o.watch_out) }; });
      if (!options.length) throw new ops.OpError("Give at least one option.");
      return { shown: true, place: i.place, lat: i.lat, lon: i.lon, radius_m: i.radius_m ?? 800, budget_rupees: i.budget_rupees ?? null, options };
    } },

  { name: "show_screen", personas: ["owner"],
    description: "Switch the owner's phone to a screen when they ask to see something and no other tool call would already show it.",
    input_schema: obj({ screen: { type: "string", enum: ["home", "sell", "stock", "pay", "collect", "rules", "area"] } }, ["screen"]),
    run: (i) => ({ showing: i.screen }) },
];

function slimOrder(o: any) {
  return { order_id: o.id, customer: o.customer, status: o.status, total: o.total, fulfil: o.fulfil, pay: o.pay,
    items: o.lines.map((l: any) => `${l.name} ${l.qty} ${l.unit}`) };
}

const SPEECH_RULES = `How to speak:
- Your words are read aloud by a text-to-speech voice in a busy shop. Write for the ear: one to three short sentences, the answer first.
- Reply in the language the person just spoke: Tamil in Tamil script, Hindi in Devanagari, English in English. If they mix languages, mix the same way, the way people in Chennai do. Keep item and brand names as people say them.
- Say amounts the way people say them aloud, for example "3,000 rupees" or "3,000 ரூபாய்", never with the ₹ sign. Use digits with commas for numbers.
- No lists, headings, emoji, or symbols. No preamble like "Sure" or "Of course".
- When there are many items, name the two or three that matter most and say how many more there are; the screen shows the rest.
- The speech recogniser makes mistakes with names and numbers. If a name or amount is unclear or does not match anything, ask one short question instead of guessing.`;

function systemPrompt(persona: Persona, ctx: { shop: any; customer?: any }) {
  if (persona === "customer") {
    return `You are Thunai, taking orders by voice for ${ctx.shop.name}, a neighbourhood grocery shop in ${ctx.shop.locality}, Chennai. You are speaking with a regular customer${ctx.customer ? ` named ${ctx.customer.name}` : ""} who has called to order.

Your job: understand what they want, place the order with the place_order tool, then confirm it back in one breath: the items, the total, and that the bag will be ready for pick-up (or sent by bike parcel if they asked).
- If they say "the usual" or the equivalent in Tamil or Hindi ("வழக்கம் போல", "रोज़ वाला"), order their usual basket with usual=true.
- If an item is not stocked or is short, say so and offer to place the rest.
- If they ask to put it on udhaar and the tool refuses, tell them kindly that the shop owner will need to decide, and offer UPI or cash on pick-up.
- You only take orders. For anything else, say the owner will call back.

${SPEECH_RULES}`;
  }
  return `You are Thunai, the business partner for ${ctx.shop.name}, a neighbourhood grocery (kirana) shop in ${ctx.shop.locality}, Chennai, run by ${ctx.shop.owner} and family. You live inside the Paytm for Business app and are operated almost entirely by voice. The person speaking is the owner or a family member at the counter, usually with their hands full.

You help with four jobs, and the tools are grouped the same way:
- Sell: take and track customer orders, and make counter bills. When the owner calls out items being sold at the counter, call make_bill straight away without asking for confirmation, then say only the total and the number of items, and mention anything that needs a price or has just run out.
- Stock: say what to restock first and why, and place supplier orders.
- Pay: check supplier bills against deliveries and pay them inside the owner's rules.
- Collect: follow up on udhaar (credit) politely and record what comes in.
You can also advise someone thinking of opening a shop: area_gaps shows what a locality has, lacks and what draws people there. When they ask what to open, call area_gaps (with their budget if they gave one), reason from those numbers, then call show_shortlist with two or three options before you speak. Say the top option and why in a sentence, and that the others are on screen.

How you work:
- Use the tools for every fact and every action. Never state a number you did not get from a tool in this conversation, and never say something was done unless a tool result says so.
- Calling a tool also switches the owner's screen to the matching view, so you do not need to describe everything; point to what matters.
- The owner sets rules in their own words, and a separate rules engine enforces them. You propose; it decides. If a tool returns needs_pin, tell the owner in one sentence why, and that the PIN pad is on screen. If it returns refused, say why and offer the next best step. Never suggest a way around a rule.
- When the owner states a new standing instruction ("never...", "always ask me...", "up to ... without asking", "no more udhaar for..."), draft it with propose_rule and read it back in their words. It is saved only when they enter their PIN.
- Be proactive once, not repeatedly: if a tool result shows something the owner would want to know (a bill charging for goods not received, a standing order wasting money, cash too short for the festival stock), mention it briefly along with your answer.
- Messages that begin with "(app event)" come from the app, not from the owner's mouth. They report what just happened on screen, such as a PIN being entered or a bill being photographed. Acknowledge the outcome in one or two short sentences.
- The morning briefing: when the app says the owner has just opened it, call get_briefing and speak first. Lead with what you already did inside their rules, in one sentence. Then the two decisions that matter most today, each in one sentence with its number. Mention the weather or festival only if it changes what to stock. Finish by asking which they want to deal with first. Four or five short sentences in all, in the owner's language.

${SPEECH_RULES}`;
}

type Session = { persona: Persona; messages: Anthropic.Beta.BetaMessageParam[]; turns: number; customerId?: number };
const sessions = new Map<string, Session>();
export function resetSessions() { sessions.clear(); }

const supportsFallback = (m: string) => /^claude-(opus-5-5|sonnet-5-5|fable-5-[12]|opus-5)$/.test(m);

async function callClaude(system: string, tools: ToolDef[], messages: Anthropic.Beta.BetaMessageParam[]) {
  const base = {
    model: MODEL, max_tokens: 4096,
    system: [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }],
    tools: tools.map(({ name, description, input_schema }) => ({ name, description, input_schema })),
    output_config: { effort: EFFORT },
    messages,
  };
  if (supportsFallback(MODEL)) {
    try {
      // On a policy decline the API re-runs the request on a fallback model in the same call.
      return await client.beta.messages.create({ ...base, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } as any);
    } catch (err) {
      if (!(err instanceof Anthropic.BadRequestError)) throw err;
      console.warn("[agent] fallback parameter rejected, retrying without it:", err.message);
    }
  }
  return await client.beta.messages.create(base as any);
}

export async function converse(input: { sessionId: string; persona: Persona; text: string; customerId?: number; onEvent: (e: AgentEvent) => void }): Promise<string> {
  let s = sessions.get(input.sessionId);
  if (!s || s.persona !== input.persona || s.turns > 40 || s.customerId !== input.customerId) {
    s = { persona: input.persona, messages: [], turns: 0, customerId: input.customerId };
    sessions.set(input.sessionId, s);
  }
  const ctx: Ctx = { persona: input.persona, customerId: input.customerId };
  const tools = TOOLS.filter((t) => t.personas.includes(input.persona));
  const customer = input.customerId ? ops.findCustomer(input.customerId) : undefined;
  const system = systemPrompt(input.persona, { shop: ops.shop(), customer });
  s.messages.push({ role: "user", content: input.text });
  s.turns++;

  for (let step = 0; step < 8; step++) {
    const res = await callClaude(system, tools, s.messages);
    s.messages.push({ role: "assistant", content: res.content as any });

    if (res.stop_reason === "refusal") return "Sorry, I can't help with that one.";
    const calls = res.content.filter((b: any) => b.type === "tool_use") as Anthropic.Beta.BetaToolUseBlock[];
    if (res.stop_reason !== "tool_use" || !calls.length) {
      const text = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ").trim();
      return text || "Done.";
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const tool = tools.find((t) => t.name === call.name);
      const inp = (call.input ?? {}) as any;
      if (!tool) { results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Unknown tool ${call.name}` }); continue; }
      try {
        const out = await tool.run(inp, ctx);
        const screen = call.name === "show_screen" ? (inp.screen as Screen) : tool.screen;
        input.onEvent({ type: "tool", name: call.name, screen: input.persona === "owner" ? screen : undefined, focus: focusOf(call.name, inp, out), ok: true });
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(out) });
      } catch (err) {
        const msg = err instanceof ops.OpError || err instanceof area.AreaError ? err.message : `Tool failed: ${(err as Error).message}`;
        if (!(err instanceof ops.OpError || err instanceof area.AreaError)) console.error("[agent] tool error", call.name, err);
        input.onEvent({ type: "tool", name: call.name, screen: input.persona === "owner" ? tool.screen : undefined, ok: false });
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: msg });
      }
    }
    s.messages.push({ role: "user", content: results });
  }
  return "That took more steps than I expected. Please ask me again.";
}

function focusOf(name: string, inp: any, out: any): Record<string, unknown> | undefined {
  if (inp?.bill_id) return { bill_id: inp.bill_id };
  if (inp?.order_id) return { order_id: inp.order_id };
  if (out?.order_id) return { order_id: out.order_id };
  if (name === "show_shortlist" && out?.options) return { place: out.place, lat: out.lat, lon: out.lon, radius_m: out.radius_m, shortlist: { budget: out.budget_rupees, options: out.options } };
  if (name === "area_gaps" && out?.place) return { place: out.place, lat: out.lat, lon: out.lon, radius_m: out.radius_m };
  if (inp?.standing_id) return { standing_id: inp.standing_id };
  if (inp?.customer) return { customer: inp.customer };
  return undefined;
}
