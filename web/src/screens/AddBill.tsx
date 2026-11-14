// Bringing a bill in: photograph the paper, or import a billing-app export.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { api, inr, qty, type ImportResult, type ScanResult, type Source } from "../api";
import { IconCheck, IconClose, IconChevron } from "../icons";

// Phone photos are several megabytes; a bill reads just as well at 1600 px.
async function shrink(file: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error("encode"))), "image/jpeg", 0.85));
  } catch { return file; }
}

const Camera = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l1.6-2.5h6.8L17 8h3v11H4V8Z" /><circle cx="12" cy="13.2" r="3.4" /></svg>;
const Sheet = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></svg>;

export function AddBill() {
  const { lang, refresh, setFocus, tellAssistant, health, voice } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [imp, setImp] = useState<ImportResult | null>(null);
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [kind, setKind] = useState<"purchase" | "sale">("purchase");
  const cam = useRef<HTMLInputElement>(null); const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open && !sources.length) api.sources().then((r) => setSources(r.sources)).catch(() => {}); }, [open]); // eslint-disable-line

  const L = (en: string, ta: string, hi: string) => (lang === "ta-IN" ? ta : lang === "hi-IN" ? hi : en);
  const run = async <T,>(label: string, fn: () => Promise<T>, done: (r: T) => void) => {
    setBusy(label); setError(null); setScan(null); setImp(null);
    try { const r = await fn(); done(r); refresh(); } catch (e: any) { setError(e.message); }
    setBusy(null);
  };
  const onScan = (r: ScanResult) => {
    setScan(r); setFocus({ bill_id: r.bill_id });
    // If the owner is in a voice session, Thunai says what it found.
    if (voice !== "off") tellAssistant(`The owner photographed a supplier bill and it was read. ${r.supplier}, bill ${r.ref}: billed ${r.billed_amount} rupees, ${r.correct_amount} rupees matches the delivery count.${r.problems.length ? ` Problems: ${r.problems.map((p) => `${p.item} billed ${p.billed}, received ${p.received}`).join("; ")}.` : " It matches the delivery."}${r.new_supplier ? " This is a supplier never paid before." : ""} Bill id ${r.bill_id}. Tell the owner what you found and offer to pay the correct amount.`);
  };
  const photo = (f: File | null) => run(L("Reading the bill", "பில்லைப் படிக்கிறேன்", "बिल पढ़ रहा हूँ"), async () => api.scanBill(f ? await shrink(f) : null), onScan);
  const importIt = (f: File | string, k = kind) => run(L("Importing", "இறக்குமதி செய்கிறேன்", "इंपोर्ट हो रहा है"), () => api.importFile(f, k), (r) => { setImp(r); setOpen(false); if (r.bills[0]) setFocus({ bill_id: r.bills[0].bill_id }); });

  return (
    <section className="card addbill">
      <h2 className="card-title">{L("Add a bill", "பில் சேர்க்க", "बिल जोड़ें")}</h2>
      <div className="btn-row">
        <button className="btn btn-primary" onClick={() => cam.current?.click()} disabled={!!busy}><Camera /> {L("Photograph it", "புகைப்படம் எடு", "फ़ोटो लें")}</button>
        <button className="btn btn-outline" onClick={() => setOpen(true)} disabled={!!busy}><Sheet /> {L("From billing app", "பில்லிங் ஆப்பிலிருந்து", "बिलिंग ऐप से")}</button>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) photo(f); }} />
      <input ref={file} type="file" accept=".csv,.xlsx,.xls,.xml,text/csv,application/xml" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importIt(f); }} />
      <button className="link" onClick={() => photo(null)} disabled={!!busy}>{L("Try with a sample paper bill", "மாதிரி பில்லுடன் முயற்சி செய்", "नमूना बिल से आज़माएँ")}</button>
      {health && !health.claude && <p className="fine">Reading a photo needs the Claude key. File imports work without it.</p>}

      {busy && <p className="working"><span className="spinner" /> {busy}…</p>}
      {error && <p className="warn-line">{error}</p>}

      {scan && (
        <div className="scan">
          <p className="scan-head"><IconCheck /> {L("Read", "படித்தது", "पढ़ लिया")}: <strong>{scan.supplier}</strong>, {scan.ref}</p>
          {scan.problems.length > 0 ? (
            <div className="mismatch">
              <p className="mismatch-title">{L("Billed", "பில்", "बिल")} {inr(scan.billed_amount)}, {L("delivered", "வந்தது", "आया")} {inr(scan.correct_amount)}</p>
              {scan.problems.map((p) => <p key={p.item} className="mismatch-line">{p.item}: billed {qty(p.billed)}, received {qty(p.received)} {p.unit}. {inr(p.overcharged)} too much.</p>)}
            </div>
          ) : <p className="ok-line"><IconCheck /> {inr(scan.billed_amount)}{scan.checked_against_delivery ? `, ${L("matches the delivery", "டெலிவரியுடன் பொருந்துகிறது", "डिलीवरी से मेल खाता है")}` : ""}</p>}
          {scan.notes.map((n) => <p key={n} className="fine">{n}</p>)}
        </div>
      )}
      {imp && (
        <div className="scan">
          <p className="scan-head"><IconCheck /> {L("Imported from", "இறக்குமதி:", "इंपोर्ट:")} {imp.format}</p>
          {imp.bills.map((b) => <p key={b.bill_id} className="ok-line">{b.supplier}, {b.ref}: {inr(b.billed_amount)}{b.overcharge > 0 ? `, ${inr(b.overcharge)} not delivered` : ""}</p>)}
          {imp.sales && <p className="ok-line">{imp.sales.invoices} sales invoices, {imp.sales.lines} item lines, {inr(imp.sales.value)}. The restock forecast now uses them.</p>}
          {imp.sales?.not_stocked.length ? <p className="fine">Not in your item list: {imp.sales.not_stocked.join(", ")}.</p> : null}
          {imp.skipped.map((s) => <p key={s} className="fine">{s}</p>)}
        </div>
      )}

      {open && (
        <div className="sheet-scrim" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            <div className="sheet-top"><h2 className="pin-title">{L("Bring bills in from a billing app", "பில்லிங் ஆப்பிலிருந்து பில்களைக் கொண்டு வர", "बिलिंग ऐप से बिल लाएँ")}</h2>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><IconClose /></button></div>
            <div className="seg" role="group" aria-label="What the file holds">
              <button className={`seg-btn ${kind === "purchase" ? "on" : ""}`} onClick={() => setKind("purchase")}>{L("Supplier bills", "சப்ளையர் பில்கள்", "सप्लायर बिल")}</button>
              <button className={`seg-btn ${kind === "sale" ? "on" : ""}`} onClick={() => setKind("sale")}>{L("My sales", "என் விற்பனை", "मेरी बिक्री")}</button>
            </div>
            <ul className="sources">
              {sources.filter((s) => s.key !== "photo").map((s) => (
                <li key={s.key}>
                  <button className="source" disabled={!s.works} onClick={() => file.current?.click()}>
                    <span className="row-main"><span className="row-title">{s.name}</span><span className="row-detail">{s.how}</span></span>
                    {s.works ? <IconChevron /> : <span className="chip">{L("Not yet", "இன்னும் இல்லை", "अभी नहीं")}</span>}
                  </button>
                </li>
              ))}
            </ul>
            <p className="menu-label">{L("No export at hand? Try a sample file", "கோப்பு இல்லையா? மாதிரியை முயற்சி செய்யுங்கள்", "फ़ाइल नहीं है? नमूना आज़माएँ")}</p>
            <div className="btn-row">
              <button className="btn btn-quiet" onClick={() => importIt("tally-purchase.xml", "purchase")}>Tally purchase</button>
              <button className="btn btn-quiet" onClick={() => importIt("sales-export.csv", "sale")}>Sales sheet</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
