// Getting bill data in: a photo of a paper bill (read by Claude), or a file
// exported from a billing app. Both end up as the same BillDoc, which is then
// matched to the shop's items and to what was actually delivered.
//
// File imports read Tally's XML voucher export and any CSV or Excel sheet with
// recognisable column headers. That covers the export feature of most billing
// apps without a per-app connector; live sync with an app's API is not built.
import * as XLSX from "xlsx";
import { structured } from "./llm";

export type DocLine = { name: string; qty: number; unit?: string; rate: number; amount?: number };
export type BillDoc = { type: "purchase" | "sale"; party: string; ref: string; date: string | null; lines: DocLine[]; total: number | null; notes?: string };

export class ImportError extends Error {}

// ---------- photo ----------
const BILL_TOOL = {
  name: "record_bill",
  description: "Record what is printed or written on a supplier's bill.",
  input_schema: {
    type: "object", additionalProperties: false, required: ["readable", "supplier", "ref", "lines"],
    properties: {
      readable: { type: "boolean", description: "false if this is not a bill or too blurred to read" },
      supplier: { type: "string", description: "The seller's name as printed at the top" },
      ref: { type: "string", description: "Bill or invoice number; empty string if none" },
      date: { type: "string", description: "Bill date as YYYY-MM-DD; empty string if not shown" },
      lines: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "qty", "rate"],
        properties: { name: { type: "string", description: "Item name as written, transliterated to English if in Tamil or Hindi" },
          qty: { type: "number" }, unit: { type: "string" }, rate: { type: "number", description: "Price per unit in rupees" }, amount: { type: "number" } } } },
      total: { type: "number", description: "Grand total printed on the bill" },
      notes: { type: "string", description: "Anything unclear: a smudged quantity, a total that does not add up. Empty if all clear." },
    },
  },
};

export async function readBillPhoto(image: Blob): Promise<BillDoc> {
  const type = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(image.type) ? image.type : "image/jpeg";
  const data = Buffer.from(await image.arrayBuffer()).toString("base64");
  const out = await structured<any>({
    system: `You read supplier bills for a neighbourhood grocery shop in Chennai. Bills may be printed or handwritten, in English, Tamil or a mix. Copy what is on the paper exactly: do not correct arithmetic, do not guess a quantity you cannot read. If a figure is unclear, give your best reading and say so in notes.`,
    content: [{ type: "image", source: { type: "base64", media_type: type as any, data } }, { type: "text", text: "Read this bill." }],
    tool: BILL_TOOL,
  });
  if (!out.readable || !out.lines?.length) throw new ImportError("That photo could not be read as a bill. Try again with the whole bill in frame and good light.");
  return { type: "purchase", party: String(out.supplier || "").trim(), ref: String(out.ref || "").trim(), date: out.date || null,
    lines: out.lines.map((l: any) => ({ name: String(l.name), qty: Number(l.qty) || 0, unit: l.unit, rate: Number(l.rate) || 0, amount: l.amount })),
    total: typeof out.total === "number" ? out.total : null, notes: out.notes || undefined };
}

// ---------- files ----------
const SYN: Record<string, string[]> = {
  name: ["item", "item name", "particulars", "description", "product", "product name", "stock item", "name of item", "item description"],
  qty: ["qty", "quantity", "billed qty", "actual qty", "units"],
  rate: ["rate", "price", "unit price", "price/unit", "price per unit", "mrp", "sale price", "purchase price"],
  amount: ["amount", "total", "line total", "value", "net amount", "total amount"],
  party: ["party", "party name", "supplier", "supplier name", "vendor", "vendor name", "customer", "customer name", "ledger", "name"],
  ref: ["invoice no", "invoice no.", "invoice number", "bill no", "bill no.", "bill number", "voucher no", "voucher no.", "ref", "ref no", "invoice"],
  date: ["date", "invoice date", "bill date", "voucher date"],
  type: ["type", "voucher type", "transaction type", "txn type"],
  unit: ["unit", "uom", "units of measure"],
};
const clean = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9/. ]+/g, " ").replace(/\s+/g, " ").trim();
const number = (v: unknown) => { const n = Number(String(v ?? "").replace(/[₹,\s]|rs\.?|inr/gi, "")); return isFinite(n) ? n : 0; };

function isoDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/); // day first, as Indian billing apps write it
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function fromRows(rows: unknown[][], fallback: "purchase" | "sale"): BillDoc[] {
  // The header is the first row that names both an item and a quantity.
  const idx = rows.findIndex((r) => { const c = r.map(clean); return c.some((x) => SYN.name.includes(x)) && c.some((x) => SYN.qty.includes(x)); });
  if (idx < 0) throw new ImportError("No item and quantity columns were found. The sheet needs headers such as Item, Qty, Rate, and a party or invoice number.");
  const head = rows[idx].map(clean);
  const col = (k: string) => { for (const s of SYN[k]) { const i = head.indexOf(s); if (i >= 0) return i; } return -1; };
  const c = { name: col("name"), qty: col("qty"), rate: col("rate"), amount: col("amount"), party: col("party"), ref: col("ref"), date: col("date"), type: col("type"), unit: col("unit") };
  if (c.party === c.name) c.party = head.findIndex((h, i) => i !== c.name && SYN.party.includes(h));
  const docs = new Map<string, BillDoc>();
  let last = { party: "", ref: "", date: null as string | null, type: fallback };
  for (const r of rows.slice(idx + 1)) {
    const name = String(r[c.name] ?? "").trim(); const qty = number(r[c.qty]);
    // Exports often print the party and invoice number only on an invoice's first row.
    const party = c.party >= 0 ? String(r[c.party] ?? "").trim() : ""; const ref = c.ref >= 0 ? String(r[c.ref] ?? "").trim() : "";
    const t = c.type >= 0 ? clean(r[c.type]) : "";
    if (party || ref) last = { party: party || last.party, ref: ref || last.ref, date: (c.date >= 0 ? isoDate(r[c.date]) : null) ?? last.date,
      type: t.includes("purchase") ? "purchase" : t.includes("sale") ? "sale" : fallback };
    if (!name || qty <= 0 || /^(total|grand total|sub ?total)$/i.test(name)) continue;
    const amount = c.amount >= 0 ? number(r[c.amount]) : 0;
    const rate = c.rate >= 0 ? number(r[c.rate]) : amount && qty ? amount / qty : 0;
    const key = `${last.type}|${last.party}|${last.ref}`;
    let d = docs.get(key);
    if (!d) docs.set(key, (d = { type: last.type, party: last.party, ref: last.ref, date: last.date, lines: [], total: null }));
    d.lines.push({ name, qty, rate, amount: amount || undefined, unit: c.unit >= 0 ? String(r[c.unit] ?? "").trim() || undefined : undefined });
  }
  return [...docs.values()];
}

// Tally exports vouchers as XML: one VOUCHER per bill, with the party ledger and
// an inventory entry per item.
function fromTally(xml: string, fallback: "purchase" | "sale"): BillDoc[] {
  const tag = (s: string, name: string) => { const m = s.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i")); return m ? m[1].replace(/&amp;/g, "&").trim() : ""; };
  const docs: BillDoc[] = [];
  for (const m of xml.matchAll(/<VOUCHER\b([^>]*)>([\s\S]*?)<\/VOUCHER>/gi)) {
    const attrs = m[1], body = m[2];
    const vtype = (attrs.match(/VCHTYPE="([^"]*)"/i)?.[1] || tag(body, "VOUCHERTYPENAME")).toLowerCase();
    const lines: DocLine[] = [];
    for (const e of body.matchAll(/<(ALLINVENTORYENTRIES|INVENTORYENTRIES)\.LIST>([\s\S]*?)<\/\1\.LIST>/gi)) {
      const b = e[2]; const name = tag(b, "STOCKITEMNAME"); if (!name) continue;
      const q = tag(b, "ACTUALQTY") || tag(b, "BILLEDQTY"); const qm = q.match(/([\d.]+)\s*([A-Za-z]*)/);
      lines.push({ name, qty: qm ? Number(qm[1]) : 0, unit: qm?.[2] || undefined, rate: number(tag(b, "RATE").split("/")[0]), amount: Math.abs(number(tag(b, "AMOUNT"))) || undefined });
    }
    if (!lines.length) continue;
    docs.push({ type: vtype.includes("purchase") ? "purchase" : vtype.includes("sale") ? "sale" : fallback, party: tag(body, "PARTYLEDGERNAME") || tag(body, "PARTYNAME"),
      ref: tag(body, "REFERENCE") || tag(body, "VOUCHERNUMBER"), date: isoDate(tag(body, "DATE")), lines, total: null });
  }
  if (!docs.length) throw new ImportError("No vouchers with items were found in that Tally file.");
  return docs;
}

export function parseBillFile(name: string, bytes: Uint8Array, fallback: "purchase" | "sale" = "purchase"): { format: string; docs: BillDoc[] } {
  const lower = name.toLowerCase();
  const head = new TextDecoder().decode(bytes.slice(0, 400));
  if (lower.endsWith(".xml") || /<ENVELOPE|<TALLYMESSAGE/i.test(head)) return { format: "Tally XML", docs: fromTally(new TextDecoder().decode(bytes), fallback) };
  if (lower.endsWith(".pdf")) throw new ImportError("PDF bills are not read yet. Export as Excel or CSV, or photograph the bill.");
  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(bytes, { type: "array", cellDates: true }); }
  catch { throw new ImportError("That file could not be opened. Export it as Excel (.xlsx) or CSV."); }
  const docs: BillDoc[] = []; let found = false;
  for (const sheet of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, raw: true, defval: "" });
    const guess = /sale/i.test(sheet) ? "sale" : /purchase/i.test(sheet) ? "purchase" : fallback;
    try { docs.push(...fromRows(rows, guess)); found = true; } catch (err) { if (wb.SheetNames.length === 1) throw err; }
  }
  if (!found || !docs.length) throw new ImportError("No bills with items were found in that file.");
  return { format: lower.endsWith(".csv") ? "CSV" : "Excel", docs };
}

// What the app can take bill data from today, stated plainly for the UI.
export const SOURCES = [
  { key: "photo", name: "Photo of a paper bill", how: "Point the camera at the bill. Saajhedar reads it.", works: true, needs: "claude" },
  { key: "tally", name: "Tally", how: "Export vouchers as XML and pick the file.", works: true },
  { key: "sheet", name: "Vyapar, myBillBook, Zoho Books and other billing apps", how: "Export the sales or purchase report as Excel or CSV and pick the file.", works: true },
  { key: "live", name: "Automatic sync with a billing app", how: "Not built yet. Each app needs its own agreement and connector.", works: false },
] as const;
