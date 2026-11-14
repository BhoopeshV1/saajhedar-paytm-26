// The owner's signed rules for one job, shown at the top of that job's screen.
// Rules decide what Saajhedar may do unasked there, so they lead the screen.
import { useState } from "react";
import { useApp } from "../store";
import { IconLock, IconChevron } from "../icons";

type Job = "sell" | "stock" | "pay" | "collect";
// Sales on udhaar are governed by the same credit rule as collection.
const SHOWS: Record<Job, string[]> = { sell: ["collect"], stock: ["stock"], pay: ["pay"], collect: ["collect"] };
const TRY: Record<Job, [string, string, string]> = {
  sell: ["No more udhaar for anyone who owes over 2,000 rupees.", "2,000 ரூபாய்க்கு மேல் கடன் உள்ளவர்களுக்கு மேலும் கடன் வேண்டாம்.", "जिस पर 2,000 रुपये से ज़्यादा उधार है, उसे और उधार नहीं।"],
  stock: ["Phone KPN Traders and order up to 20,000 rupees without asking.", "KPN டிரேடர்ஸுக்கு போன் செய்து 20,000 ரூபாய் வரை கேட்காமல் ஆர்டர் செய்.", "KPN ट्रेडर्स को फ़ोन करके 20,000 रुपये तक बिना पूछे ऑर्डर कर दो।"],
  pay: ["Pay KPN Traders up to 15,000 rupees without asking.", "KPN டிரேடர்ஸுக்கு 15,000 ரூபாய் வரை கேட்காமல் செலுத்து.", "KPN ट्रेडर्स को 15,000 रुपये तक बिना पूछे दे दो।"],
  collect: ["No more udhaar for anyone who owes over 2,000 rupees.", "2,000 ரூபாய்க்கு மேல் கடன் உள்ளவர்களுக்கு மேலும் கடன் வேண்டாம்.", "जिस पर 2,000 रुपये से ज़्यादा उधार है, उसे और उधार नहीं।"],
};

export function RulesFor({ job }: { job: Job }) {
  const { state, lang, go, say } = useApp();
  const [open, setOpen] = useState(false);
  if (!state) return null;
  const L = (en: string, ta: string, hi: string) => (lang === "ta-IN" ? ta : lang === "hi-IN" ? hi : en);
  const mine = state.rules.filter((r) => SHOWS[job].includes(r.job));
  const example = L(...TRY[job]);
  return (
    <section className="rulestrip" data-open={open}>
      <button className="rulestrip-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="rulestrip-title"><IconLock size={16} /> {L("Your rules here", "இங்கே உங்கள் விதிகள்", "यहाँ आपके नियम")}</span>
        <span className="rulestrip-count">{mine.length === 0 ? L("None yet", "இன்னும் இல்லை", "अभी नहीं") : L(`${mine.length} signed`, `${mine.length} கையொப்பம்`, `${mine.length} हस्ताक्षरित`)} <IconChevron size={14} /></span>
      </button>
      {open && <>
        {mine.map((r) => <p key={r.id} className="rulestrip-rule">“{r.spoken}”</p>)}
        {mine.length === 0 && <p className="rulestrip-none">{L("No rule yet, so Saajhedar asks you every time.", "இன்னும் விதி இல்லை. அதனால் சாஜேதார் ஒவ்வொரு முறையும் கேட்கும்.", "अभी कोई नियम नहीं, इसलिए साझेदार हर बार पूछेगा।")}</p>}
        <button className="rulestrip-say" onClick={() => say(example)}>{L("Say a new one", "புதிய விதியைச் சொல்லுங்கள்", "नया नियम बोलें")}: “{example}”</button>
        <button className="rulestrip-all" onClick={() => go("rules")}>{L(`All ${state.rules.length} rules`, `அனைத்து ${state.rules.length} விதிகள்`, `सभी ${state.rules.length} नियम`)} <IconChevron size={14} /></button>
      </>}
    </section>
  );
}
