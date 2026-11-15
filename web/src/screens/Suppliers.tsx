// Suppliers and how to reach them. Lives on Pay: the people the shop pays are
// the people Saajhedar phones to order from, so their number belongs here.
import { useState } from "react";
import { useApp } from "../store";
import { api, type Supplier } from "../api";
import { IconClose, IconChevron } from "../icons";

const Plus = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
const Phone = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>;
const BLANK = { name: "", contact: "", phone: "", supplies: "", lead_days: 1 };
const pretty = (p: string) => (p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p);

export function Suppliers() {
  const { state, lang, refresh, toast } = useApp();
  const [form, setForm] = useState<(typeof BLANK & { id?: number }) | null>(null);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!state) return null;
  const L = (en: string, ta: string, hi: string) => (lang === "ta-IN" ? ta : lang === "hi-IN" ? hi : en);
  const list: Supplier[] = state.suppliers ?? [];
  const shown = all ? list : list.slice(0, 3);
  const edit = (s: Supplier) => { setError(null); setForm({ id: s.id, name: s.name, contact: s.contact ?? "", phone: s.phone ?? "", supplies: s.supplies ?? "", lead_days: s.lead_days }); };
  const set = (k: keyof typeof BLANK, v: string | number) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const ok = !!form && form.name.trim().length > 1 && form.phone.length === 10;
  const save = async () => {
    if (!form || !ok) return;
    setBusy(true); setError(null);
    try {
      const r = await api.saveSupplier(form);
      toast({ title: form.id ? L("Supplier updated", "சப்ளையர் புதுப்பிக்கப்பட்டது", "सप्लायर अपडेट हुआ") : L("Supplier added", "சப்ளையர் சேர்க்கப்பட்டது", "सप्लायर जुड़ गया"), body: `${r.name}, ${pretty(r.phone ?? "")}`, tone: "good" });
      setForm(null); refresh();
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  };
  const days: [number, string][] = [[0, L("Same day", "அதே நாள்", "उसी दिन")], [1, L("Next day", "அடுத்த நாள்", "अगले दिन")], [2, L("2 days", "2 நாட்கள்", "2 दिन")]];
  return (
    <section className="card sup">
      <div className="sup-head"><h2 className="card-title">{L("Suppliers", "சப்ளையர்கள்", "सप्लायर")}</h2>
        <button className="btn-add" onClick={() => { setError(null); setForm({ ...BLANK }); }}><Plus />{L("Add supplier", "சப்ளையர் சேர்", "सप्लायर जोड़ें")}</button></div>
      <ul className="sup-list">
        {shown.map((s) => (
          <li key={s.id}><button className="sup-row" onClick={() => edit(s)}>
            <span className="row-main"><span className="row-title">{s.name}</span>
              <span className="row-detail">{[s.contact, s.supplies].filter(Boolean).join(", ") || L("No details yet", "விவரம் இல்லை", "कोई विवरण नहीं")}</span></span>
            {s.phone ? <span className="sup-phone"><Phone />{pretty(s.phone)}</span> : <span className="sup-phone none">{L("Add number", "எண் சேர்", "नंबर जोड़ें")}</span>}
            <IconChevron />
          </button></li>
        ))}
      </ul>
      {list.length > 3 && <button className="link" onClick={() => setAll(!all)}>{all ? L("Show fewer", "குறைவாகக் காட்டு", "कम दिखाएँ") : L(`Show all ${list.length}`, `அனைத்து ${list.length}-ஐயும் காட்டு`, `सभी ${list.length} दिखाएँ`)}</button>}

      {form && (
        <div className="sheet-scrim" onClick={() => setForm(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={form.id ? "Edit supplier" : "Add supplier"}>
            <div className="sheet-grip" />
            <div className="sheet-top"><h2 className="pin-title">{form.id ? L("Supplier details", "சப்ளையர் விவரம்", "सप्लायर का विवरण") : L("Add supplier", "சப்ளையர் சேர்", "सप्लायर जोड़ें")}</h2>
              <button className="icon-btn" onClick={() => setForm(null)} aria-label="Close"><IconClose /></button></div>
            <div className="sup-form">
              <label>{L("Supplier name", "சப்ளையர் பெயர்", "सप्लायर का नाम")}
                <input className="field" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Lakshmi Wholesale" autoFocus={!form.id} /></label>
              <label>{L("Phone number", "தொலைபேசி எண்", "फ़ोन नंबर")}
                <input className="field" inputMode="numeric" autoComplete="off" maxLength={10} value={form.phone} onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} placeholder="98400 00000" /></label>
              <label>{L("Person to ask for", "யாரிடம் பேச வேண்டும்", "किससे बात करनी है")}
                <input className="field" value={form.contact} onChange={(e) => set("contact", e.target.value)} placeholder="Lakshmi" /></label>
              <label>{L("What they supply", "என்ன வழங்குகிறார்கள்", "क्या सप्लाई करते हैं")}
                <input className="field" value={form.supplies} onChange={(e) => set("supplies", e.target.value)} placeholder={L("rice, dal, oil", "அரிசி, பருப்பு, எண்ணெய்", "चावल, दाल, तेल")} /></label>
              <div><span className="sup-label">{L("Delivers", "டெலிவரி", "डिलीवरी")}</span>
                <div className="seg" role="group" aria-label="Delivery time">
                  {days.map(([d, label]) => <button key={d} className={`seg-btn ${form.lead_days === d ? "on" : ""}`} aria-pressed={form.lead_days === d} onClick={() => set("lead_days", d)}>{label}</button>)}
                </div></div>
            </div>
            {error && <p className="warn-line">{error}</p>}
            <button className="btn btn-primary" onClick={save} disabled={!ok || busy}>{busy ? L("Saving", "சேமிக்கிறது", "सेव हो रहा है") : form.id ? L("Save supplier", "சப்ளையரைச் சேமி", "सप्लायर सेव करें") : L("Add supplier", "சப்ளையர் சேர்", "सप्लायर जोड़ें")}</button>
            <p className="fine">{L("Saajhedar uses this number when it phones the supplier to order. In this prototype real calls still go to one test number.", "ஆர்டருக்கு அழைக்கும்போது சாஜேதார் இந்த எண்ணைப் பயன்படுத்தும். இந்த முன்மாதிரியில் உண்மையான அழைப்புகள் ஒரு சோதனை எண்ணுக்கே செல்லும்.", "ऑर्डर के लिए फ़ोन करते समय साझेदार यही नंबर इस्तेमाल करता है। इस प्रोटोटाइप में असली कॉल अभी एक टेस्ट नंबर पर ही जाती हैं।")}</p>
          </div>
        </div>
      )}
    </section>
  );
}
