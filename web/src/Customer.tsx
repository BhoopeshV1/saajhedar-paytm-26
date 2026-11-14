// The customer's phone: a regular speaks an order to the shop, or settles udhaar.
// Open this on a second phone (#/order) and the owner's phone announces the order.
import { useEffect, useState } from "react";
import { AppProvider, useApp } from "./store";
import { api, inr, qty, type Customer as Cust, type OrderLine } from "./api";
import { t, nameOf, LANG_NAMES } from "./i18n";
import { Orb } from "./components/Orb";
import { Toasts } from "./components/Chrome";
import { IconKeyboard, IconBack } from "./icons";
import type { Lang } from "./api";

const TRY: Record<Lang, string[]> = {
  "ta-IN": ["வழக்கமான சாமான் அனுப்புங்க", "ரெண்டு பால் பாக்கெட், ஒரு பிரெட் வேணும்", "என் கடன் எவ்வளவு?"],
  "hi-IN": ["रोज़ वाला सामान भेज दीजिए", "दो दूध के पैकेट और एक ब्रेड चाहिए", "मेरा उधार कितना है?"],
  "en-IN": ["Send my usual, please", "Two milk packets and one bread", "How much udhaar do I owe?"],
};
const COPY = {
  who: ["Who is ordering?", "யார் ஆர்டர் செய்கிறீர்கள்?", "कौन ऑर्डर कर रहा है?"],
  lead: ["Regulars of the shop. Pick one to use their phone.", "கடையின் வழக்கமான வாடிக்கையாளர்கள். ஒருவரைத் தேர்ந்தெடுங்கள்.", "दुकान के नियमित ग्राहक। किसी एक को चुनिए।"],
  usual: ["Your usual", "உங்கள் வழக்கமான சாமான்", "आपका रोज़ का सामान"],
  orderUsual: ["Order the usual", "வழக்கமானதை ஆர்டர் செய்", "रोज़ वाला ऑर्डर करें"],
  speak: ["Tap and say what you need", "தொட்டு, வேண்டியதைச் சொல்லுங்கள்", "दबाकर बताइए क्या चाहिए"],
  stop: ["Tap to stop", "நிறுத்தத் தொடுங்கள்", "रोकने के लिए दबाएँ"],
  sent: ["Sent to the shop", "கடைக்கு அனுப்பப்பட்டது", "दुकान को भेज दिया"],
  yourOrders: ["Your orders", "உங்கள் ஆர்டர்கள்", "आपके ऑर्डर"],
  owe: ["You owe the shop", "கடைக்கு நீங்கள் தர வேண்டியது", "दुकान का आप पर बाकी"],
  payNow: ["Pay now", "இப்போது செலுத்து", "अभी चुकाएँ"],
  payHalf: ["Pay half", "பாதி செலுத்து", "आधा चुकाएँ"],
  outOf: ["out of stock", "இருப்பு இல்லை", "स्टॉक में नहीं"],
  type: ["Type instead", "தட்டச்சு செய்ய", "लिखकर बताएँ"],
} as const;
const c = (k: keyof typeof COPY, lang: Lang) => COPY[k][lang === "ta-IN" ? 1 : lang === "hi-IN" ? 2 : 0];
const STATUS: Record<string, [string, string, string]> = { new: ["Received", "பெறப்பட்டது", "मिल गया"], packing: ["Being packed", "பேக் ஆகிறது", "पैक हो रहा है"], ready: ["Ready", "தயார்", "तैयार"], done: ["Handed over", "கொடுக்கப்பட்டது", "दे दिया"] };

function Phone({ me, onBack }: { me: Cust; onBack: () => void }) {
  const { state, lang, setLang, voice, caption, toggleVoice, say, act, toast, busy } = useApp();
  const [usual, setUsual] = useState<{ usual: (OrderLine & { in_stock: boolean })[]; total: number } | null>(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  useEffect(() => { api.usual(me.id).then(setUsual).catch(() => {}); }, [me.id, state?.orders.length]);

  const mine = state?.orders.filter((o) => o.customer === me.name).slice(0, 3) ?? [];
  const due = state?.dues.find((d) => d.customer_id === me.id);
  const orderUsual = () => act(() => fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer: me.id, usual: true, channel: "app" }) })
    .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; })).then((r) => r && toast({ title: c("sent", lang), tone: "good" }));
  const pay = (amount: number) => act(() => api.duePay(me.id, amount)).then((r) => r && toast({ title: `${t("paid", lang)}: ${inr(amount)}`, body: "Simulated UPI payment", tone: "good" }));
  const line = caption?.text ?? (voice === "off" ? c("speak", lang) : t(voice === "listening" ? "listening" : voice === "hearing" ? "hearing" : voice === "thinking" ? "thinking" : "speaking", lang));

  return (
    <div className="shell customer">
      <header className="cust-top">
        <button className="icon-btn" onClick={onBack} aria-label="Back"><IconBack /></button>
        <div><p className="cust-shop">{state?.overview.shop.name}</p><p className="muted">{me.name}, {me.street}</p></div>
        <select className="cust-lang" value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t("language", lang)}>
          {(Object.keys(LANG_NAMES) as Lang[]).map((l) => <option key={l} value={l}>{LANG_NAMES[l]}</option>)}
        </select>
      </header>

      <main className="screen">
        <section className="talk-stage">
          <button className={`stage-orb talk-${voice}`} onClick={toggleVoice} aria-label={voice === "off" ? c("speak", lang) : c("stop", lang)}><Orb size={132} interactive /></button>
          <p className={`stage-line ${caption?.who === "you" ? "pill-you" : ""} ${caption?.who === "error" ? "stage-error" : ""}`} aria-live="polite">{line}</p>
          {voice === "off" && !caption && (
            <div className="tries">{TRY[lang].map((x) => <button key={x} className="example" onClick={() => say(x)} disabled={busy}>“{x}”</button>)}</div>
          )}
          {typing
            ? <form className="stage-type" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { say(text); setText(""); setTyping(false); } }}>
                <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t("typePlaceholder", lang)} /><button className="btn btn-primary" disabled={!text.trim()}>{t("send", lang)}</button>
              </form>
            : <button className="link" onClick={() => setTyping(true)}><IconKeyboard size={18} /> {c("type", lang)}</button>}
        </section>

        {mine.map((o) => (
          <article key={o.id} className="card order">
            <header className="order-head">
              <div><h3 className="order-name">{c("yourOrders", lang)} #{o.id}</h3><p className="muted">{o.lines.length} items, {t(o.fulfil === "parcel" ? "parcel" : "pickup", lang)}</p></div>
              <div className="order-total">{inr(o.total)}<span className={`chip ${o.status === "ready" ? "chip-good" : ""}`}>{STATUS[o.status][lang === "ta-IN" ? 1 : lang === "hi-IN" ? 2 : 0]}</span></div>
            </header>
            <ol className="track">{["new", "packing", "ready", "done"].map((s, i) => <li key={s} className={["new", "packing", "ready", "done"].indexOf(o.status) >= i ? "on" : ""}><span>{i + 1}</span>{STATUS[s][lang === "ta-IN" ? 1 : lang === "hi-IN" ? 2 : 0]}</li>)}</ol>
          </article>
        ))}

        {usual && usual.usual.length > 0 && (
          <section className="card">
            <h2 className="card-title">{c("usual", lang)}</h2>
            <ul className="lines">
              {usual.usual.map((l) => <li key={l.sku} className={l.in_stock ? "" : "out"}><span>{nameOf(l, lang)}{!l.in_stock && <span className="muted"> ({c("outOf", lang)})</span>}</span><span className="num">{qty(l.qty)} {l.unit}</span></li>)}
            </ul>
            <button className="btn btn-primary" onClick={orderUsual}>{c("orderUsual", lang)}, {inr(usual.total)}</button>
          </section>
        )}

        {due && due.amount > 0 && (
          <section className="card udhaar-total">
            <p className="muted">{c("owe", lang)}</p>
            <p className="big">{inr(due.amount)}</p>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={() => pay(due.amount)}>{c("payNow", lang)} {inr(due.amount)}</button>
              {due.amount >= 400 && <button className="btn btn-outline" onClick={() => pay(Math.round(due.amount / 2))}>{c("payHalf", lang)}</button>}
            </div>
            <p className="fine">Payments are simulated in this prototype.</p>
          </section>
        )}
      </main>
    </div>
  );
}

function Picker({ onPick }: { onPick: (c: Cust) => void }) {
  const { state, lang } = useApp();
  return (
    <div className="shell customer">
      <main className="screen">
        <h1 className="title">{c("who", lang)}</h1>
        <p className="lead-text">{c("lead", lang)}</p>
        <section className="card">
          <ul className="rows">
            {state?.customers.map((x) => (
              <li key={x.id}><button className="row" onClick={() => onPick(x)}>
                <span className="row-icon initials">{x.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                <span className="row-main"><span className="row-title">{x.name}</span><span className="row-detail">{x.street}</span></span>
              </button></li>
            ))}
          </ul>
        </section>
        <p className="proto">{t("prototype", lang)}. Names and figures are made up.</p>
      </main>
    </div>
  );
}

export function CustomerApp() {
  const [me, setMe] = useState<Cust | null>(null);
  // The provider is keyed by customer so each one gets a fresh conversation.
  return (
    <AppProvider key={me?.id ?? 0} persona="customer" customerId={me?.id}>
      {me ? <Phone me={me} onBack={() => setMe(null)} /> : <Picker onPick={setMe} />}
      <Toasts />
    </AppProvider>
  );
}
