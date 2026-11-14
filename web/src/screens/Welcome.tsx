// First run. Two doors: an owner links their shop, or someone who has not
// opened one yet checks what a locality is missing before spending anything.
// The phone check and merchant lookup are simulated; nothing reaches Paytm.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { api, inr, type AreaHit, type Fit, type FitKind, type KindLite, type Lang } from "../api";
import { IconCheck, IconChevron } from "../icons";
import { handoff, lakh, askFor } from "../plan";
import { StartKit } from "./StartKit";

type Step = "start" | "phone" | "otp" | "shop" | "books" | "pin" | "fence" | "fit";
const BUDGETS = [100000, 300000, 500000, 1000000, 2000000];
const LANGS: [Lang, string][] = [["en-IN", "English"], ["ta-IN", "தமிழ்"], ["hi-IN", "हिंदी"]];
const ANCHOR: Record<string, string> = { worship: "places of worship", college: "colleges", school: "schools", hospital: "hospitals", transit: "bus and train stops", office: "offices", mall: "malls", cinema: "cinemas", park: "parks" };
const Back = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>;

function Locality({ value, onPick, L }: { value: AreaHit | null; onPick: (h: AreaHit | null) => void; L: (en: string, ta: string, hi: string) => string }) {
  const [q, setQ] = useState(""); const [hits, setHits] = useState<AreaHit[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => api.areaSearch(q).then(setHits).catch(() => setHits([])), 220);
    return () => clearTimeout(t);
  }, [q]);
  if (value) return <div className="picks"><button className="pick on" onClick={() => onPick(null)}>{value.label} ✕</button></div>;
  return (<>
    <input className="field" placeholder={L("Area or street, e.g. Tambaram", "பகுதி அல்லது தெரு, எ.கா. தாம்பரம்", "इलाका या गली, जैसे तांबरम")} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Area or street" />
    {hits.length > 0 && <div className="hits hits-below">{hits.slice(0, 5).map((h) => <button key={h.label + h.lat} onClick={() => { onPick(h); setQ(""); setHits([]); }}>{h.label} <span className="muted">{h.type === "street" ? L("street", "தெரு", "गली") : ""}</span></button>)}</div>}
  </>);
}

// Shown every time the app opens, over whatever screen is loading underneath.
// It stays until Proceed is tapped.
// Laptop phone frame only: a compact language picker beside the camera cut-out.
function LangDrop({ dark }: { dark: boolean }) {
  const { lang, setLang } = useApp();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={box} className={`lang-drop ${dark ? "lang-drop-dark" : ""}`}>
      <button className="lang-pill" aria-haspopup="listbox" aria-expanded={open} aria-label="Language" onClick={() => setOpen(!open)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" /></svg>
        <span>{lang.slice(0, 2).toUpperCase()}</span>
      </button>
      {open && (
        <ul className="lang-menu" role="listbox">
          {LANGS.map(([l, n]) => (
            <li key={l}><button role="option" aria-selected={lang === l} onClick={() => { setLang(l); setOpen(false); }}>
              <span>{n}</span>{lang === l && <IconCheck size={15} />}
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Splash({ onDone }: { onDone: () => void }) {
  const { lang, setLang } = useApp();
  const L = (en: string, ta: string, hi: string) => (lang === "ta-IN" ? ta : lang === "hi-IN" ? hi : en);
  // While the splash is up, the page behind it must not scroll, and the phone's
  // status bar takes the splash colour.
  useEffect(() => {
    const root = document.documentElement, meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]'), was = meta?.content;
    root.classList.add("splash-open"); if (meta) meta.content = "#002970";
    return () => { root.classList.remove("splash-open"); if (meta && was) meta.content = was; };
  }, []);
  return (
    <div className="splash">
      <LangDrop dark={true} />
      <div className="seg lang-seg splash-lang">{LANGS.map(([l, n]) => <button key={l} className={`seg-btn ${lang === l ? "on" : ""}`} onClick={() => setLang(l)}>{n}</button>)}</div>
      <span className="soap" aria-hidden="true"><i className="b-rim" /><i className="b-core" /><i className="b-shine" /></span>
      <span className="splash-name">Saajhedar</span>
      <span className="splash-line">{L("Your shop's partner", "உங்கள் கடையின் துணை", "आपकी दुकान का साथी")}</span>
      <span className="splash-made">{L("Built at the Paytm Build for India AI Hackathon, Chennai", "Paytm Build for India AI ஹேக்கத்தான், சென்னையில் உருவாக்கப்பட்டது", "Paytm Build for India AI हैकाथॉन, चेन्नई में बनाया गया")}<br />{L("by team Finance Tours", "குழு: Finance Tours", "टीम: Finance Tours")}</span>
      <button className="btn splash-go" onClick={onDone}>{L("Proceed", "தொடர்", "आगे बढ़ें")}</button>
    </div>
  );
}

export function Welcome({ onDone }: { onDone: (how: string) => void }) {
  const { lang, setLang, go, setFocus, say, health, refresh, toast } = useApp();
  const L = (en: string, ta: string, hi: string) => (lang === "ta-IN" ? ta : lang === "hi-IN" ? hi : en);
  const kn = (k: { label: string; ta: string; hi: string }) => L(k.label, k.ta, k.hi);
  const from = handoff.setup ? handoff.plan : null; // arriving from the map with a plan already made
  const [step, setStep] = useState<Step>(from ? "phone" : "start");
  const [fresh, setFresh] = useState(!!from);
  const [kit, setKitState] = useState<string[]>(handoff.kit);
  const setKit = (k: string[]) => { handoff.kit = k; setKitState(k); };
  useEffect(() => { handoff.setup = false; }, []);
  const [kinds, setKinds] = useState<KindLite[]>([]);
  const [phone, setPhone] = useState(""); const [otp, setOtp] = useState("");
  const [name, setName] = useState(""); const [owner, setOwner] = useState("");
  const [kind, setKind] = useState<string | null>(from?.kind ?? null);
  const [place, setPlace] = useState<AreaHit | null>(from ? { label: from.place, type: "locality", lat: from.lat, lon: from.lon } : null);
  const [books, setBooks] = useState("paper");
  const [pin, setPin] = useState("");
  const [budget, setBudget] = useState(from?.budget ?? 500000);
  const [fit, setFit] = useState<Fit | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.kinds().then(setKinds).catch(() => {}); }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); setError(null); }, [step]);

  const prev: Record<Step, Step> = { start: "start", phone: "start", otp: "phone", shop: "otp", books: "shop", pin: "books", fence: "start", fit: "fence" };
  const stage = step === "phone" || step === "otp" ? 1 : step === "shop" || step === "books" ? 2 : 3;

  const finish = async () => {
    setBusy(true); setError(null);
    try {
      await api.onboard({ name, owner, kind: kind ?? "grocery", locality: place?.label, lat: place?.lat, lon: place?.lon, language: lang, books, pin });
      handoff.plan = null; await refresh(); onDone("owner"); go("home");
      toast({ title: L(`${name} is ready`, `${name} தயார்`, `${name} तैयार है`), body: L("Tap the orb and speak.", "உருண்டையைத் தொட்டுப் பேசுங்கள்.", "गोले को छूकर बोलिए।"), tone: "good" });
    } catch (e: any) { setError(e.message); }
    setBusy(false);
  };
  const check = async () => {
    if (!place) { setError(L("Pick an area first.", "முதலில் ஒரு பகுதியைத் தேர்ந்தெடுங்கள்.", "पहले इलाका चुनिए।")); return; }
    setBusy(true); setError(null);
    try { setFit(await api.areaFit(place.lat, place.lon, 800, kind, budget)); setStep("fit"); } catch (e: any) { setError(e.message); }
    setBusy(false);
  };
  const toMap = (ask: boolean) => {
    if (!fit) return;
    const plan = { kind, budget, place: place?.label ?? fit.locality, lat: fit.lat, lon: fit.lon, fit };
    handoff.plan = plan;
    onDone("explorer"); go("area"); setFocus({ place: plan.place, lat: fit.lat, lon: fit.lon, radius_m: fit.radius_m });
    if (ask) say(askFor(plan));
  };

  const top = (
    <div className="welcome-top">
      {step === "start" ? <span />
        : <button className="icon-btn" onClick={() => setStep(prev[step])} aria-label="Back"><Back /></button>}
      <LangDrop dark={false} />
      <div className="seg lang-seg">{LANGS.map(([l, n]) => <button key={l} className={`seg-btn ${lang === l ? "on" : ""}`} onClick={() => setLang(l)}>{n}</button>)}</div>
    </div>
  );
  const KindPicks = ({ none }: { none?: boolean }) => (
    <div className="picks">
      {none && <button className={`pick ${kind == null ? "on" : ""}`} onClick={() => setKind(null)}>{L("Not sure yet", "இன்னும் தெரியவில்லை", "अभी तय नहीं")}</button>}
      {kinds.map((k) => <button key={k.key} className={`pick ${kind === k.key ? "on" : ""}`} onClick={() => setKind(k.key)}>{kn(k)}</button>)}
    </div>
  );

  if (step === "start") return (
    <div className="welcome">
      {top}
      <h1 className="brand">Saajhedar</h1>
      <p className="brand-sub">{L("Your shop's partner, by voice.", "குரலால் இயங்கும் உங்கள் கடையின் துணை.", "बोलकर चलने वाला, आपकी दुकान का साथी।")}</p>
      <button className="door" onClick={() => { setFresh(false); setStep("phone"); }}>
        <span className="door-title">{L("I run a shop", "எனக்கு ஒரு கடை இருக்கிறது", "मेरी दुकान है")}</span><IconChevron />
        <span className="door-text">{L("Set up in two minutes.", "இரண்டு நிமிடத்தில் தொடங்குங்கள்.", "दो मिनट में शुरू करें।")}</span>
      </button>
      <button className="door door-fence" onClick={() => setStep("fence")}>
        <span className="door-title">{L("Thinking of opening one?", "கடை தொடங்க யோசனையா?", "दुकान खोलने की सोच रहे हैं?")}</span><IconChevron />
        <span className="door-text">{L("See who is already there, and what the area is missing.", "அங்கே யார் இருக்கிறார்கள், எது குறைவு என்று பாருங்கள்.", "देखिए वहाँ कौन है और क्या कम है।")}</span>
      </button>
      <button className="link" onClick={() => onDone("demo")}>{L("Skip to the demo shop", "மாதிரிக் கடைக்குச் செல்", "डेमो दुकान देखें")}</button>
      <p className="fine">{L("Not a Paytm product. Payments and loans are simulated.", "இது Paytm தயாரிப்பு அல்ல. பணம், கடன் அனைத்தும் மாதிரி.", "यह Paytm का उत्पाद नहीं है। भुगतान और लोन नकली हैं।")}</p>
    </div>
  );

  if (step === "fence") return (
    <div className="welcome">
      {top}
      <h1 className="h-step">{L("What would you open, and where?", "எந்தக் கடை, எங்கே?", "कौन सी दुकान, कहाँ?")}</h1>
      <p className="lede">{L("Three answers. Then a plain picture of the competition around that spot.", "மூன்று பதில்கள். பிறகு அந்த இடத்தைச் சுற்றியுள்ள போட்டியின் தெளிவான படம்.", "तीन जवाब। फिर उस जगह के आसपास की प्रतिस्पर्धा की साफ़ तस्वीर।")}</p>
      <div className="form">
        <div className="lab">{L("Where", "எங்கே", "कहाँ")}<Locality value={place} onPick={setPlace} L={L} /></div>
        <div className="lab">{L("What kind of shop", "எந்த வகைக் கடை", "किस तरह की दुकान")}<KindPicks none /></div>
        <div className="lab">{L("How much can you put in", "எவ்வளவு முதலீடு செய்ய முடியும்", "कितना लगा सकते हैं")}
          <div className="picks">{BUDGETS.map((b) => <button key={b} className={`pick ${budget === b ? "on" : ""}`} onClick={() => setBudget(b)}>{lakh(b)}</button>)}</div></div>
      </div>
      {error && <p className="warn-line">{error}</p>}
      <button className="btn btn-primary" onClick={check} disabled={busy}>{L("Show me the area", "பகுதியைக் காட்டு", "इलाका दिखाएँ")}</button>
      <p className="fine">{L("Covers Chennai and its suburbs in this prototype.", "இந்த முன்மாதிரி சென்னை மற்றும் புறநகரை மட்டும் உள்ளடக்கியது.", "इस प्रोटोटाइप में केवल चेन्नई और उपनगर शामिल हैं।")}</p>
    </div>
  );

  if (step === "fit" && fit) {
    const c = fit.chosen;
    const word = (k: FitKind) => k.level === "thin" ? L("Room for one more", "இன்னொன்றுக்கு இடம் உண்டு", "एक और की जगह है") : k.level === "crowded" ? L("Already crowded", "ஏற்கனவே நெரிசல்", "पहले से भीड़") : L("About average", "சராசரி அளவு", "लगभग औसत");
    const cost = (k: FitKind) => k.setup_lakh ? `₹${k.setup_lakh[0]} to ${k.setup_lakh[1]} lakh` : null;
    return (
      <div className="welcome">
        {top}
        <p className="step-name">{place?.label ?? fit.locality}, {L("within", "சுற்றளவு", "दायरा")} {fit.radius_m} m</p>
        {c ? (
          <div className={`verdict ${c.level}`}>
            <span className="verdict-word">{kn(c)}</span>
            <span className="verdict-line">{word(c)}</span>
            <p>{c.here} here. Areas like this one usually have about {Math.round(c.expected)}.{c.nearest_m != null ? ` The nearest is ${c.nearest_m} m away.` : ""}</p>
            {cost(c) && <p>{c.within_budget ? `Your ${lakh(budget)} is within the rough ${cost(c)} it takes to open one.` : `Opening one takes roughly ${cost(c)}, which is more than your ${lakh(budget)}.`}</p>}
          </div>
        ) : (
          <div className="verdict">
            <span className="verdict-word">{lakh(budget)}</span>
            <span className="verdict-line">{fit.options.length ? L("Here is what this area is short of", "இந்தப் பகுதியில் குறைவாக உள்ளவை", "इस इलाके में ये कम हैं") : L("Nothing stands out as missing here", "இங்கே குறை எதுவும் தெரியவில்லை", "यहाँ कोई कमी नहीं दिखती")}</span>
          </div>
        )}
        <div className="facts">
          <div className="fact"><b>{fit.total_listed}</b><span>businesses listed around this spot</span></div>
          <div className="fact"><b>{c ? c.here : fit.options.length}</b><span>{c ? `${kn(c).toLowerCase()} shops already here` : "kinds of shop that fit your money"}</span></div>
        </div>
        {c && c.streets.length > 0 && <section className="card"><h2 className="card-title">Some of the streets they are on</h2>
          {c.streets.map((s) => <div key={s.name} className="alt"><i style={{ background: c.color }} /><span className="row-title">{s.name}</span><span className="bill-amt">{s.n}</span></div>)}</section>}
        {fit.options.length > 0 && <section className="card"><h2 className="card-title">{c ? "Also worth a look for your money" : "Worth a look for your money"}</h2>
          {fit.options.map((o) => <div key={o.key} className="alt"><i style={{ background: o.color }} /><span className="row-title">{kn(o)}</span><span className="chip chip-good">{word(o)}</span>
            <span className="row-detail">{o.here} here, similar areas have about {Math.round(o.expected)}{cost(o) ? `. Roughly ${cost(o)} to open` : ""}</span></div>)}</section>}
        {fit.anchors.length > 0 && <section className="card"><h2 className="card-title">What brings people here</h2>
          <p className="lede">{fit.anchors.slice(0, 5).map((a) => `${a.n} ${ANCHOR[a.key] ?? a.key}`).join(", ")}.</p></section>}
        {fit.crowded.length > 0 && <p className="fine">Already crowded here: {fit.crowded.map((k) => `${kn(k).toLowerCase()} (${k.here})`).join(", ")}.</p>}
        <p className="fine">{fit.caveat} {fit.setup_cost_note}</p>
        <StartKit chosen={c} budget={budget} kit={kit} setKit={setKit} L={L} />
        {health?.claude && <button className="btn btn-primary" onClick={() => toMap(true)}>{L("Ask Saajhedar what it would open", "சாஜேதாரிடம் கேளுங்கள்", "साझेदार से पूछें")}</button>}
        <button className="btn btn-outline" onClick={() => toMap(false)}>{L("See it on the map", "வரைபடத்தில் பார்", "नक्शे पर देखें")}</button>
        <button className="link" onClick={() => { setFresh(true); setStep("phone"); }}>{L("I have decided. Set up my shop", "முடிவு செய்துவிட்டேன். என் கடையை அமை", "तय कर लिया। मेरी दुकान सेट करें")}</button>
      </div>
    );
  }

  // The owner's path.
  return (
    <div className="welcome">
      {top}
      <div className="steps" aria-hidden="true">{[1, 2, 3].map((i) => <span key={i} className={i <= stage ? "on" : ""} />)}</div>
      <p className="step-name">{L("Step", "படி", "चरण")} {stage} / 3: {stage === 1 ? L("Link your account", "கணக்கை இணை", "खाता जोड़ें") : stage === 2 ? L("Your shop", "உங்கள் கடை", "आपकी दुकान") : L("Your PIN", "உங்கள் PIN", "आपका PIN")}</p>

      {step === "phone" && <>
        <h1 className="h-step">{L("Your mobile number", "உங்கள் மொபைல் எண்", "आपका मोबाइल नंबर")}</h1>
        <p className="lede">{fresh ? L("The number you want your merchant account on.", "வணிகக் கணக்குக்கான எண்.", "जिस नंबर पर मर्चेंट खाता चाहिए।") : L("The number your merchant account is on.", "உங்கள் வணிகக் கணக்கில் உள்ள எண்.", "जिस नंबर पर आपका मर्चेंट खाता है।")}</p>
        <div className="phone"><span className="cc">+91</span>
          <input className="field" inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="98400 00000" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} aria-label="Mobile number" /></div>
        <button className="btn btn-primary" disabled={phone.length !== 10} onClick={() => setStep("otp")}>{L("Send code", "குறியீடு அனுப்பு", "कोड भेजें")}</button>
        <p className="fine">Prototype: no SMS is sent and the number is not stored.</p>
      </>}

      {step === "otp" && <>
        <h1 className="h-step">{L("Enter the code", "குறியீட்டை உள்ளிடுங்கள்", "कोड डालें")}</h1>
        <p className="lede">+91 {phone.slice(0, 5)} {phone.slice(5)}</p>
        <input className="field otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} aria-label="Six digit code" />
        <button className="btn btn-primary" disabled={otp.length !== 6} onClick={() => setStep("shop")}>{L("Continue", "தொடர்", "आगे बढ़ें")}</button>
        <p className="fine">Prototype: any six digits work.</p>
      </>}

      {step === "shop" && <>
        {fresh ? <div className="linked"><span><IconCheck /> New merchant account started (simulated)</span><span className="fine">{kit.length ? `Asked for: ${kit.map((k) => ({ qr: "All-in-One QR", soundbox: "Soundbox", card: "card machine", loan: "merchant loan" } as Record<string, string>)[k]).join(", ")}. ` : ""}In the real app the identity check and bank details come next. They are left out of this prototype.</span></div>
          : <div className="linked"><span><IconCheck /> Merchant account found (simulated)</span><span className="fine">QR code, Soundbox and settlement account are linked. No identity check or bank step is needed again.</span></div>}
        <h1 className="h-step">{L("Tell us about the shop", "கடையைப் பற்றிச் சொல்லுங்கள்", "दुकान के बारे में बताइए")}</h1>
        <div className="form">
          <label>{L("Shop name", "கடையின் பெயர்", "दुकान का नाम")}<input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sri Murugan Stores" /></label>
          <label>{L("Your name", "உங்கள் பெயர்", "आपका नाम")}<input className="field" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Selvam" autoComplete="given-name" /></label>
          <div className="lab">{L("What kind of shop", "எந்த வகைக் கடை", "किस तरह की दुकान")}<KindPicks /></div>
          <div className="lab">{L("Where it is", "எங்கே உள்ளது", "कहाँ है")}<Locality value={place} onPick={setPlace} L={L} /></div>
        </div>
        {kind && kind !== "grocery" && <p className="fine">The prototype's item list and suppliers are a grocery's, whatever kind is picked here.</p>}
        <button className="btn btn-primary" disabled={!name.trim() || !kind} onClick={() => setStep("books")}>{L("Continue", "தொடர்", "आगे बढ़ें")}</button>
      </>}

      {step === "books" && <>
        <h1 className="h-step">{L("How do you write bills today?", "இப்போது பில் எப்படி எழுதுகிறீர்கள்?", "अभी बिल कैसे बनाते हैं?")}</h1>
        {([["paper", L("On a paper pad", "காகிதத்தில்", "कागज़ की पर्ची पर"), L("Call out the items as you always do. Saajhedar writes the bill and keeps the stock count.", "எப்போதும் போல பொருட்களைச் சொல்லுங்கள். சாஜேதார் பில் எழுதி இருப்பைக் கணக்கிடும்.", "हमेशा की तरह सामान बोलिए। साझेदार बिल लिखेगा और स्टॉक गिनेगा।")],
          ["app", L("In a billing app", "பில்லிங் ஆப்பில்", "बिलिंग ऐप में"), L("Keep it. Saajhedar reads its exports and sends every sale and payment back to it.", "அதையே வைத்திருங்கள். சாஜேதார் அதிலிருந்து படித்து, ஒவ்வொரு விற்பனையையும் திருப்பி அனுப்பும்.", "उसे रखिए। साझेदार उसकी फ़ाइलें पढ़ेगा और हर बिक्री वापस भेजेगा।")],
          ["none", L("I don't write bills", "பில் எழுதுவதில்லை", "बिल नहीं बनाता"), L("Start now by voice. No typing.", "இப்போதே குரலால் தொடங்குங்கள். தட்டச்சு தேவையில்லை.", "अभी बोलकर शुरू करें। टाइपिंग नहीं।")]] as const).map(([k, title, text]) => (
          <button key={k} className={`choice ${books === k ? "on" : ""}`} onClick={() => setBooks(k)}><span className="row-title">{title}</span><span className="row-detail">{text}</span></button>))}
        <button className="btn btn-primary" onClick={() => setStep("pin")}>{L("Continue", "தொடர்", "आगे बढ़ें")}</button>
      </>}

      {step === "pin" && <>
        <h1 className="h-step">{L("Choose a four-digit PIN", "நான்கு இலக்க PIN தேர்ந்தெடுங்கள்", "चार अंकों का PIN चुनें")}</h1>
        <p className="lede">{L("Saajhedar can suggest and prepare. Money moves only inside rules you speak and sign with this PIN.", "சாஜேதார் பரிந்துரைக்கும், தயார் செய்யும். நீங்கள் சொல்லி இந்த PIN-ஆல் கையொப்பமிட்ட விதிகளுக்குள் மட்டுமே பணம் நகரும்.", "साझेदार सुझाव देगा और तैयारी करेगा। पैसा सिर्फ़ उन नियमों में चलेगा जो आप बोलकर इस PIN से मंज़ूर करेंगे।")}</p>
        <input className="field otp" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} aria-label="Four digit PIN" />
        {error && <p className="warn-line">{error}</p>}
        <button className="btn btn-primary" disabled={pin.length !== 4 || busy} onClick={finish}>{L("Open my shop", "என் கடையைத் திற", "मेरी दुकान खोलें")}</button>
        <p className="fine">The demo shop's stock, suppliers and customers stay in place under your shop's name. "Start the demo again" in the menu puts everything back, PIN 1234.</p>
      </>}
    </div>
  );
}
