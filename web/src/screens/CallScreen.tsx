// A phone-call screen that plays a supplier call back line by line. The call is
// simulated: the order and invoice already exist; this shows how it was agreed.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { inr, type Call } from "../api";

const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export function CallScreen({ call, more, onNext, onClose, onInvoice }: { call: Call; more: number; onNext: () => void; onClose: () => void; onInvoice: (billId: number) => void }) {
  const { lang, quiet } = useApp();
  const L = (en: string, ta: string, hi: string) => (lang === "ta-IN" ? ta : lang === "hi-IN" ? hi : en);
  // -1 ringing, 0..n-1 lines spoken so far, n ended
  const [step, setStep] = useState(-1);
  const [secs, setSecs] = useState(0);
  const end = useRef<HTMLDivElement>(null);
  // The wording is fixed when the call opens, so what is heard matches what is shown.
  const [lines, setLines] = useState(call.transcript);
  const n = lines.length;
  const clips = useRef<(HTMLAudioElement | null)[]>([]);
  useEffect(() => {
    setStep(-1); setSecs(0); setLines(call.transcript);
    clips.current = quiet ? [] : call.transcript.map((t) => { const a = new Audio(`/api/calls/voice?who=${t.who}&text=${encodeURIComponent(t.text)}`); a.preload = "auto"; return a; });
    return () => { clips.current.forEach((a) => a?.pause()); clips.current = []; };
  }, [call.id]); // eslint-disable-line
  useEffect(() => {
    if (step >= n) { clips.current.forEach((a) => a?.pause()); return; }
    let done = false, timer: ReturnType<typeof setTimeout> | undefined;
    const next = () => { if (!done) { done = true; setStep((s) => s + 1); } };
    const clip = clips.current[Math.max(0, step)];
    if (step < 0) {
      // Ring for a moment, and for as long as the first voice needs to arrive.
      const at = Date.now(), go = () => { timer = setTimeout(next, Math.max(0, 2200 - (Date.now() - at))); };
      if (!clip || clip.readyState >= 3) go();
      else { clip.addEventListener("canplaythrough", go, { once: true }); clip.addEventListener("error", go, { once: true }); timer = setTimeout(next, 9000); }
    } else {
      const silent = () => { timer = setTimeout(next, Math.min(4200, 1100 + (lines[step]?.text.length ?? 0) * 28)); };
      if (!clip || clip.error) silent();
      else {
        clip.addEventListener("ended", () => { timer = setTimeout(next, 350); }, { once: true });
        clip.addEventListener("error", silent, { once: true });
        clip.play().catch(silent);
      }
    }
    return () => { done = true; clearTimeout(timer); clip?.pause(); };
  }, [step, n, call.id]); // eslint-disable-line
  useEffect(() => {
    if (step < 0 || step >= n) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [step >= 0 && step < n]); // eslint-disable-line
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [step]);
  const ringing = step < 0, over = step >= n;
  const said = lines.slice(0, Math.min(n, step + 1));
  return (
    <div className={`callscreen ${ringing ? "is-ringing" : over ? "is-over" : "is-live"}`} role="dialog" aria-modal="true" aria-label={`Call with ${call.supplier}`}>
      <p className="call-tag">{L("Simulated call. No phone rings.", "மாதிரி அழைப்பு. எந்த போனும் ஒலிக்காது.", "नकली कॉल। कोई फ़ोन नहीं बजता।")}</p>
      <div className="call-who">
        <span className="call-avatar"><b>{initials(call.supplier)}</b></span>
        <h2>{call.supplier}</h2>
        <p className="call-state">{ringing ? L("Saajhedar is calling", "சாஜேதார் அழைக்கிறது", "साझेदार फ़ोन कर रहा है") : over ? `${L("Call ended", "அழைப்பு முடிந்தது", "कॉल समाप्त")}, ${clock(secs)}` : clock(secs)}</p>
      </div>
      <div className="call-talk">
        {said.map((t, i) => <p key={i} className={`call-line call-line-${t.who}`}><b>{t.who === "saajhedar" ? "Saajhedar" : call.supplier}</b>{t.text}</p>)}
        {!ringing && !over && step + 1 < n && <p className={`call-line call-line-${lines[step + 1].who} call-typing`}><i /><i /><i /></p>}
        {over && (
          <div className="call-result">
            <strong>{call.status === "ordered" ? `${L("Order placed", "ஆர்டர் செய்யப்பட்டது", "ऑर्डर हो गया")}: ${inr(call.total)}` : L("Nothing was ordered", "எதுவும் ஆர்டர் செய்யப்படவில்லை", "कुछ ऑर्डर नहीं हुआ")}</strong>
            <span>{call.summary}. {call.via}</span>
          </div>
        )}
        <div ref={end} />
      </div>
      <div className="call-actions">
        {over ? <>
          {call.bill_id && <button className="btn call-btn-ghost" onClick={() => onInvoice(call.bill_id!)}>{L("See the invoice in Pay", "பில்லை செலுத்து பகுதியில் பார்", "बिल भुगतान में देखें")}</button>}
          <button className="btn btn-primary" onClick={more ? onNext : onClose}>{more ? L(`Next call (${more} more)`, `அடுத்த அழைப்பு (${more})`, `अगली कॉल (${more})`) : L("Done", "முடிந்தது", "हो गया")}</button>
        </> : <>
          <button className="call-skip" onClick={() => setStep(n)}>{L("Skip to the result", "முடிவுக்குச் செல்", "नतीजा देखें")}</button>
          <button className="call-hang" onClick={onClose} aria-label={L("Close the call screen", "அழைப்புத் திரையை மூடு", "कॉल स्क्रीन बंद करें")}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 14c5-5 13-5 18 0l-2.2 2.4-3.3-1.6v-2.3a9 9 0 0 0-7 0v2.3l-3.3 1.6z" /></svg>
          </button>
        </>}
      </div>
    </div>
  );
}
