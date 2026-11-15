// Udhaar reminders written for each person, from how they have dealt with the
// shop. Falls back to a fixed template when Claude is not available.
import { structured, claudeReady } from "./llm";

export type Debtor = { customer_id: number; name: string; amount: number; days: number; reminders_sent: number;
  paid_before: number; payments_made: number; orders_last_month: number; street: string };

const TEMPLATE: Record<string, (n: string, a: string, s: string) => string> = {
  "ta-IN": (n, a, s) => `வணக்கம் ${n}, ${s}-லிருந்து. உங்கள் கணக்கில் ${a} நிலுவையில் உள்ளது. வசதியான போது இந்த லிங்கில் செலுத்தலாம், பகுதியாகவும் செலுத்தலாம். நன்றி!`,
  "hi-IN": (n, a, s) => `नमस्ते ${n}, ${s} से। आपके खाते में ${a} बाकी है। सुविधा होने पर इस लिंक से चुका सकते हैं, थोड़ा-थोड़ा भी चलेगा। धन्यवाद!`,
  "en-IN": (n, a, s) => `Hello ${n}, this is ${s}. ${a} is pending on your account. You can pay with this link whenever convenient, in parts if that is easier. Thank you!`,
};
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const LANG_NAME: Record<string, string> = { "ta-IN": "Tamil, in Tamil script", "hi-IN": "Hindi, in Devanagari", "en-IN": "Indian English" };

export async function writeReminders(people: Debtor[], lang: string, shop: { name: string; owner: string }): Promise<{ messages: Map<number, string>; written_by: "claude" | "template" }> {
  const l = TEMPLATE[lang] ? lang : "en-IN";
  const fallback = () => ({ messages: new Map(people.map((p) => [p.customer_id, TEMPLATE[l](p.name, inr(p.amount), shop.name)])), written_by: "template" as const });
  if (!claudeReady()) return fallback();
  try {
    const out = await structured<{ messages: { customer_id: number; text: string }[] }>({
      system: `You write udhaar (shop credit) reminders that ${shop.owner}, who runs ${shop.name}, a neighbourhood grocery in Chennai, sends to regular customers on WhatsApp. These are neighbours the owner sees every week, so the relationship matters more than any one payment.

Write one message per person in ${LANG_NAME[l]}, the way a courteous shopkeeper would, not a bank.
- Greet by name, say it is from the shop, state the exact amount, and say they can pay by the link, in parts if easier.
- Fit the tone to the person. A first reminder to someone who orders often and has paid before is light and warm. Someone reminded twice already, or owing for over a month, gets a clear and direct ask with a suggested part payment, still respectful. Never shame, threaten, mention other customers, or refuse future service.
- Use the facts given and nothing else. Do not invent a due date, a discount, or a reason.
- Two or three sentences, under 300 characters. No emoji. Do not include a link; it is added after your text.`,
      content: JSON.stringify({ people: people.map((p) => ({ customer_id: p.customer_id, name: p.name, owes_rupees: p.amount, owing_for_days: p.days, reminders_already_sent: p.reminders_sent,
        has_paid_udhaar_before: p.payments_made > 0, orders_in_last_month: p.orders_last_month })) }),
      tool: { name: "write_messages", description: "The reminder for each person.",
        input_schema: { type: "object", additionalProperties: false, required: ["messages"], properties: { messages: { type: "array",
          items: { type: "object", additionalProperties: false, required: ["customer_id", "text"], properties: { customer_id: { type: "integer" }, text: { type: "string" } } } } } } },
    });
    const messages = new Map<number, string>();
    for (const p of people) {
      const m = out.messages?.find((x) => x.customer_id === p.customer_id)?.text?.trim();
      // A message that dropped the amount is not sent; the template is used for that person.
      const hasAmount = m && (m.includes(p.amount.toLocaleString("en-IN")) || m.includes(String(p.amount)));
      messages.set(p.customer_id, hasAmount ? m! : TEMPLATE[l](p.name, inr(p.amount), shop.name));
    }
    return { messages, written_by: "claude" };
  } catch (err) {
    console.warn("[writer] reminders fell back to the template:", (err as Error).message);
    return fallback();
  }
}

// Rewrites the wording of a supplier call so it sounds like two people on the
// phone in the shop's language. The facts (items, quantities, prices) are fixed
// by the caller; a rewrite that drops a turn is thrown away.
// Reads what a supplier agreed to on a real call, line by line. The model only
// reports what was said; whether a line may be ordered is decided in code.
export async function readCall(asked: { name: string; qty: number; unit: string; cost: number }[], transcript: { who: string; text: string }[]):
  Promise<{ name: string; qty: number; rate: number }[] | null> {
  if (!claudeReady()) return null;
  try {
    const out = await structured<{ lines: { name: string; qty: number; rate: number }[] }>({
      system: `You read the transcript of a phone call in which a shop's ordering assistant ("saajhedar") asked a supplier for some items. For each item asked for, report what the supplier clearly agreed to supply: the quantity and the price per unit. Use quantity 0 when the item was never discussed, was refused, was left for the owner, or the supplier's answer is unclear or was only "will check later". When the supplier agreed without naming a different price, use the usual price given. Return one entry per item asked, with the item's name exactly as given.`,
      content: JSON.stringify({ asked: asked.map((l) => ({ name: l.name, quantity: l.qty, unit: l.unit, usual_price: l.cost })), transcript }),
      tool: { name: "read_call", description: "What the supplier agreed to, one entry per item asked.", input_schema: { type: "object", additionalProperties: false, required: ["lines"],
        properties: { lines: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "qty", "rate"], properties: { name: { type: "string" }, qty: { type: "number" }, rate: { type: "number" } } } } } } },
      maxTokens: 800,
    });
    return Array.isArray(out.lines) ? out.lines : null;
  } catch { return null; }
}

export async function writeCall(turns: { who: string; text: string }[], lang: string, supplier: string): Promise<{ who: string; text: string }[] | null> {
  if (!claudeReady()) return null;
  try {
    const out = await structured<{ turns: { text: string }[] }>({
      system: `You rewrite a short phone call between a shop's ordering assistant and a supplier (${supplier}) in Chennai so it sounds natural and spoken, in ${LANG_NAME[lang] ?? LANG_NAME["en-IN"]}. Keep the same number of turns in the same order, and keep every item, quantity, price and amount exactly as given. Do not add offers, promises or small talk beyond a greeting.`,
      content: JSON.stringify(turns),
      tool: { name: "write_call", description: "The rewritten turns, one per original turn, in order.", input_schema: { type: "object", additionalProperties: false, required: ["turns"],
        properties: { turns: { type: "array", items: { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } } } } } },
      maxTokens: 1500,
    });
    if (out.turns?.length !== turns.length) return null;
    return turns.map((t, i) => ({ who: t.who, text: String(out.turns[i].text) }));
  } catch { return null; }
}
