// Typed access to the server.
export type Lang = "ta-IN" | "hi-IN" | "en-IN";
export type Screen = "home" | "sell" | "stock" | "pay" | "collect" | "rules" | "area";

export type OrderLine = { sku: string; qty: number; name: string; name_ta?: string; name_hi?: string; unit: string; price: number };
export type Order = { id: number; customer: string | null; street: string | null; channel: string; lines: OrderLine[]; total: number; status: "new" | "packing" | "ready" | "done";
  fulfil: "pickup" | "parcel"; pay: string; said: string; created_at: string };
export type KindLite = { key: string; label: string; ta: string; hi: string; color: string };
export type FitKind = KindLite & { here: number; expected: number; peer_have: number; nearest_m: number | null; level: "thin" | "crowded" | "typical";
  setup_lakh: [number, number] | null; within_budget: boolean | null; streets: { name: string; n: number }[] };
export type Fit = { lat: number; lon: number; radius_m: number; locality: string; locality_ta: string; total_listed: number; confidence: "good" | "fair" | "low"; budget: number | null;
  chosen: FitKind | null; options: FitKind[]; crowded: { label: string; ta: string; hi: string; here: number; expected: number }[];
  anchors: { key: string; n: number; names: string[] }[]; peers: string[]; caveat: string; setup_cost_note: string };
export type SyncStatus = { target: { name: string; url: string; demo: boolean } | null; waiting: number; sent: number; failed: number;
  recent: { id: number; at: string; kind: "sale" | "sale_cancelled" | "purchase_bill" | "payment"; ref: string; title: string; status: "waiting" | "sent" | "failed"; error: string }[];
  demo_ledger: { entries: number; stock: { item: string; unit: string; change: number }[] } | null };
export type Reason = { code: string; text: string; value?: number; days?: number };
export type WeatherDay = { day: string; kind: "rain" | "heavy_rain" | "cloud" | "sun" | "hot"; tmax: number; tmin: number; rain_mm: number; rain_pct: number };
type Named = { sku: string; name_en: string; name_ta: string; name_hi: string };
export type OutlookT = { weather: { live: boolean; source: string; now: { temp: number; kind: WeatherDay["kind"] } | null; days: WeatherDay[]; rainy_days: number; hot_days: number; first_rain: string | null; summary: string; items: (Named & { pct: number; days_left: number })[] };
  festival: { name: string; name_ta: string; name_hi: string; day: string; in_days: number; items: (Named & { lift: number; days_left: number; stock: number; unit: string; order_qty: number })[] } | null };
export type Briefing = { done_for_you: { job: string; what: string; detail: string; authority: string }[]; needs_you: { job: string; what: string; why: string }[] };
export type Shortlist = { budget: number | null; options: { key: string; label: string; ta: string; hi: string; color: string; setup_lakh: [number, number]; why: string; watch_out: string }[] };
export type ScanResult = { bill_id: number; supplier: string; ref: string; billed_amount: number; correct_amount: number; overcharge: number; matches_delivery: boolean;
  problems: { item: string; billed: number; received: number; unit: string; overcharged: number }[]; new_supplier: boolean; checked_against_delivery: boolean; notes: string[]; source: string };
export type ImportResult = { format: string; bills: ScanResult[]; skipped: string[]; sales: { invoices: number; lines: number; value: number; days: number; not_stocked: string[] } | null };
export type Source = { key: string; name: string; how: string; works: boolean; needs?: string };
export type RestockLine = { item_id: number; sku: string; name_en: string; name_ta: string; name_hi: string; unit: string; stock: number; daily: number; days_left: number;
  order_qty: number; cost: number; line_cost: number; supplier: string; urgency: "today" | "this_week" | "ok"; reasons: Reason[] };
export type Standing = { id: number; name_en: string; name_ta: string; name_hi: string; unit: string; supplier: string; qty: number; cadence: string; status: string;
  daily: number; per_day: number; leftover: number; surplus_per_week: number; waste_per_week: number; suggested_qty: number; note: string };
export type BillLine = { sku: string; name_en: string; name_ta: string; name_hi: string; unit: string; billed_qty: number; received_qty: number; rate: number; short_qty: number; short_amount: number };
export type Bill = { id: number; supplier: string; trusted: number; ref: string; lines: BillLine[]; amount: number; correct_amount: number; overcharge: number; due_in: number;
  status: "due" | "paid" | "held"; source: string; note: string; paid_amount: number | null; paid_via: string | null; verdict: { decision: "allow" | "ask" | "refuse"; why: string; rule_id: number | null } | null };
export type Due = { id: number; customer_id: number; customer: string; phone: string; street: string; amount: number; days: number; reminders: number; last_message: string | null; last_reminder_at: string | null };
export type Rule = { id: number; kind: string; params: any; spoken: string; signed_at: string; job: "pay" | "stock" | "collect"; title: string };
export type Pending = { id: number; kind: string; payload: any; summary: string; reason: string };
export type Activity = { id: number; at: string; job: string; text: string; detail: string; by: string };
export type Customer = { id: number; name: string; phone: string; street: string; usual: { sku: string; qty: number }[] };
export type LoanOffer = { eligible: boolean; reason?: string; amount?: number; fee?: number; days?: number; daily_repay?: number; shortfall?: number; basis?: string; note?: string };

export type State = {
  overview: { shop: { name: string; owner: string; locality: string; lat: number; lon: number; cash: number; language: Lang }; date: string;
    sell: { waiting: number; packing: number; ready: number; yesterday_sales: number };
    stock: { urgent: number; this_week: number; festival: { name: string; name_ta: string; name_hi: string; in_days: number } | null; weather: string };
    pay: { cash: number; bills_open: number; bills_due_soon: number; shortfall: number };
    collect: { total: number; people: number }; pending: number };
  orders: Order[];
  plan: { lines: RestockLine[]; total: number; festival: any; weather: { summary: string } };
  standing: Standing[];
  guards: any[];
  bills: Bill[];
  cash: { cash: number; bills_due_soon: number; restock_cost: number; shortfall: number; udhaar_out: number; loan: any };
  loan_offer: LoanOffer;
  outlook: OutlookT; briefing: Briefing; sync: SyncStatus;
  dues: Due[]; rules: Rule[]; pending: Pending[]; customers: Customer[]; activity: Activity[];
  items: { id: number; sku: string; name_en: string; name_ta: string; name_hi: string; category: string; unit: string; price: number; stock: number }[];
  supplier_orders: { id: number; supplier: string; lines: any[]; total: number; created_at: string }[];
};

export type AreaKind = { key: string; label: string; ta: string; hi: string; color: string; openable: boolean; count: number; expected: number; peer_have: number;
  nearest_m: number | null; gap: number; level: "thin" | "crowded" | "typical" };
export type AreaReport = { lat: number; lon: number; radius_m: number; locality: string; locality_ta: string; total_listed: number; per_km2: number; kinds: AreaKind[];
  gaps: AreaKind[]; crowded: AreaKind[]; streets: { name: string; count: number; top: { key: string; label: string; color: string; n: number }[] }[]; off_street: number;
  anchors: { key: string; n: number; names: string[] }[]; peers: string[]; confidence: "good" | "fair" | "low"; caveat: string; sources: string[] };
export type AreaMap = { box: { w: number; e: number; s: number; n: number }; roads: [number, string, number[]][]; water: number[][]; park: number[][]; rail: number[][]; coast: number[][];
  places: [number, number, number, number, string, string][]; kinds: { key: string; label: string; color: string }[]; anchors: string[] };
export type AreaHit = { label: string; ta?: string; type: "locality" | "street"; lat: number; lon: number };

export type TurnEvent =
  | { type: "heard"; text: string; lang: Lang }
  | { type: "empty" }
  | { type: "tool"; name: string; screen?: Screen; focus?: Record<string, any>; ok: boolean }
  | { type: "say"; text: string; lang: Lang }
  | { type: "audio"; seq: number; last: boolean; b64: string; mime: string }
  | { type: "audio_error"; message: string }
  | { type: "error"; message: string; detail?: string }
  | { type: "done" };

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error || `Request failed (${res.status})`);
  return data as T;
}
const form = <T,>(path: string, fields: Record<string, string | Blob>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.append(k, v as any); return req<T>(path, { method: "POST", body: f }); };
const post = <T,>(path: string, body: unknown = {}) => req<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  health: () => req<{ sarvam: boolean; claude: boolean; model: string; area: { ready: boolean; counts?: Record<string, number>; sources?: string[] } }>("/api/health"),
  state: () => req<State>("/api/state"),
  orderStatus: (id: number, status: string) => post(`/api/orders/${id}/status`, { status }),
  restock: (body: { scope?: string; lines?: { item: string; qty: number }[] }) => post<{ placed: { supplier: string; items: number; total: number }[]; total: number }>("/api/restock", body),
  standing: (id: number, action: string, qty?: number) => post(`/api/standing/${id}`, { action, qty }),
  payBill: (id: number) => post<{ result: "paid" | "needs_pin" | "refused"; why: string; amount: number; supplier: string }>(`/api/bills/${id}/pay`),
  loan: () => post("/api/loan"),
  remind: (body: { customer?: string; min_days?: number; language?: Lang }) => post<{ sent: { customer: string; amount: number; message: string }[] }>("/api/dues/remind", body),
  duePay: (customer: string | number, amount: number, by = "customer") => post("/api/dues/pay", { customer, amount, by }),
  pending: (id: number, pin: string | null, approve: boolean) => post<{ approved: boolean; summary: string; kind: string; outcome?: string; guard_actions?: any[] }>(`/api/pending/${id}`, { pin, approve }),
  removeRule: (id: number) => post(`/api/rules/${id}/remove`),
  reset: () => post("/api/reset"),
  counterSale: (body: { lines: { item: string; qty: number; price?: number }[]; pay?: string; customer?: string }) => post<{ bill_no: string; order_id: number; total: number; lines: OrderLine[] }>("/api/bills/counter", body),
  kinds: () => req<KindLite[]>("/api/area/kinds"),
  areaFit: (lat: number, lon: number, r: number, kind: string | null, budget: number | null) => req<Fit>(`/api/area/fit?lat=${lat}&lon=${lon}&r=${r}${kind ? `&kind=${kind}` : ""}${budget ? `&budget=${budget}` : ""}`),
  onboard: (body: Record<string, unknown>) => post<{ ok: boolean }>("/api/onboard", body),
  cancelBill: (id: number) => post(`/api/bills/counter/${id}/cancel`),
  syncConnect: (body: { url?: string; demo?: boolean }) => post<{ name: string }>("/api/billing/sync/connect", body),
  syncDisconnect: () => post("/api/billing/sync/disconnect"),
  syncRetry: () => post("/api/billing/sync/retry"),
  sources: () => req<{ sources: Source[]; claude: boolean }>("/api/billing/sources"),
  scanBill: (image: Blob | null) => form<ScanResult>("/api/billing/scan", image ? { image } : { sample: "1" }),
  importFile: (file: File | string, kind: "purchase" | "sale") => form<ImportResult>("/api/billing/import", typeof file === "string" ? { sample: file, kind } : { file, kind }),
  tts: (text: string, lang: Lang) => post<{ b64: string }>("/api/tts", { text, lang }),
  usual: (id: number) => req<{ usual: (OrderLine & { in_stock: boolean })[]; total: number }>(`/api/customers/${id}/usual`),
  areaSearch: (q: string, near?: { lat: number; lon: number }) => req<AreaHit[]>(`/api/area/search?q=${encodeURIComponent(q)}${near ? `&lat=${near.lat}&lon=${near.lon}` : ""}`),
  areaReport: (lat: number, lon: number, r: number) => req<AreaReport>(`/api/area/report?lat=${lat}&lon=${lon}&r=${r}`),
  areaMap: (lat: number, lon: number, r: number) => req<AreaMap>(`/api/area/map?lat=${lat}&lon=${lon}&r=${r}`),
};

// Runs one assistant turn and feeds events to the caller as they arrive.
export async function turn(input: { audio?: Blob; text?: string; event?: string; session: string; persona: "owner" | "customer"; customerId?: number; lang?: Lang | "unknown"; speak?: boolean },
  onEvent: (e: TurnEvent) => void, signal?: AbortSignal) {
  let res: Response;
  if (input.audio) {
    const form = new FormData();
    form.append("audio", input.audio, "speech.wav");
    form.append("session", input.session); form.append("persona", input.persona);
    if (input.customerId) form.append("customer_id", String(input.customerId));
    form.append("lang", input.lang ?? "unknown");
    if (input.speak === false) form.append("audio_out", "0");
    res = await fetch("/api/voice", { method: "POST", body: form, signal });
  } else {
    res = await fetch("/api/text", { method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ text: input.text, event: input.event, session: input.session, persona: input.persona, customer_id: input.customerId, lang: input.lang, audio_out: input.speak !== false }) });
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    onEvent({ type: "error", message: (data as any).error || `The server did not answer (${res.status}).` });
    return;
  }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (line) { try { onEvent(JSON.parse(line)); } catch {} }
    }
  }
}

export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
export const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
