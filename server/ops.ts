// Shop operations. HTTP routes and the assistant's tools both call these, so a
// spoken request and a tapped button take exactly the same path.
import { all, get, run, log, nowIso, today, addDays, daysBetween, db } from "./db";
import { restockPlan, standingOrderHealth, upcomingFestival, outlook } from "./forecast";
import { currentWeather } from "./weather";
import { writeReminders, type Debtor } from "./writer";
import type { BillDoc } from "./billing";
import { judgePayment, judgeCredit, validateRule, activeRules, trippedGuards, RULE_KINDS, type RuleKind } from "./rules";
import { emit } from "./bus";
import * as sync from "./sync";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
export const OWNER_PIN = process.env.OWNER_PIN || "1234";
const ownerPin = () => get("SELECT value FROM settings WHERE key = 'pin'")?.value ?? OWNER_PIN;

export class OpError extends Error {}

// ---------- lookups ----------
const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();

export function findItem(text: string) {
  const q = norm(text);
  if (!q) return null;
  const items = all("SELECT * FROM items");
  let best: any = null, bestScore = 0;
  for (const it of items) {
    const names = [it.sku, it.name_en, it.name_ta, it.name_hi, ...String(it.aliases).split(",")].map(norm).filter(Boolean);
    for (const n of names) {
      let score = 0;
      if (n === q) score = 100;
      else if (q.includes(n) || n.includes(q)) score = 60 + Math.min(n.length, q.length);
      else {
        const qt = new Set(q.split(" ")); const hit = n.split(" ").filter((w) => qt.has(w)).length;
        if (hit) score = 30 + hit * 10;
      }
      if (score > bestScore) { bestScore = score; best = it; }
    }
  }
  return bestScore >= 40 ? best : null;
}

export function findCustomer(text: string | number) {
  if (typeof text === "number") return get("SELECT * FROM customers WHERE id = ?", text);
  const q = norm(String(text));
  const rows = all("SELECT * FROM customers");
  return rows.find((c) => norm(c.name) === q) ?? rows.find((c) => q.includes(norm(c.name)) || norm(c.name).includes(q)) ?? null;
}

export function findSupplier(text: string | number) {
  if (typeof text === "number") return get("SELECT * FROM suppliers WHERE id = ?", text);
  const q = norm(String(text));
  const rows = all("SELECT * FROM suppliers");
  return rows.find((s) => norm(s.name).includes(q) || q.includes(norm(s.name).split(" ")[0]))
    ?? rows.find((s) => norm(s.supplies).split(" ").some((w) => q.includes(w))) ?? null;
}

// ---------- read models ----------
export function shop() { return get("SELECT * FROM shop WHERE id = 1")!; }

function ordersView() {
  return all(`SELECT o.*, c.name AS customer, c.street FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
              ORDER BY CASE o.status WHEN 'new' THEN 0 WHEN 'packing' THEN 1 WHEN 'ready' THEN 2 ELSE 3 END, o.created_at DESC`)
    .map((o) => ({ ...o, lines: JSON.parse(o.lines) }));
}

function billsView() {
  const cash = shop().cash;
  return all(`SELECT b.*, s.name AS supplier, s.trusted FROM bills b JOIN suppliers s ON s.id = b.supplier_id ORDER BY b.status = 'paid', b.due_day`)
    .map((b) => {
      const lines = JSON.parse(b.lines).map((l: any) => {
        const it = (l.sku && get("SELECT name_en,name_ta,name_hi,unit FROM items WHERE sku = ?", l.sku)) || { name_en: l.name, name_ta: l.name, name_hi: l.name, unit: l.unit || "" };
        return { ...l, ...it, short_qty: l.billed_qty - l.received_qty, short_amount: Math.round((l.billed_qty - l.received_qty) * l.rate) };
      });
      const correct = Math.round(lines.reduce((s: number, l: any) => s + l.received_qty * l.rate, 0));
      const verdict = b.status === "paid" ? null : judgePayment(b as any, correct, cash);
      return { ...b, lines, correct_amount: correct, overcharge: b.amount - correct, due_in: daysBetween(today(), b.due_day),
        verdict: verdict && { decision: verdict.decision, why: verdict.why, rule_id: verdict.rule?.id ?? null } };
    });
}

function duesView() {
  const t = today();
  return all(`SELECT d.*, c.name AS customer, c.phone, c.street FROM dues d JOIN customers c ON c.id = d.customer_id
              WHERE d.amount > 0 ORDER BY d.since_day`).map((d) => ({ ...d, days: daysBetween(d.since_day, t) }));
}

export function cashView() {
  const s = shop();
  const bills = billsView().filter((b) => b.status !== "paid");
  const dueSoon = bills.filter((b) => b.due_in <= 3).reduce((a, b) => a + b.correct_amount, 0);
  const plan = restockPlan();
  const urgent = urgentLines(plan).reduce((a, l) => a + l.line_cost, 0);
  const shortfall = Math.max(0, dueSoon + urgent - s.cash);
  return { cash: s.cash, bills_due_soon: dueSoon, restock_cost: urgent, shortfall,
    udhaar_out: duesView().reduce((a, d) => a + d.amount, 0), loan: get("SELECT * FROM loans WHERE status = 'active' ORDER BY id DESC") };
}

// "Order first": what runs out within two days, plus anything the coming festival lifts.
export function urgentLines(plan: ReturnType<typeof restockPlan>) {
  return plan.lines.filter((l) => l.order_qty > 0 && (l.urgency === "today" || l.reasons.some((r) => r.code === "festival")));
}

export function loanOffer() {
  const c = cashView();
  if (c.loan) return { eligible: false as const, reason: "A stock loan is already running.", loan: c.loan };
  if (c.shortfall <= 0) return { eligible: false as const, reason: "Cash on hand covers this week's bills and restock." };
  const t = today();
  const dailySales = (get(`SELECT COALESCE(SUM(s.qty * i.price),0) / 14.0 AS v FROM sales s JOIN items i ON i.id = s.item_id WHERE s.day >= ?`, addDays(t, -14))?.v ?? 0) as number;
  const amount = Math.min(Math.ceil(c.shortfall / 5000) * 5000, Math.floor((dailySales * 5) / 5000) * 5000);
  // Fee and repayment are placeholders. The real numbers come from the lending partner.
  const fee = Math.round(amount * 0.02);
  const days = 30;
  return { eligible: true as const, amount, fee, days, daily_repay: Math.ceil((amount + fee) / days), shortfall: c.shortfall,
    daily_sales: Math.round(dailySales), basis: `Based on about ${inr(dailySales)} a day in sales over the last two weeks.`,
    note: "Illustrative offer. Fee and repayment terms are set by the lending partner." };
}

export function overview() {
  const t = today();
  const orders = ordersView();
  const salesToday = orders.filter((o) => o.status === "done" && o.created_at.slice(0, 10) >= addDays(t, -1)).reduce((a, o) => a + o.total, 0);
  const yesterday = (get(`SELECT COALESCE(SUM(s.qty * i.price),0) AS v FROM sales s JOIN items i ON i.id = s.item_id WHERE s.day = ?`, addDays(t, -1))?.v ?? 0) as number;
  const plan = restockPlan();
  const cash = cashView();
  return {
    shop: shop(), date: t,
    sell: { waiting: orders.filter((o) => o.status === "new").length, packing: orders.filter((o) => o.status === "packing").length,
      ready: orders.filter((o) => o.status === "ready").length, taken_today: salesToday, yesterday_sales: Math.round(yesterday) },
    stock: { urgent: plan.lines.filter((l) => l.urgency === "today").length, this_week: plan.lines.filter((l) => l.urgency === "this_week").length,
      festival: plan.festival && { name: plan.festival.name, name_ta: plan.festival.name_ta, name_hi: plan.festival.name_hi, in_days: plan.festival.in_days },
      weather: currentWeather().summary },
    pay: { cash: cash.cash, bills_open: billsView().filter((b) => b.status !== "paid").length, bills_due_soon: cash.bills_due_soon, shortfall: cash.shortfall },
    collect: { total: cash.udhaar_out, people: duesView().length },
    pending: pendingView().length,
  };
}

export function pendingView() {
  return all("SELECT * FROM pending WHERE status = 'waiting' ORDER BY id").map((p) => ({ ...p, payload: JSON.parse(p.payload) }));
}

export function rulesView() {
  return activeRules().map((r) => ({ ...r, job: RULE_KINDS[r.kind].job, title: RULE_KINDS[r.kind].title }));
}

export function snapshot() {
  const plan = restockPlan();
  const health = standingOrderHealth();
  return {
    overview: overview(), orders: ordersView(), plan, standing: health, guards: trippedGuards(health).map((g) => ({ ...g, rule: { id: g.rule.id, spoken: g.rule.spoken, params: g.rule.params } })),
    profile: profile(), sync: sync.status(), bills: billsView(), cash: cashView(), outlook: outlook(), briefing: briefing(), loan_offer: loanOffer(), dues: duesView(), rules: rulesView(), pending: pendingView(),
    customers: all("SELECT * FROM customers").map((c) => ({ ...c, usual: JSON.parse(c.usual) })),
    suppliers: all("SELECT * FROM suppliers"),
    items: all("SELECT id,sku,name_en,name_ta,name_hi,category,unit,price,stock FROM items ORDER BY category,name_en"),
    activity: all("SELECT * FROM activity ORDER BY id DESC LIMIT 40"),
    supplier_orders: all(`SELECT so.*, s.name AS supplier FROM supplier_orders so JOIN suppliers s ON s.id = so.supplier_id ORDER BY so.id DESC LIMIT 10`)
      .map((o) => ({ ...o, lines: JSON.parse(o.lines) })),
  };
}

// ---------- Sell ----------
export function usualFor(customer: string | number) {
  const c = findCustomer(customer);
  if (!c) throw new OpError(`No regular called "${customer}".`);
  const usual = JSON.parse(c.usual).map((u: any) => {
    const it = get("SELECT * FROM items WHERE sku = ?", u.sku)!;
    return { sku: u.sku, qty: u.qty, name: it.name_en, name_ta: it.name_ta, name_hi: it.name_hi, unit: it.unit, price: it.price, in_stock: it.stock >= u.qty };
  });
  return { customer: { id: c.id, name: c.name, street: c.street }, usual, total: Math.round(usual.reduce((s: number, l: any) => s + l.qty * l.price, 0)) };
}

export function createOrder(input: { customer: string | number; lines?: { item: string; qty: number }[]; usual?: boolean;
  fulfil?: "pickup" | "parcel"; pay?: "upi" | "cash" | "udhaar"; said?: string; channel?: string }) {
  const c = findCustomer(input.customer);
  if (!c) throw new OpError(`No regular called "${input.customer}". Ask for their name again.`);
  let lines: any[] = [];
  const missing: string[] = [], short: string[] = [];
  const wanted = input.usual || !input.lines?.length
    ? JSON.parse(c.usual).map((u: any) => ({ item: u.sku, qty: u.qty }))
    : input.lines!;
  for (const w of wanted) {
    const it = findItem(w.item);
    if (!it) { missing.push(w.item); continue; }
    const qty = Math.max(0.25, Number(w.qty) || 1);
    if (it.stock < qty) short.push(`${it.name_en} (only ${it.stock} ${it.unit} left)`);
    lines.push({ sku: it.sku, qty: Math.min(qty, Math.max(it.stock, 0)) || qty, name: it.name_en, name_ta: it.name_ta, name_hi: it.name_hi, unit: it.unit, price: it.price });
  }
  if (!lines.length) throw new OpError(`None of those items are stocked: ${missing.join(", ")}.`);
  const total = Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0));
  const pay = input.pay ?? "upi";
  if (pay === "udhaar") {
    const v = judgeCredit(c.id, total);
    if (v.decision !== "allow") throw new OpError(`Cannot put this on udhaar. ${v.why}`);
  }
  const res = run("INSERT INTO orders (customer_id,lines,total,status,fulfil,pay,channel,said,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    c.id, JSON.stringify(lines), total, "new", input.fulfil ?? "pickup", pay, input.channel ?? "voice", input.said ?? "", nowIso());
  const id = Number(res.lastInsertRowid);
  log("sell", `Took ${c.name}'s order by voice`, `${lines.length} items, ${inr(total)}, ${input.fulfil === "parcel" ? "bike parcel" : "pick-up"}`);
  emit({ type: "order", id, customer: c.name, total, lines, fulfil: input.fulfil ?? "pickup" });
  emit({ type: "refresh" });
  return { order_id: id, customer: c.name, lines, total, fulfil: input.fulfil ?? "pickup", pay, not_stocked: missing, running_low: short };
}

export function setOrderStatus(orderId: number, status: "packing" | "ready" | "done") {
  const o = get("SELECT o.*, c.name AS customer FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ?", orderId);
  if (!o) throw new OpError(`No order #${orderId}.`);
  if (o.status === "done") throw new OpError(`Order #${orderId} is already handed over.`);
  run("UPDATE orders SET status = ? WHERE id = ?", status, orderId);
  if (status === "done") {
    bookSale(orderId, o.customer, o.customer_id, JSON.parse(o.lines), o.total, o.pay);
    log("sell", `${o.customer} picked up order #${orderId}`, o.pay === "udhaar" ? `${inr(o.total)} added to udhaar` : `${inr(o.total)} received on Paytm`, "owner");
  } else if (status === "ready") {
    log("sell", `Order #${orderId} for ${o.customer} is packed`, "Customer told the bag is ready");
  }
  emit({ type: "refresh" });
  return { order_id: orderId, customer: o.customer, status };
}

// A sale is final: stock goes down, the day's sales go up, the money is counted
// or put on udhaar, and the entry is owed to the billing app if one is connected.
function bookSale(orderId: number, customer: string | null, customerId: number | null, lines: any[], total: number, pay: string) {
  const t = today();
  for (const l of lines) {
    const it = l.sku ? get("SELECT id FROM items WHERE sku = ?", l.sku) : null;
    if (!it) continue;
    run("UPDATE items SET stock = MAX(0, stock - ?) WHERE id = ?", l.qty, it.id);
    run("INSERT INTO sales (day,item_id,qty) VALUES (?,?,?) ON CONFLICT(day,item_id) DO UPDATE SET qty = qty + excluded.qty", t, it.id, l.qty);
  }
  if (pay === "udhaar" && customerId) addDue(customerId, total);
  else run("UPDATE shop SET cash = cash + ? WHERE id = 1", total);
  sync.queue("sale", `TH-${orderId}`, `Bill TH-${orderId}, ${customer || "counter sale"}, ${inr(total)}`,
    { invoice: `TH-${orderId}`, date: t, customer: customer || null, paid_by: pay, total,
      lines: lines.map((l) => ({ item: l.name, sku: l.sku ?? null, qty: l.qty, unit: l.unit, rate: l.price })) });
}

// The paper pad, spoken: the owner calls out what is going into the bag and the
// bill is made on the spot. No customer name is needed for a walk-in.
export function counterSale(input: { lines: { item: string; qty: number; price?: number }[]; customer?: string; pay?: "cash" | "upi" | "udhaar"; said?: string }) {
  const c = input.customer ? findCustomer(input.customer) : null;
  if (input.customer && !c && input.pay === "udhaar") throw new OpError(`No regular called "${input.customer}", so this cannot go on udhaar.`);
  const pay = input.pay ?? "cash";
  if (pay === "udhaar" && !c) throw new OpError("Udhaar needs a customer's name.");
  const lines: any[] = []; const missing: string[] = [], short: string[] = [];
  for (const w of input.lines ?? []) {
    const qty = Number(w.qty) > 0 ? Number(w.qty) : 1;
    const it = findItem(w.item);
    if (it) {
      if (it.stock < qty) short.push(`${it.name_en} (the count said ${it.stock} ${it.unit})`);
      lines.push({ sku: it.sku, qty, name: it.name_en, name_ta: it.name_ta, name_hi: it.name_hi, unit: it.unit, price: Number(w.price) > 0 ? Number(w.price) : it.price });
    } else if (Number(w.price) > 0) lines.push({ sku: null, qty, name: String(w.item).slice(0, 40), unit: "", price: Number(w.price) }); // not in the item list, price was called out
    else missing.push(w.item);
  }
  if (!lines.length) throw new OpError(`Nothing to bill. Not in the item list and no price given: ${missing.join(", ")}.`);
  const total = Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0));
  if (pay === "udhaar") { const v = judgeCredit(c.id, total); if (v.decision !== "allow") throw new OpError(`Cannot put this on udhaar. ${v.why}`); }
  const res = run("INSERT INTO orders (customer_id,lines,total,status,fulfil,pay,channel,said,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    c?.id ?? null, JSON.stringify(lines), total, "done", "pickup", pay, "counter", input.said ?? "", nowIso());
  const id = Number(res.lastInsertRowid);
  bookSale(id, c?.name ?? null, c?.id ?? null, lines, total, pay);
  const out = lines.filter((l) => l.sku && get("SELECT stock FROM items WHERE sku = ?", l.sku).stock <= 0).map((l) => l.name);
  log("sell", `Billed ${c?.name ?? "a counter customer"} ${inr(total)}`, `Bill TH-${id}, ${lines.length} item${lines.length === 1 ? "" : "s"}, ${pay === "udhaar" ? "on udhaar" : pay === "upi" ? "paid on Paytm" : "cash"}`, "owner");
  emit({ type: "refresh" });
  return { bill_no: `TH-${id}`, order_id: id, customer: c?.name ?? null, lines, total, pay, need_a_price: missing, stock_count_was_lower: short, now_out_of_stock: out };
}

// Undoes a counter bill made by mistake, the same day: stock and money go back.
export function cancelBill(bill: string | number) {
  const id = Number(String(bill).replace(/\D+/g, ""));
  const o = get("SELECT o.*, c.name AS customer FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.id = ? AND o.channel = 'counter'", id);
  if (!o) throw new OpError(`No counter bill TH-${id}.`);
  if (dayStrOf(o.created_at) !== today()) throw new OpError(`Bill TH-${id} is from an earlier day and can no longer be cancelled.`);
  const lines = JSON.parse(o.lines);
  for (const l of lines) {
    const it = l.sku ? get("SELECT id FROM items WHERE sku = ?", l.sku) : null;
    if (!it) continue;
    run("UPDATE items SET stock = stock + ? WHERE id = ?", l.qty, it.id);
    run("UPDATE sales SET qty = MAX(0, qty - ?) WHERE day = ? AND item_id = ?", l.qty, today(), it.id);
  }
  if (o.pay === "udhaar" && o.customer_id) run("UPDATE dues SET amount = MAX(0, amount - ?) WHERE customer_id = ?", o.total, o.customer_id);
  else run("UPDATE shop SET cash = cash - ? WHERE id = 1", o.total);
  run("DELETE FROM orders WHERE id = ?", id);
  sync.queue("sale_cancelled", `TH-${id}`, `Cancelled bill TH-${id}, ${inr(o.total)}`, { invoice: `TH-${id}`, date: today(), total: o.total,
    lines: lines.map((l: any) => ({ item: l.name, sku: l.sku ?? null, qty: l.qty, unit: l.unit, rate: l.price })) });
  log("sell", `Cancelled bill TH-${id}`, `${inr(o.total)} taken back out, stock put back`, "owner");
  emit({ type: "refresh" });
  return { cancelled: `TH-${id}`, total: o.total, customer: o.customer ?? null };
}
const dayStrOf = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

// ---------- Stock ----------
export function placeRestock(input: { lines?: { item: string; qty: number }[]; scope?: "urgent" | "all_suggested" }) {
  const plan = restockPlan();
  let lines: { sku: string; name: string; qty: number; unit: string; cost: number; supplier_id: number; supplier: string }[] = [];
  if (input.lines?.length) {
    for (const w of input.lines) {
      const it = findItem(w.item);
      if (!it) throw new OpError(`"${w.item}" is not an item this shop stocks.`);
      const sup = get("SELECT name FROM suppliers WHERE id = ?", it.supplier_id)!;
      lines.push({ sku: it.sku, name: it.name_en, qty: Math.ceil(Number(w.qty) / it.pack) * it.pack, unit: it.unit, cost: it.cost, supplier_id: it.supplier_id, supplier: sup.name });
    }
  } else {
    const pick = input.scope === "all_suggested" ? plan.lines.filter((l) => l.order_qty > 0 && l.urgency !== "ok") : urgentLines(plan);
    lines = pick.map((l) => ({ sku: l.sku, name: l.name_en, qty: l.order_qty, unit: l.unit, cost: l.cost, supplier_id: l.supplier_id, supplier: l.supplier }));
  }
  if (!lines.length) throw new OpError("Nothing needs ordering right now.");
  const bySupplier = new Map<number, typeof lines>();
  for (const l of lines) bySupplier.set(l.supplier_id, [...(bySupplier.get(l.supplier_id) ?? []), l]);
  const placed: any[] = [];
  for (const [sid, ls] of bySupplier) {
    const total = Math.round(ls.reduce((s, l) => s + l.qty * l.cost, 0));
    const res = run("INSERT INTO supplier_orders (supplier_id,lines,total,created_at) VALUES (?,?,?,?)", sid, JSON.stringify(ls), total, nowIso());
    placed.push({ order_id: Number(res.lastInsertRowid), supplier: ls[0].supplier, items: ls.length, total });
    log("stock", `Ordered ${ls.length} items from ${ls[0].supplier}`, `${ls.map((l) => `${l.name} ${l.qty} ${l.unit}`).join(", ")}, ${inr(total)} on delivery`);
  }
  emit({ type: "refresh" });
  const total = placed.reduce((s, p) => s + p.total, 0);
  const cash = cashView();
  return { placed, total, cash_on_hand: cash.cash, shortfall_this_week: cash.shortfall, note: "Suppliers are paid on delivery, after the delivery is checked against the bill." };
}

export function adjustStanding(standingId: number, action: "pause" | "resume" | "cut" | "cancel", qty?: number, by = "owner") {
  const so = get(`SELECT so.*, i.name_en, i.unit, s.name AS supplier FROM standing_orders so JOIN items i ON i.id = so.item_id
                  JOIN suppliers s ON s.id = so.supplier_id WHERE so.id = ?`, standingId);
  if (!so) throw new OpError(`No standing order #${standingId}.`);
  if (action === "cut") {
    if (!qty || qty <= 0 || qty >= so.qty) throw new OpError(`To cut the order, give a quantity below ${so.qty}.`);
    run("UPDATE standing_orders SET qty = ?, status = 'active' WHERE id = ?", qty, standingId);
    log("stock", `Cut the ${so.name_en} standing order to ${qty} ${so.unit}`, `${so.supplier}, was ${so.qty} ${so.cadence}`, by);
  } else {
    const status = action === "pause" ? "paused" : action === "cancel" ? "cancelled" : "active";
    run("UPDATE standing_orders SET status = ? WHERE id = ?", status, standingId);
    log("stock", `${action === "pause" ? "Paused" : action === "cancel" ? "Cancelled" : "Resumed"} the ${so.name_en} standing order`, `${so.supplier}, ${so.qty} ${so.unit} ${so.cadence}`, by);
  }
  emit({ type: "refresh" });
  return { standing_id: standingId, item: so.name_en, supplier: so.supplier, action, qty: action === "cut" ? qty : so.qty };
}

// Runs standing-order guard rules against current leftovers. Called after any
// stock change and when a guard rule is signed.
export function applyGuards() {
  const done: any[] = [];
  for (const g of trippedGuards(standingOrderHealth())) {
    const act = g.rule.params.action as "pause" | "cut" | "cancel";
    if (act === "cut") {
      const h = standingOrderHealth().find((x) => x.id === g.standing_id)!;
      if (h.suggested_qty < h.qty) done.push(adjustStanding(g.standing_id, "cut", h.suggested_qty, "rule"));
    } else done.push(adjustStanding(g.standing_id, act, undefined, "rule"));
  }
  return done;
}

// ---------- Pay ----------
export function checkBill(billId: number) {
  const b = billsView().find((x) => x.id === billId);
  if (!b) throw new OpError(`No bill #${billId}.`);
  const problems = b.lines.filter((l: any) => l.short_qty > 0)
    .map((l: any) => ({ item: l.name_en, billed: l.billed_qty, received: l.received_qty, unit: l.unit, overcharged: l.short_amount }));
  return { bill_id: b.id, supplier: b.supplier, ref: b.ref, billed_amount: b.amount, correct_amount: b.correct_amount, overcharge: b.overcharge,
    matches_delivery: problems.length === 0, problems, due_in_days: b.due_in, status: b.status, rule_check: b.verdict };
}

function settleBill(billId: number, amount: number, via: string) {
  const b = get("SELECT b.*, s.name AS supplier FROM bills b JOIN suppliers s ON s.id = b.supplier_id WHERE b.id = ?", billId)!;
  run("UPDATE bills SET status = 'paid', paid_amount = ?, paid_at = ?, paid_via = ? WHERE id = ?", amount, nowIso(), via, billId);
  run("UPDATE shop SET cash = cash - ? WHERE id = 1", amount);
  run("UPDATE suppliers SET trusted = 1 WHERE id = ?", b.supplier_id);
  log("pay", `Paid ${b.supplier} ${inr(amount)}`, `${b.ref}, ${via}${amount < b.amount ? `, ${inr(b.amount - amount)} held back for goods not received` : ""}`, via.startsWith("Rule") ? "rule" : "owner");
  sync.queue("payment", b.ref, `Paid ${b.supplier} ${inr(amount)} for ${b.ref}`, { supplier: b.supplier, bill_ref: b.ref, date: today(), amount, billed: b.amount, held_back: Math.max(0, b.amount - amount), paid_via: via });
  emit({ type: "refresh" });
}

export function payBill(billId: number) {
  const b = billsView().find((x) => x.id === billId);
  if (!b) throw new OpError(`No bill #${billId}.`);
  if (b.status === "paid") throw new OpError(`${b.supplier}'s bill is already paid.`);
  const amount = b.correct_amount;
  const v = judgePayment(b as any, amount, shop().cash);
  if (v.decision === "refuse") return { result: "refused" as const, supplier: b.supplier, amount, why: v.why, loan_offer: loanOffer() };
  if (v.decision === "allow") {
    settleBill(billId, amount, `Rule #${v.rule.id}`);
    return { result: "paid" as const, supplier: b.supplier, amount, held_back: b.overcharge, why: v.why };
  }
  const pending = addPending("pay_bill", { bill_id: billId, amount }, `Pay ${b.supplier} ${inr(amount)}`, v.why);
  return { result: "needs_pin" as const, supplier: b.supplier, amount, held_back: b.overcharge, why: v.why, pending_id: pending };
}

export function requestLoan() {
  const offer = loanOffer();
  if (!offer.eligible) throw new OpError(offer.reason);
  const pending = addPending("take_loan", { amount: offer.amount, fee: offer.fee, daily_repay: offer.daily_repay },
    `Take a stock loan of ${inr(offer.amount)}`, `Fee ${inr(offer.fee)}, repaid at ${inr(offer.daily_repay)} a day for ${offer.days} days. A loan always needs your PIN.`);
  return { result: "needs_pin" as const, pending_id: pending, ...offer };
}

// ---------- Collect ----------
function addDue(customerId: number, amount: number) {
  const d = get("SELECT * FROM dues WHERE customer_id = ?", customerId);
  if (d) run("UPDATE dues SET amount = amount + ? WHERE id = ?", amount, d.id);
  else run("INSERT INTO dues (customer_id,amount,since_day) VALUES (?,?,?)", customerId, amount, today());
}

export async function sendReminders(input: { customer?: string; min_days?: number; language?: string }) {
  const s = shop();
  let dues = duesView();
  if (input.customer) {
    const c = findCustomer(input.customer);
    if (!c) throw new OpError(`No regular called "${input.customer}".`);
    dues = dues.filter((d) => d.customer_id === c.id);
    if (!dues.length) throw new OpError(`${c.name} owes nothing.`);
  } else if (input.min_days) dues = dues.filter((d) => d.days >= input.min_days!);
  if (!dues.length) throw new OpError("Nobody matches that.");
  const lang = ["ta-IN", "hi-IN", "en-IN"].includes(input.language ?? "") ? input.language! : s.language;
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const people: Debtor[] = dues.map((d) => {
    const paid = get("SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS v FROM due_payments WHERE customer_id = ?", d.customer_id)!;
    const orders = get("SELECT COUNT(*) AS n FROM orders WHERE customer_id = ? AND created_at >= ?", d.customer_id, monthAgo)!;
    return { customer_id: d.customer_id, name: d.customer, amount: d.amount, days: d.days, reminders_sent: d.reminders, paid_before: paid.v, payments_made: paid.n, orders_last_month: orders.n, street: d.street };
  });
  const { messages, written_by } = await writeReminders(people, lang, s);
  const sent = dues.map((d) => {
    const msg = `${messages.get(d.customer_id)} paytm.me/smstores/${d.customer_id}`;
    run("UPDATE dues SET reminders = reminders + 1, last_reminder_at = ?, last_message = ? WHERE id = ?", nowIso(), msg, d.id);
    return { customer: d.customer, amount: d.amount, days: d.days, message: msg };
  });
  log("collect", sent.length === 1 ? `Reminded ${sent[0].customer} about ${inr(sent[0].amount)}` : `Sent reminders to ${sent.length} regulars`,
    `${inr(sent.reduce((a, x) => a + x.amount, 0))} in all, each with a Paytm payment link${written_by === "claude" ? ", worded for each person" : ""}`);
  emit({ type: "refresh" });
  return { sent, total: sent.reduce((a, x) => a + x.amount, 0), written_by, note: "Messages are simulated in this prototype; nothing is sent to a real phone." };
}

export function recordDuePayment(customer: string | number, amount: number, by = "customer") {
  const c = findCustomer(customer);
  if (!c) throw new OpError(`No regular called "${customer}".`);
  const d = get("SELECT * FROM dues WHERE customer_id = ? AND amount > 0", c.id);
  if (!d) throw new OpError(`${c.name} owes nothing.`);
  const paid = Math.min(Math.round(amount), d.amount);
  if (paid <= 0) throw new OpError("Amount must be more than zero.");
  run("UPDATE dues SET amount = amount - ? WHERE id = ?", paid, d.id);
  run("INSERT INTO due_payments (customer_id,amount,at) VALUES (?,?,?)", c.id, paid, nowIso());
  run("UPDATE shop SET cash = cash + ? WHERE id = 1", paid);
  const left = d.amount - paid;
  log("collect", left === 0 ? `${c.name} cleared their udhaar` : `${c.name} paid ${inr(paid)} towards udhaar`,
    left === 0 ? `${inr(paid)} received on Paytm, debt closed` : `${inr(left)} still open`, by);
  emit({ type: "refresh" });
  emit({ type: "paid", customer: c.name, amount: paid, left });
  return { customer: c.name, paid, remaining: left, closed: left === 0 };
}

// ---------- Bills coming in: photo, billing-app export, delivery counts ----------
function matchSupplier(name: string) {
  const q = norm(name); if (!q) return null;
  const rows = all("SELECT * FROM suppliers");
  const first2 = (x: string) => x.split(" ").slice(0, 2).join(" ");
  return rows.find((r) => norm(r.name) === q) ?? rows.find((r) => q.includes(norm(r.name)) || norm(r.name).includes(q))
    ?? rows.find((r) => first2(norm(r.name)) === first2(q)) ?? null;
}

// What arrived, counted at the door. A bill from the same supplier is checked against it.
export function recordDelivery(supplier: string | number, lines: { item: string; qty: number }[]) {
  const sup = typeof supplier === "number" ? findSupplier(supplier) : matchSupplier(supplier) ?? findSupplier(supplier);
  if (!sup) throw new OpError(`No supplier called "${supplier}".`);
  const got: { sku: string; qty: number; name: string; unit: string }[] = []; const unknown: string[] = [];
  for (const l of lines ?? []) {
    const it = findItem(l.item);
    if (!it || !(Number(l.qty) > 0)) { unknown.push(l.item); continue; }
    got.push({ sku: it.sku, qty: Number(l.qty), name: it.name_en, unit: it.unit });
    run("UPDATE items SET stock = stock + ? WHERE id = ?", Number(l.qty), it.id);
  }
  if (!got.length) throw new OpError("None of those items are stocked here.");
  const res = run("INSERT INTO receipts (supplier_id,day,lines) VALUES (?,?,?)", sup.id, today(), JSON.stringify(got.map(({ sku, qty }) => ({ sku, qty }))));
  log("stock", `Counted in a delivery from ${sup.name}`, got.map((g) => `${g.name} ${g.qty} ${g.unit}`).join(", "), "owner");
  emit({ type: "refresh" });
  return { receipt_id: Number(res.lastInsertRowid), supplier: sup.name, received: got, not_stocked: unknown };
}

export function importPurchase(doc: BillDoc, source: string) {
  if (!doc.lines?.length) throw new OpError("That bill has no item lines.");
  let sup = doc.party ? matchSupplier(doc.party) : null;
  let newSupplier = false;
  if (!sup) {
    if (!doc.party) throw new OpError("The bill does not name a supplier.");
    const r = run("INSERT INTO suppliers (name,supplies,trusted,lead_days) VALUES (?,?,0,1)", doc.party.slice(0, 60), "");
    sup = get("SELECT * FROM suppliers WHERE id = ?", Number(r.lastInsertRowid)); newSupplier = true;
  }
  if (doc.ref && get("SELECT id FROM bills WHERE supplier_id = ? AND ref = ?", sup.id, doc.ref)) throw new OpError(`Bill ${doc.ref} from ${sup.name} is already in the app.`);
  const receipt = get("SELECT * FROM receipts WHERE supplier_id = ? AND bill_id IS NULL ORDER BY id DESC", sup.id);
  const got = receipt ? new Map<string, number>(JSON.parse(receipt.lines).map((l: any) => [l.sku, l.qty])) : null;
  const unmatched: string[] = [];
  const lines = doc.lines.filter((l) => l.qty > 0).map((l) => {
    const it = findItem(l.name);
    if (!it) unmatched.push(l.name);
    const received = it && got ? Math.min(l.qty, got.get(it.sku) ?? 0) : l.qty;
    return { sku: it?.sku ?? null, name: l.name, unit: l.unit ?? it?.unit ?? "", billed_qty: l.qty, received_qty: received, rate: l.rate };
  });
  const sum = Math.round(lines.reduce((a, l) => a + l.billed_qty * l.rate, 0));
  const printed = doc.total != null ? Math.round(doc.total) : sum;
  const notes: string[] = [];
  if (Math.abs(printed - sum) > 1) notes.push(`The bill says ${inr(printed)} but its lines add up to ${inr(sum)}.`);
  if (!receipt) notes.push("No delivery count on record for this supplier, so quantities could not be checked.");
  if (unmatched.length) notes.push(`Not in your item list: ${unmatched.join(", ")}.`);
  if (doc.notes) notes.push(doc.notes);
  const ref = doc.ref || `${source.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-5)}`;
  const res = run("INSERT INTO bills (supplier_id,ref,lines,amount,due_day,source,note) VALUES (?,?,?,?,?,?,?)", sup.id, ref, JSON.stringify(lines), Math.max(printed, sum), addDays(today(), 3), source, notes.join(" "));
  const id = Number(res.lastInsertRowid);
  if (receipt) run("UPDATE receipts SET bill_id = ? WHERE id = ?", id, receipt.id);
  const checked = checkBill(id);
  // A bill that came from the billing app's own file is already in that app.
  if (source === "photo" || source === "entered") sync.queue("purchase_bill", ref, `Supplier bill ${ref}, ${sup.name}, ${inr(checked.correct_amount)}`,
    { supplier: sup.name, bill_ref: ref, date: doc.date ?? today(), billed: checked.billed_amount, payable: checked.correct_amount,
      lines: lines.map((l) => ({ item: l.sku ? get("SELECT name_en FROM items WHERE sku = ?", l.sku).name_en : l.name, sku: l.sku, qty: l.received_qty, billed_qty: l.billed_qty, unit: l.unit, rate: l.rate })) });
  log("pay", `Read a bill from ${sup.name}${source === "photo" ? " from a photo" : ` from ${source}`}`,
    checked.overcharge > 0 ? `${inr(checked.billed_amount)} billed, ${inr(checked.correct_amount)} matches the delivery` : `${inr(checked.billed_amount)}, ${lines.length} items`);
  emit({ type: "refresh" });
  return { ...checked, source, new_supplier: newSupplier, checked_against_delivery: Boolean(receipt), notes };
}

function importSale(doc: BillDoc) {
  const day = doc.date ?? today(); let matched = 0; const unmatched: string[] = []; let value = 0;
  for (const l of doc.lines) {
    const it = findItem(l.name);
    if (!it || l.qty <= 0) { unmatched.push(l.name); continue; }
    run("INSERT INTO sales (day,item_id,qty) VALUES (?,?,?) ON CONFLICT(day,item_id) DO UPDATE SET qty = qty + excluded.qty", day, it.id, l.qty);
    matched++; value += l.qty * (l.rate || it.price);
  }
  return { day, matched, unmatched, value: Math.round(value) };
}

// Takes everything a billing-app export contained: purchase bills go to Pay,
// sales invoices feed the sales history the restock forecast learns from.
export function importDocs(docs: BillDoc[], source: string) {
  const bills: any[] = []; const skipped: string[] = [];
  const sales = { invoices: 0, lines: 0, value: 0, days: new Set<string>(), unmatched: new Set<string>() };
  for (const d of docs) {
    try {
      if (d.type === "sale") {
        const r = importSale(d); sales.invoices++; sales.lines += r.matched; sales.value += r.value; sales.days.add(r.day); r.unmatched.forEach((u) => sales.unmatched.add(u));
      } else bills.push(importPurchase(d, source));
    } catch (err) { if (err instanceof OpError) skipped.push(err.message); else throw err; }
  }
  if (sales.invoices) log("stock", `Imported ${sales.invoices} sales invoices from ${source}`, `${sales.lines} item lines worth ${inr(sales.value)} added to the sales history`);
  emit({ type: "refresh" });
  return { source, bills, skipped, sales: sales.invoices ? { invoices: sales.invoices, lines: sales.lines, value: sales.value, days: sales.days.size, not_stocked: [...sales.unmatched].slice(0, 12) } : null };
}

// ---------- Setting up ----------
// Links the shop to its owner. The phone check and the merchant account lookup
// are simulated; nothing here reaches Paytm.
export function onboard(input: { name?: string; owner?: string; kind?: string; locality?: string; lat?: number; lon?: number; language?: string; books?: string; pin?: string; phone?: string }) {
  const name = String(input.name || "").trim().slice(0, 60), owner = String(input.owner || "").trim().slice(0, 40);
  if (!name) throw new OpError("The shop needs a name.");
  if (input.pin != null && !/^\d{4}$/.test(String(input.pin))) throw new OpError("The PIN must be four digits.");
  const s = shop();
  const lang = ["ta-IN", "hi-IN", "en-IN"].includes(input.language!) ? input.language! : s.language;
  const at = Number.isFinite(input.lat) && Number.isFinite(input.lon) ? { lat: Number(input.lat), lon: Number(input.lon) } : { lat: s.lat, lon: s.lon };
  run("UPDATE shop SET name = ?, owner = ?, locality = ?, lat = ?, lon = ?, language = ? WHERE id = 1", name, owner || s.owner, String(input.locality || s.locality).slice(0, 60), at.lat, at.lon, lang);
  const profile = { kind: input.kind || "grocery", books: ["paper", "app", "none"].includes(input.books!) ? input.books : "paper", phone_tail: String(input.phone || "").replace(/\D/g, "").slice(-4), at: nowIso() };
  const put = (k: string, v: string) => run("INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", k, v);
  put("profile", JSON.stringify(profile));
  if (input.pin) put("pin", String(input.pin));
  log("rules", `${name} is set up`, profile.books === "paper" ? "Thunai is the bill book from today" : profile.books === "app" ? "Bills will be shared with the billing app" : "Starting the bill book from today", "owner");
  emit({ type: "refresh" });
  return { ok: true, shop: shop(), profile };
}
export const profile = () => { const r = get("SELECT value FROM settings WHERE key = 'profile'"); return r ? JSON.parse(r.value) : null; };

// ---------- Acting first ----------
// What Thunai may do unasked: only things a signed rule already allows.
export function autopilot() {
  const done: string[] = [];
  for (const b of billsView()) {
    if (b.status === "due" && b.due_in <= 0 && b.overcharge === 0 && b.verdict?.decision === "allow") {
      settleBill(b.id, b.correct_amount, `Rule #${b.verdict.rule_id}`);
      done.push(`Paid ${b.supplier} ${inr(b.correct_amount)}`);
    }
  }
  for (const g of applyGuards()) done.push(`${g.action} ${g.item} standing order`);
  return done;
}

// The morning briefing: what was done inside the rules, then what needs the owner.
export function briefing() {
  const since = new Date(Date.now() - 18 * 3600000).toISOString();
  const done = all("SELECT job, text, detail, by FROM activity WHERE at >= ? AND by IN ('rule','thunai') ORDER BY id", since)
    .map((a) => ({ job: a.job, what: a.text, detail: a.detail, authority: a.by === "rule" ? "one of the owner's signed rules" : "routine" }));
  const bills = billsView().filter((b) => b.status !== "paid");
  const plan = restockPlan(); const cash = cashView(); const look = outlook();
  const needs: { job: string; what: string; why: string }[] = [];
  for (const p of pendingView()) needs.push({ job: "rules", what: p.summary, why: `Waiting for the PIN. ${p.reason}` });
  for (const b of bills.filter((x) => x.overcharge > 0)) needs.push({ job: "pay", what: `${b.supplier} billed ${inr(b.amount)} but ${inr(b.correct_amount)} matches the delivery`,
    why: b.lines.filter((l: any) => l.short_qty > 0).map((l: any) => `${l.name_en}: billed ${l.billed_qty}, received ${l.received_qty}`).join("; ") });
  const urgent = urgentLines(plan);
  if (urgent.length) needs.push({ job: "stock", what: `${plan.lines.filter((l) => l.urgency === "today").length} items run out within two days; ordering them costs ${inr(urgent.reduce((a, l) => a + l.line_cost, 0))}`,
    why: look.festival ? `${look.festival.name} is in ${look.festival.in_days} days. Lowest: ${urgent.slice(0, 3).map((l) => `${l.name_en} (${l.days_left} days)`).join(", ")}` : urgent.slice(0, 3).map((l) => `${l.name_en} (${l.days_left} days)`).join(", ") });
  if (cash.shortfall > 0) { const o = loanOffer(); needs.push({ job: "pay", what: `Cash is short by ${inr(cash.shortfall)} for this week's bills and stock`,
    why: o.eligible ? `A stock loan of ${inr(o.amount)} is on offer (illustrative terms). It needs the PIN.` : "No loan on offer." }); }
  for (const b of bills.filter((x) => x.overcharge === 0 && x.due_in <= 1 && x.verdict?.decision === "ask")) needs.push({ job: "pay", what: `${b.supplier} ${inr(b.correct_amount)} is due ${b.due_in <= 0 ? "today" : "tomorrow"}`, why: b.verdict!.why });
  for (const s of standingOrderHealth().filter((x) => x.status === "active" && x.waste_per_week >= 300)) needs.push({ job: "stock", what: `The ${s.name_en} standing order brings ${s.surplus_per_week} ${s.unit} a week more than sells`, why: `About ${inr(s.waste_per_week)} a week. Cutting to ${s.suggested_qty} would match sales.` });
  const old = duesView().filter((d) => d.days > 30);
  if (old.length) needs.push({ job: "collect", what: `${old.length} regulars have owed for over a month, ${inr(old.reduce((a, d) => a + d.amount, 0))} in all`, why: old.map((d) => `${d.customer} ${inr(d.amount)}`).join(", ") });
  return { date: today(), done_for_you: done, needs_you: needs,
    weather: { summary: look.weather.summary, live: look.weather.live, sells_more: look.weather.items.filter((i: any) => i.pct > 0).map((i: any) => i.name_en) },
    festival: look.festival && { name: look.festival.name, in_days: look.festival.in_days, sells_most: look.festival.items.slice(0, 4).map((i: any) => `${i.name_en} ${i.lift}x`) } };
}

// ---------- Rules and PIN ----------
function addPending(kind: string, payload: any, summary: string, reason: string) {
  const res = run("INSERT INTO pending (kind,payload,summary,reason,created_at) VALUES (?,?,?,?,?)", kind, JSON.stringify(payload), summary, reason, nowIso());
  const id = Number(res.lastInsertRowid);
  emit({ type: "pin", pending: { id, kind, payload, summary, reason } });
  emit({ type: "refresh" });
  return id;
}

export function proposeRule(kind: string, params: any, spoken: string) {
  const v = validateRule(kind, params);
  if (!v.ok) throw new OpError(`That rule cannot be saved: ${v.error}.`);
  const text = spoken?.trim();
  if (!text) throw new OpError("The rule needs the owner's own words.");
  const id = addPending("add_rule", { kind, params: v.params, spoken: text }, `New rule: ${RULE_KINDS[kind as RuleKind].title}`, `"${text}"`);
  return { result: "needs_pin" as const, pending_id: id, kind, params: v.params, spoken: text, read_back: text };
}

export function proposeRuleRemoval(ruleId: number) {
  const r = get("SELECT * FROM rules WHERE id = ? AND active = 1", ruleId);
  if (!r) throw new OpError(`No active rule #${ruleId}.`);
  const id = addPending("remove_rule", { rule_id: ruleId }, `Remove a rule`, `"${r.spoken}"`);
  return { result: "needs_pin" as const, pending_id: id, spoken: r.spoken };
}

export function resolvePending(id: number, pin: string | null, approve: boolean) {
  const p = get("SELECT * FROM pending WHERE id = ? AND status = 'waiting'", id);
  if (!p) throw new OpError("That request is no longer waiting.");
  if (!approve) {
    run("UPDATE pending SET status = 'declined' WHERE id = ?", id);
    log("rules", `Owner declined: ${p.summary}`, "", "owner");
    emit({ type: "refresh" });
    return { approved: false, summary: p.summary, kind: p.kind };
  }
  if (pin !== ownerPin()) throw new OpError("Wrong PIN.");
  const payload = JSON.parse(p.payload);
  let outcome = "";
  const tx = db.transaction(() => {
    run("UPDATE pending SET status = 'approved' WHERE id = ?", id);
    if (p.kind === "pay_bill") {
      if (payload.amount > shop().cash) throw new OpError("Cash on hand no longer covers this payment.");
      settleBill(payload.bill_id, payload.amount, "Owner PIN");
      outcome = `Paid ${inr(payload.amount)}.`;
    } else if (p.kind === "add_rule") {
      run("INSERT INTO rules (kind,params,spoken,signed_at) VALUES (?,?,?,?)", payload.kind, JSON.stringify(payload.params), payload.spoken, nowIso());
      log("rules", `New rule signed with PIN`, `"${payload.spoken}"`, "owner");
      outcome = `Rule saved: "${payload.spoken}"`;
    } else if (p.kind === "remove_rule") {
      run("UPDATE rules SET active = 0 WHERE id = ?", payload.rule_id);
      log("rules", `Rule removed with PIN`, p.reason, "owner");
      outcome = "Rule removed.";
    } else if (p.kind === "take_loan") {
      run("INSERT INTO loans (amount,fee,daily_repay,purpose,taken_at) VALUES (?,?,?,?,?)", payload.amount, payload.fee, payload.daily_repay, "Festival stock", nowIso());
      run("UPDATE shop SET cash = cash + ? WHERE id = 1", payload.amount);
      log("pay", `Stock loan of ${inr(payload.amount)} taken`, `Repaid at ${inr(payload.daily_repay)} a day from Paytm settlements, illustrative terms`, "owner");
      outcome = `Loan of ${inr(payload.amount)} added to cash.`;
    }
  });
  tx();
  const guards = p.kind === "add_rule" && payload.kind === "standing_guard" ? applyGuards() : [];
  emit({ type: "refresh" });
  return { approved: true, summary: p.summary, kind: p.kind, outcome, guard_actions: guards };
}

export { upcomingFestival };
