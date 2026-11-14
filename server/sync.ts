// Keeping another billing app in step. Most small shops have no billing app and
// Thunai's own bill book is the record. For a shop that does run one (or sends
// books to an accountant), every sale, supplier bill and payment made here is
// owed to that app, or its stock count drifts.
//
// Two ways out: a file download (Excel, CSV, or Tally's XML voucher format) and
// a live push, which POSTs each entry as signed JSON to an address the owner
// connects. Named connectors for particular billing apps are not built.
import { createHmac, randomBytes } from "node:crypto";
import * as XLSX from "xlsx";
import { all, get, run, nowIso, dayStr } from "./db";
import { emit } from "./bus";

export class SyncError extends Error {}
type Target = { name: string; url: string; secret: string; demo: boolean };

const PORT = Number(process.env.PORT || 8787);
const DEMO_URL = `http://127.0.0.1:${PORT}/api/demo-ledger/hook`;

export function target(): Target | null {
  const r = get("SELECT value FROM settings WHERE key = 'sync_target'");
  return r ? JSON.parse(r.value) : null;
}

export function connect(input: { url?: string; name?: string; demo?: boolean }) {
  let url = DEMO_URL, name = "Demo billing app";
  if (!input.demo) {
    let u: URL;
    try { u = new URL(String(input.url || "")); } catch { throw new SyncError("That is not a web address. It should start with https://"); }
    if (u.protocol !== "https:") throw new SyncError("The address must start with https:// so entries travel encrypted.");
    url = u.toString(); name = (input.name || u.hostname).slice(0, 40);
  }
  const t: Target = { name, url, secret: randomBytes(24).toString("hex"), demo: Boolean(input.demo) };
  run("INSERT INTO settings (key,value) VALUES ('sync_target',?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(t));
  run("UPDATE outbox SET status = 'waiting', tries = 0, error = '' WHERE status = 'failed'");
  flush();
  emit({ type: "refresh" });
  return { name: t.name, url: t.url, secret: t.secret };
}

export function disconnect() {
  run("DELETE FROM settings WHERE key = 'sync_target'");
  emit({ type: "refresh" });
  return { ok: true };
}

// Called by shop operations. Never throws and never waits on the network.
export function queue(kind: "sale" | "sale_cancelled" | "purchase_bill" | "payment", ref: string, title: string, data: Record<string, unknown>) {
  run("INSERT INTO outbox (at,kind,ref,title,payload) VALUES (?,?,?,?,?)", nowIso(), kind, ref, title, JSON.stringify(data));
  if (target()) queueMicrotask(flush);
}

let busy = false;
export async function flush() {
  const t = target();
  if (!t || busy) return;
  busy = true;
  try {
    for (const row of all("SELECT * FROM outbox WHERE status = 'waiting' OR (status = 'failed' AND tries < 5) ORDER BY id LIMIT 50")) {
      const body = JSON.stringify({ id: `thunai-${row.id}`, event: row.kind, at: row.at, ref: row.ref, data: JSON.parse(row.payload) });
      try {
        const res = await fetch(t.url, { method: "POST", signal: AbortSignal.timeout(8000), body,
          headers: { "Content-Type": "application/json", "User-Agent": "thunai-prototype", "X-Thunai-Event": row.kind,
            "X-Thunai-Signature": "sha256=" + createHmac("sha256", t.secret).update(body).digest("hex") } });
        if (!res.ok) throw new Error(`The billing app answered ${res.status}`);
        run("UPDATE outbox SET status = 'sent', sent_at = ?, tries = tries + 1, error = '' WHERE id = ?", nowIso(), row.id);
      } catch (err) {
        run("UPDATE outbox SET status = 'failed', tries = tries + 1, error = ? WHERE id = ?", String((err as Error).message).slice(0, 160), row.id);
      }
    }
  } finally { busy = false; }
  emit({ type: "refresh" });
}

export function retry() { run("UPDATE outbox SET status = 'waiting', tries = 0 WHERE status = 'failed'"); flush(); return status(); }

export function status() {
  const t = target();
  const n = (s: string) => get("SELECT COUNT(*) AS n FROM outbox WHERE status = ?", s).n as number;
  return { target: t ? { name: t.name, url: t.demo ? "built into this prototype" : t.url, demo: t.demo } : null,
    waiting: n("waiting"), sent: n("sent"), failed: n("failed"),
    recent: all("SELECT id, at, kind, ref, title, status, error FROM outbox ORDER BY id DESC LIMIT 6"),
    demo_ledger: t?.demo ? demoLedger() : null };
}

export function startSync() { setInterval(flush, 60_000); }

// ---------- a stand-in billing app, so the push can be seen working ----------
// It keeps its own stock count, changed only by what Thunai sends it.
const received: { at: string; event: string; ref: string }[] = [];
const stock = new Map<string, { item: string; unit: string; change: number }>();
export function demoReceive(body: any) {
  if (!body?.event || !body?.data) throw new SyncError("Not a Thunai entry.");
  if (received.some((r) => r.ref === body.ref && r.event === body.event)) return { ok: true, duplicate: true };
  received.unshift({ at: nowIso(), event: body.event, ref: body.ref });
  const sign = body.event === "sale" ? -1 : body.event === "purchase_bill" || body.event === "sale_cancelled" ? 1 : 0;
  for (const l of sign ? body.data.lines ?? [] : []) {
    const k = l.sku || l.item; const cur = stock.get(k) ?? { item: l.item, unit: l.unit || "", change: 0 };
    cur.change += sign * (l.qty ?? 0); stock.set(k, cur);
  }
  return { ok: true };
}
export function demoReset() { received.length = 0; stock.clear(); }
const demoLedger = () => ({ entries: received.length, stock: [...stock.values()].filter((s) => s.change).slice(0, 8) });

// ---------- file downloads ----------
type What = "sales" | "purchases" | "stock";
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function vouchers(what: "sales" | "purchases") {
  if (what === "sales") {
    return all(`SELECT o.*, c.name AS customer FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.status = 'done' ORDER BY o.id`).map((o) => ({
      type: "Sales", ref: `TH-${o.id}`, date: dayStr(new Date(o.created_at)), party: o.customer || "Cash sale", note: o.pay,
      lines: JSON.parse(o.lines).map((l: any) => ({ item: l.name, qty: l.qty, unit: l.unit, rate: l.price })) }));
  }
  return all(`SELECT b.*, s.name AS supplier FROM bills b JOIN suppliers s ON s.id = b.supplier_id ORDER BY b.id`).map((b) => ({
    type: "Purchase", ref: b.ref, date: b.paid_at ? dayStr(new Date(b.paid_at)) : b.due_day, party: b.supplier, note: b.status,
    lines: JSON.parse(b.lines).map((l: any) => ({ item: l.name ?? get("SELECT name_en FROM items WHERE sku = ?", l.sku)?.name_en ?? l.sku,
      qty: l.received_qty ?? l.billed_qty, unit: l.unit ?? get("SELECT unit FROM items WHERE sku = ?", l.sku)?.unit ?? "", rate: l.rate })) }));
}

export function exportFile(what: What, format: "xlsx" | "csv" | "tally"): { name: string; type: string; body: Uint8Array | string } {
  const stamp = dayStr(new Date());
  if (what === "stock") {
    if (format === "tally") throw new SyncError("The stock list downloads as Excel or CSV.");
    const rows = all("SELECT name_en AS Item, sku AS Code, category AS Category, unit AS Unit, stock AS 'Stock on hand', cost AS 'Purchase price', price AS 'Sale price' FROM items ORDER BY category, name_en");
    return sheet(rows, `thunai-stock-${stamp}`, format);
  }
  const docs = vouchers(what);
  if (!docs.length) throw new SyncError(what === "sales" ? "No bills have been made in Thunai yet." : "There are no supplier bills yet.");
  if (format === "tally") {
    const xml = `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA>\n` +
      docs.map((d) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${d.type}" ACTION="Create"><DATE>${d.date.replace(/-/g, "")}</DATE><VOUCHERTYPENAME>${d.type}</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(d.ref)}</VOUCHERNUMBER><REFERENCE>${esc(d.ref)}</REFERENCE><PARTYLEDGERNAME>${esc(d.party)}</PARTYLEDGERNAME>` +
        d.lines.map((l: any) => `<ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>${esc(l.item)}</STOCKITEMNAME><RATE>${l.rate}/${esc(l.unit)}</RATE><ACTUALQTY>${l.qty} ${esc(l.unit)}</ACTUALQTY><BILLEDQTY>${l.qty} ${esc(l.unit)}</BILLEDQTY><AMOUNT>${Math.round(l.qty * l.rate * 100) / 100}</AMOUNT></ALLINVENTORYENTRIES.LIST>`).join("") +
        `</VOUCHER></TALLYMESSAGE>`).join("\n") + `\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`;
    return { name: `thunai-${what}-${stamp}.xml`, type: "application/xml", body: xml };
  }
  const rows = docs.flatMap((d) => d.lines.map((l: any) => ({ Date: d.date, "Voucher Type": d.type, "Invoice No": d.ref, "Party Name": d.party,
    Item: l.item, Qty: l.qty, Unit: l.unit, Rate: l.rate, Amount: Math.round(l.qty * l.rate * 100) / 100, [what === "sales" ? "Paid by" : "Status"]: d.note })));
  return sheet(rows, `thunai-${what}-${stamp}`, format);
}

function sheet(rows: Record<string, unknown>[], name: string, format: "xlsx" | "csv") {
  const ws = XLSX.utils.json_to_sheet(rows);
  if (format === "csv") return { name: `${name}.csv`, type: "text/csv; charset=utf-8", body: "﻿" + XLSX.utils.sheet_to_csv(ws) };
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Thunai");
  return { name: `${name}.xlsx`, type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })) };
}
