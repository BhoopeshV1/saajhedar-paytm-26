// The rules engine. Plain code, no model. The assistant proposes actions; this
// file decides whether they run, wait for the owner's PIN, or are refused.
// The assistant has no way to add, change or remove a rule without a PIN.
import { all, get } from "./db";

export type RuleKind = "order_limit" | "pay_limit" | "new_supplier" | "standing_guard" | "credit_limit";
export type Rule = { id: number; kind: RuleKind; params: any; spoken: string; active: number; signed_at: string };

export const RULE_KINDS: Record<RuleKind, { job: "pay" | "stock" | "collect"; title: string }> = {
  order_limit: { job: "stock", title: "Phone orders" },
  pay_limit: { job: "pay", title: "Spending limit" },
  new_supplier: { job: "pay", title: "New suppliers" },
  standing_guard: { job: "stock", title: "Standing orders" },
  credit_limit: { job: "collect", title: "Udhaar limit" },
};

export function activeRules(): Rule[] {
  return all("SELECT * FROM rules WHERE active = 1 ORDER BY id").map((r) => ({ ...r, params: JSON.parse(r.params) })) as Rule[];
}

export type Verdict =
  | { decision: "allow"; rule: Rule; why: string }
  | { decision: "ask"; rule: Rule | null; why: string }
  | { decision: "refuse"; rule: Rule | null; why: string };

// May this supplier bill be paid without asking the owner?
export function judgePayment(bill: { supplier_id: number; amount: number; supplier: string; trusted: number }, payAmount: number, cash: number): Verdict {
  const rules = activeRules();
  if (payAmount > cash)
    return { decision: "refuse", rule: null, why: `Cash on hand is ₹${cash.toLocaleString("en-IN")}, which does not cover ₹${payAmount.toLocaleString("en-IN")}.` };

  const blockNew = rules.find((r) => r.kind === "new_supplier");
  if (!bill.trusted && blockNew)
    return { decision: "ask", rule: blockNew, why: `${bill.supplier} is a new supplier. Your rule: "${blockNew.spoken}"` };

  // The most specific limit wins: a limit for this supplier, else a general one.
  const limits = rules.filter((r) => r.kind === "pay_limit");
  const limit = limits.find((r) => r.params.supplier_id === bill.supplier_id) ?? limits.find((r) => r.params.supplier_id == null);
  if (!limit) return { decision: "ask", rule: null, why: `There is no spending rule for ${bill.supplier}, so this needs your PIN.` };
  if (payAmount <= limit.params.max_amount)
    return { decision: "allow", rule: limit, why: `Inside your limit of ₹${Number(limit.params.max_amount).toLocaleString("en-IN")}. Your rule: "${limit.spoken}"` };
  return { decision: "ask", rule: limit, why: `₹${payAmount.toLocaleString("en-IN")} is above your limit of ₹${Number(limit.params.max_amount).toLocaleString("en-IN")}. Your rule: "${limit.spoken}"` };
}

// May Saajhedar phone this supplier and place an order of this size unasked?
export function judgeOrder(supplierId: number, supplier: string, total: number): Verdict {
  const limits = activeRules().filter((r) => r.kind === "order_limit");
  const limit = limits.find((r) => r.params.supplier_id === supplierId) ?? limits.find((r) => r.params.supplier_id == null);
  const amt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
  if (!limit) return { decision: "ask", rule: null, why: `There is no ordering rule for ${supplier}, so this call needs your PIN.` };
  if (total <= limit.params.max_amount) return { decision: "allow", rule: limit, why: `Inside your ordering limit of ${amt(limit.params.max_amount)}. Your rule: "${limit.spoken}"` };
  return { decision: "ask", rule: limit, why: `${amt(total)} is above your ordering limit of ${amt(limit.params.max_amount)}. Your rule: "${limit.spoken}"` };
}

// May this customer take more goods on credit?
export function judgeCredit(customerId: number, extra: number): Verdict {
  const rule = activeRules().find((r) => r.kind === "credit_limit");
  const owed = (get("SELECT COALESCE(SUM(amount),0) AS a FROM dues WHERE customer_id = ?", customerId)?.a ?? 0) as number;
  if (!rule) return { decision: "ask", rule: null, why: "There is no udhaar rule yet, so the owner decides." };
  if (owed + extra > rule.params.max_due)
    return { decision: "refuse", rule, why: `They already owe ₹${owed.toLocaleString("en-IN")}. Your rule: "${rule.spoken}"` };
  return { decision: "allow", rule, why: `Total would be ₹${(owed + extra).toLocaleString("en-IN")}, inside your limit of ₹${Number(rule.params.max_due).toLocaleString("en-IN")}.` };
}

// Standing-order guards that have tripped, given current leftovers.
export function trippedGuards(health: { id: number; item_id: number; leftover: number; name_en: string; status: string }[]) {
  const out: { rule: Rule; standing_id: number; item: string; leftover: number }[] = [];
  for (const r of activeRules().filter((r) => r.kind === "standing_guard")) {
    const so = health.find((h) => h.item_id === r.params.item_id && h.status === "active");
    if (so && so.leftover > r.params.leftover_gt) out.push({ rule: r, standing_id: so.id, item: so.name_en, leftover: so.leftover });
  }
  return out;
}

// Validates a rule the assistant drafted from the owner's speech.
export function validateRule(kind: string, params: any): { ok: true; params: any } | { ok: false; error: string } {
  const num = (v: any) => (typeof v === "number" && isFinite(v) && v >= 0 ? v : null);
  switch (kind) {
    case "order_limit":
    case "pay_limit": {
      const max = num(params?.max_amount);
      if (max == null || max > 200000) return { ok: false, error: "max_amount must be a rupee amount up to 2,00,000" };
      const sid = params?.supplier_id ?? null;
      if (sid != null && !get("SELECT id FROM suppliers WHERE id = ?", sid)) return { ok: false, error: "unknown supplier_id" };
      return { ok: true, params: { supplier_id: sid, max_amount: Math.round(max) } };
    }
    case "new_supplier": return { ok: true, params: {} };
    case "standing_guard": {
      const gt = num(params?.leftover_gt);
      if (gt == null) return { ok: false, error: "leftover_gt must be a number" };
      if (!get("SELECT id FROM items WHERE id = ?", params?.item_id)) return { ok: false, error: "unknown item_id" };
      const action = ["pause", "cut", "cancel"].includes(params?.action) ? params.action : "pause";
      return { ok: true, params: { item_id: params.item_id, leftover_gt: gt, action } };
    }
    case "credit_limit": {
      const max = num(params?.max_due);
      if (max == null || max > 100000) return { ok: false, error: "max_due must be a rupee amount up to 1,00,000" };
      return { ok: true, params: { max_due: Math.round(max) } };
    }
    default: return { ok: false, error: `unknown rule kind "${kind}"` };
  }
}
