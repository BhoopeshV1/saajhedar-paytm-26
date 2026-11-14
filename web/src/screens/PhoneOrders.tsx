// Ordering by phone: Saajhedar rings each supplier, inside the ordering rule,
// and the supplier's invoice lands in Pay.
import { useState } from "react";
import { useApp } from "../store";
import { api, inr, qty } from "../api";
import { CallScreen } from "./CallScreen";

const Phone = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></svg>;

export function PhoneOrders() {
  const { state, lang, act, toast, go, setFocus } = useApp();
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<number[]>([]);
  if (!state) return null;
  const L = (en: string, ta: string, hi: string) => (lang === "ta-IN" ? ta : lang === "hi-IN" ? hi : en);
  const ring = async () => {
    setBusy(true);
    const r = await act(() => api.callSuppliers());
    setBusy(false);
    if (r?.called.length) setQueue(r.called.map((c) => c.call_id));
    if (r && !r.called.length) toast({ title: r.called.length ? `${L("Called", "அழைத்தது", "फ़ोन किया")}: ${r.called.map((c) => c.supplier).join(", ")}` : L("No call was made", "அழைப்பு இல்லை", "कोई कॉल नहीं हुई"),
      body: r.needs_pin.length ? `${L("Needs your PIN", "உங்கள் PIN தேவை", "आपका PIN चाहिए")}: ${r.needs_pin.map((n) => `${n.supplier} ${inr(n.total)}`).join(", ")}` : undefined, tone: "good" });
  };
  const toPay = (billId: number) => { setQueue([]); go("pay"); setFocus({ bill_id: billId }); };
  const playing = queue.length ? state.calls.find((c) => c.id === queue[0]) : undefined;
  return (
    <section className="card">
      <h2 className="card-title">{L("Order by phone", "போனில் ஆர்டர்", "फ़ोन से ऑर्डर")}</h2>
      <p className="lede">{L("Saajhedar rings each supplier, orders what is running out, and brings the invoice into Pay. It calls unasked only inside your ordering rule.",
        "சாஜேதார் ஒவ்வொரு சப்ளையரையும் அழைத்து, தீரும் பொருட்களை ஆர்டர் செய்து, பில்லை செலுத்து பகுதிக்குக் கொண்டு வரும். உங்கள் விதிக்குள் மட்டுமே கேட்காமல் அழைக்கும்.",
        "साझेदार हर सप्लायर को फ़ोन करके घटता माल मँगाता है और बिल भुगतान में ले आता है। आपके नियम के भीतर ही बिना पूछे फ़ोन करता है।")}</p>
      <button className="btn btn-primary" onClick={ring} disabled={busy}><Phone /> {busy ? L("Calling", "அழைக்கிறது", "कॉल हो रही है") : L("Call suppliers and order", "சப்ளையர்களை அழைத்து ஆர்டர் செய்", "सप्लायर को फ़ोन करके ऑर्डर करें")}</button>
      {state.calls.length > 0 && (
        <ul className="calls">
          {state.calls.map((c) => (
            <li key={c.id}>
              <button className="call-head" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>
                <span className="row-title">{c.supplier}</span>
                <span className={`chip ${c.status === "ordered" ? "chip-good" : "chip-warn"}`}>{c.status === "ordered" ? inr(c.total) : c.status}</span>
                <span className="row-detail">{c.summary}{c.via ? `. ${c.via}` : ""}</span>
              </button>
              {open === c.id && (
                <div className="call-body">
                  {c.transcript.map((t, i) => <p key={i} className={`turn turn-${t.who}`}><b>{t.who === "saajhedar" ? "Saajhedar" : c.supplier}</b>{t.text}</p>)}
                  {c.lines.filter((l) => !l.agreed).map((l) => <p key={l.name} className="warn-line">{l.name}: {inr(l.rate)} a {l.unit} is more than 5% up. Not ordered; yours to decide.</p>)}
                  {c.lines.filter((l) => l.agreed && l.qty < l.asked).map((l) => <p key={l.name} className="fine">{l.name}: asked for {qty(l.asked)}, supplier had {qty(l.qty)} {l.unit}.</p>)}
                </div>
              )}
              {c.transcript.length > 0 && <button className="link" onClick={() => setQueue([c.id])}>{L("Replay the call", "அழைப்பை மீண்டும் காட்டு", "कॉल फिर चलाएँ")}</button>}
              {c.bill_id && <button className="link" onClick={() => toPay(c.bill_id!)}>{L("See the invoice in Pay", "பில்லை செலுத்து பகுதியில் பார்", "बिल भुगतान में देखें")}</button>}
            </li>
          ))}
        </ul>
      )}
      <p className="fine">{L("Prototype: the supplier's side of the call is simulated, and no phone rings.", "முன்மாதிரி: சப்ளையர் பக்கம் மாதிரியாக உருவாக்கப்பட்டது; எந்த போனும் ஒலிக்காது.", "प्रोटोटाइप: सप्लायर की तरफ़ की बातचीत नकली है, कोई फ़ोन नहीं बजता।")}</p>
      {playing && <CallScreen call={playing} more={queue.length - 1} onNext={() => setQueue((q) => q.slice(1))} onClose={() => setQueue([])} onInvoice={toPay} />}
    </section>
  );
}
