// The shop's bill book: bills the owner calls out at the counter, and the way
// to pass them on to a billing app or an accountant for shops that have one.
import { useState } from "react";
import { useApp } from "../store";
import { api, inr, qty } from "../api";
import { IconCheck, IconClose, IconChevron } from "../icons";

const KIND = { sale: "Sale", sale_cancelled: "Cancelled sale", purchase_bill: "Supplier bill", payment: "Payment" } as const;

export function BillBook() {
  const { state, lang, act, toast, focus, health } = useApp();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  if (!state) return null;
  const L = (en: string, ta: string, hi: string) => (lang === "ta-IN" ? ta : lang === "hi-IN" ? hi : en);
  const day = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const bills = state.orders.filter((o) => o.status === "done" && new Date(Date.parse(o.created_at) + 5.5 * 3600 * 1000).toISOString().slice(0, 10) === day)
    .sort((a, b) => b.id - a.id);
  const sum = bills.reduce((s, o) => s + o.total, 0);
  const sy = state.sync;
  const sample = () => act(() => api.counterSale({ lines: [{ item: "sugar", qty: 1 }, { item: "tea", qty: 1 }, { item: "milk", qty: 2 }], pay: "cash" }))
    .then((r) => { if (r) toast({ title: `${L("Bill", "பில்", "बिल")} ${r.bill_no}: ${inr(r.total)}`, body: `${r.lines.length} ${L("items, stock updated", "பொருட்கள், இருப்பு புதுப்பிக்கப்பட்டது", "आइटम, स्टॉक अपडेट हुआ")}`, tone: "good" }); });
  const payLabel = (p: string) => (p === "udhaar" ? L("udhaar", "கடன்", "उधार") : p === "upi" ? "Paytm" : L("cash", "ரொக்கம்", "नकद"));

  return (
    <section className="card">
      <div className="billbook-head">
        <h2 className="card-title">{L("Today's bill book", "இன்றைய பில் புத்தகம்", "आज की बिल बुक")}</h2>
        <span className="billbook-sum">{inr(sum)}</span>
      </div>
      <p className="hint">{L("Call out what goes in the bag: “one kilo sugar, two Parle-G, cash”. Saajhedar writes the bill and takes it out of stock.",
        "பையில் போடுவதைச் சொல்லுங்கள்: “ஒரு கிலோ சர்க்கரை, இரண்டு பார்லே-ஜி, ரொக்கம்”. சாஜேதார் பில் எழுதி இருப்பைக் குறைக்கும்.",
        "थैले में जो जा रहा है बोलिए: “एक किलो चीनी, दो पारले-जी, नकद”। साझेदार बिल बनाकर स्टॉक घटा देगा।")}</p>
      {bills.length === 0 ? <p className="empty">{L("No bills yet today.", "இன்று இன்னும் பில் இல்லை.", "आज अभी कोई बिल नहीं।")}</p> : (
        <ul className="bills">
          {bills.slice(0, 6).map((o) => (
            <li key={o.id} className={focus?.order_id === o.id ? "focus" : ""}>
              <span className="row-title">TH-{o.id} <span className="muted">{o.customer ?? L("Counter", "கவுண்டர்", "काउंटर")}</span></span>
              <span className="bill-amt">{inr(o.total)}</span>
              <span className="row-detail">{o.lines.map((l) => `${l.name} ${qty(l.qty)}${l.unit ? " " + l.unit : ""}`).join(", ")} ({payLabel(o.pay)}){o.channel === "counter" && <> <button className="link-inline" onClick={() => act(() => api.cancelBill(o.id))}>{L("Cancel", "ரத்து", "रद्द")}</button></>}</span>
            </li>
          ))}
        </ul>
      )}
      {bills.length > 6 && <p className="fine">{bills.length - 6} more today.</p>}
      <button className="link" onClick={sample}>{L("Make a sample bill without speaking", "பேசாமல் மாதிரி பில் உருவாக்கு", "बिना बोले नमूना बिल बनाएँ")}</button>
      {health && !health.claude && <p className="fine">Speaking a bill needs the Claude and Sarvam keys.</p>}

      <button className="source" onClick={() => setOpen(true)}>
        <span className="row-main"><span className="row-title">{L("Billing app or accountant", "பில்லிங் ஆப் அல்லது கணக்காளர்", "बिलिंग ऐप या अकाउंटेंट")}</span>
          <span className="row-detail">{sy.target ? `${L("Sending to", "அனுப்புகிறது:", "भेज रहा है:")} ${sy.target.name}. ${sy.sent} ${L("sent", "அனுப்பப்பட்டது", "भेजे गए")}${sy.failed ? `, ${sy.failed} ${L("failed", "தோல்வி", "विफल")}` : ""}`
            : L("Not needed if this is your only bill book. Use it to send bills elsewhere.", "இதுவே உங்கள் பில் புத்தகம் என்றால் தேவையில்லை.", "अगर यही आपकी बिल बुक है तो ज़रूरत नहीं।")}</span></span>
        <IconChevron />
      </button>

      {open && (
        <div className="sheet-scrim" onClick={() => setOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grip" />
            <div className="sheet-top"><h2 className="pin-title">{L("Send bills out", "பில்களை வெளியே அனுப்ப", "बिल बाहर भेजें")}</h2>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close"><IconClose /></button></div>

            <p className="menu-label">{L("Download", "பதிவிறக்கு", "डाउनलोड")}</p>
            <div className="dl-row">
              <a className="btn btn-quiet" href="/api/billing/export?what=sales&format=xlsx" download>Sales, Excel</a>
              <a className="btn btn-quiet" href="/api/billing/export?what=sales&format=tally" download>Sales, Tally XML</a>
              <a className="btn btn-quiet" href="/api/billing/export?what=purchases&format=xlsx" download>Supplier bills, Excel</a>
              <a className="btn btn-quiet" href="/api/billing/export?what=purchases&format=tally" download>Supplier bills, Tally XML</a>
              <a className="btn btn-quiet" href="/api/billing/export?what=stock&format=xlsx" download>Stock list, Excel</a>
            </div>

            <p className="menu-label">{L("Send each entry as it happens", "ஒவ்வொரு பதிவையும் உடனே அனுப்பு", "हर एंट्री तुरंत भेजें")}</p>
            {sy.target ? (
              <div className="stack">
                <p className="ok-line"><IconCheck /> {sy.target.name} ({sy.target.url})</p>
                <div className="btn-row">
                  {sy.failed > 0 && <button className="btn btn-outline" onClick={() => act(() => api.syncRetry())}>Send {sy.failed} again</button>}
                  <button className="btn btn-quiet" onClick={() => act(() => api.syncDisconnect())}>Disconnect</button>
                </div>
              </div>
            ) : (
              <div className="stack">
                <input className="field" inputMode="url" placeholder="https://your-billing-app.example/hook" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Address to send entries to" />
                <div className="btn-row">
                  <button className="btn btn-primary" disabled={!url.trim()} onClick={() => act(() => api.syncConnect({ url: url.trim() }))}>Connect</button>
                  <button className="btn btn-outline" onClick={() => act(() => api.syncConnect({ demo: true }))}>Use the demo billing app</button>
                </div>
                <p className="fine">Each sale, supplier bill and payment is sent as signed JSON. Ready-made links to named billing apps are not built yet.{sy.waiting ? ` ${sy.waiting} entries are waiting to go.` : ""}</p>
              </div>
            )}

            {sy.recent.length > 0 && <>
              <p className="menu-label">Latest entries</p>
              <ul className="bills">
                {sy.recent.map((r) => (
                  <li key={r.id}>
                    <span className="row-title">{KIND[r.kind]}</span>
                    <span className={`chip ${r.status === "sent" ? "chip-good" : r.status === "failed" ? "chip-warn" : ""}`}>{r.status === "sent" ? "Sent" : r.status === "failed" ? "Failed" : "Waiting"}</span>
                    <span className="row-detail">{r.title}{r.error ? `. ${r.error}` : ""}</span>
                  </li>
                ))}
              </ul>
            </>}

            {sy.demo_ledger && <>
              <p className="menu-label">What the demo billing app has received: {sy.demo_ledger.entries} entries</p>
              {sy.demo_ledger.stock.length ? <ul className="bills">{sy.demo_ledger.stock.map((s) => (
                <li key={s.item}><span className="row-title">{s.item}</span><span className="bill-amt">{s.change > 0 ? "+" : "−"}{qty(Math.abs(s.change))} {s.unit}</span></li>))}</ul>
                : <p className="fine">No stock has moved in it yet. Make a bill and it will show here.</p>}
            </>}
          </div>
        </div>
      )}
    </section>
  );
}
