// First run. Two doors: an owner links their shop, or someone who has not
// opened one yet checks what a locality is missing before spending anything.
// The phone check and merchant lookup are simulated; nothing reaches Paytm.
import { AreaScan } from "./AreaScan";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { api, inr, type AreaHit, type Fit, type FitKind, type KindLite, type Lang } from "../api";
import { IconCheck, IconChevron } from "../icons";
import { handoff, lakh, askFor } from "../plan";
import { StartKit } from "./StartKit";

type Step = "start" | "phone" | "otp" | "shop" | "books" | "pin" | "fence" | "kind" | "money" | "fit";
// Kinds of shop, grouped for the two-pane picker: groups down the left, shops on the right.
const GROUPS: { key: string; name: [string, string, string]; kinds: string[]; icon: string }[] = [
  { key: "daily", name: ["Daily needs", "அன்றாடத் தேவை", "रोज़ की ज़रूरत"], kinds: ["grocery", "produce", "bakery"], icon: "M4 10h16l-1.5 9h-13zM8 10l3-6M16 10l-3-6" },
  { key: "food", name: ["Eating out", "உணவு", "खाना-पीना"], kinds: ["eatery", "cafe"], icon: "M5 9h11v5a5 5 0 0 1-10 0zM16 10h2a2 2 0 0 1 0 4h-2M8 3v3M12 3v3M5 20h12" },
  { key: "care", name: ["Health and care", "உடல்நலம்", "सेहत और देखभाल"], kinds: ["pharmacy", "optician", "salon", "fitness"], icon: "M12 20s-7-4.4-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5c0 5.1-7 9.5-7 9.5zM12 11v4M10 13h4" },
  { key: "style", name: ["Fashion and gifts", "உடை, பரிசு", "फ़ैशन और गिफ़्ट"], kinds: ["clothing", "gifts"], icon: "M9 4l3 2 3-2 5 3-2 4-2-1v10H8V10l-2 1-2-4z" },
  { key: "tech", name: ["Electronics and repair", "எலக்ட்ரானிக்ஸ், பழுது", "इलेक्ट्रॉनिक्स और मरम्मत"], kinds: ["mobile", "hardware", "auto"], icon: "M14 6a4 4 0 0 0-5 5l-5 5 2 2 5-5a4 4 0 0 0 5-5l-2.5 2.5-2-2z" },
  { key: "service", name: ["Services", "சேவைகள்", "सेवाएँ"], kinds: ["stationery", "tuition", "laundry", "pets"], icon: "M6 4h9l3 3v13H6zM9 10h6M9 14h6" },
];
const DEMO = { phone: "7305229069", code: "482916", shop: "Sri Murugan Stores", owner: "Selvam", kind: "grocery", pin: "1234",
  place: { label: "East Tambaram", type: "locality", lat: 12.92651, lon: 80.13145 } as AreaHit };
const SHOP = "M4 10l1.5-5h13L20 10M4 10v10h16V10M4 10a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M10 20v-5h4v5";
const Glyph = ({ d, size = 22 }: { d: string; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
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
  // Filled in to start with so a demo is a few taps; every field can still be changed.
  const [phone, setPhone] = useState(DEMO.phone); const [otp, setOtp] = useState("");
  const [name, setName] = useState(DEMO.shop); const [owner, setOwner] = useState(DEMO.owner);
  const [kind, setKind] = useState<string | null>(from?.kind ?? DEMO.kind);
  const [place, setPlace] = useState<AreaHit | null>(from ? { label: from.place, type: "locality", lat: from.lat, lon: from.lon } : DEMO.place);
  const [books, setBooks] = useState("paper");
  const [pin, setPin] = useState(DEMO.pin);
  const [budget, setBudget] = useState(from?.budget ?? 500000);
  const [fit, setFit] = useState<Fit | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.kinds().then(setKinds).catch(() => {}); }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); setError(null); }, [step]);
  // The code "arrives" and fills itself in, as it would when the phone reads the SMS. Simulated.
  useEffect(() => {
    if (step !== "otp" || otp) return;
    const timers = DEMO.code.split("").map((_, i) => setTimeout(() => setOtp(DEMO.code.slice(0, i + 1)), 900 + i * 130));
    return () => timers.forEach(clearTimeout);
  }, [step]); // eslint-disable-line

  // The shop picker is one page used from two places: the on-the-fence path and shop setup.
  const [kindFor, setKindFor] = useState<"fence" | "shop">("fence");
  const [group, setGroup] = useState(GROUPS[0].key);
  const [find, setFind] = useState("");
  const prev: Record<Step, Step> = { start: "start", phone: "start", otp: "phone", shop: "otp", books: "shop", pin: "books", fence: "start", kind: kindFor === "shop" ? "shop" : "fence", money: "kind", fit: "money" };
  const openKinds = (from: "fence" | "shop") => { setKindFor(from); setFind(""); setGroup(GROUPS.find((g) => kind && g.kinds.includes(kind))?.key ?? GROUPS[0].key); setStep("kind"); };
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
  const [scanning, setScanning] = useState(false);
  const check = async () => {
    if (!place) { setError(L("Pick an area first.", "முதலில் ஒரு பகுதியைத் தேர்ந்தெடுங்கள்.", "पहले इलाका चुनिए।")); return; }
    setBusy(true); setError(null); setFit(null); setScanning(true);
    // The scan plays while this loads and moves on to the result itself.
    try { setFit(await api.areaFit(place.lat, place.lon, 800, kind, budget)); } catch (e: any) { setScanning(false); setError(e.message); }
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
      <h1 className="h-step">{L("Where would you open?", "எங்கே தொடங்க நினைக்கிறீர்கள்?", "कहाँ खोलना चाहते हैं?")}</h1>
      <div className="form">
        <div className="lab">{L("Area or street", "பகுதி அல்லது தெரு", "इलाका या गली")}<Locality value={place} onPick={setPlace} L={L} /></div>
      </div>
      {error && <p className="warn-line">{error}</p>}
      <p className="fine">{L("Covers Chennai and its suburbs in this prototype.", "இந்த முன்மாதிரி சென்னை மற்றும் புறநகரை மட்டும் உள்ளடக்கியது.", "इस प्रोटोटाइप में केवल चेन्नई और उपनगर शामिल हैं।")}</p>
      <button className="btn btn-primary" onClick={() => { if (!place) { setError(L("Pick an area first.", "முதலில் ஒரு பகுதியைத் தேர்ந்தெடுங்கள்.", "पहले इलाका चुनिए।")); return; } openKinds("fence"); }}>{L("Next", "அடுத்து", "आगे")}</button>
    </div>
  );

  if (step === "kind") {
    const q = find.trim().toLowerCase();
    const shown = q ? kinds.filter((k) => [k.label, k.ta, k.hi].some((n) => n.toLowerCase().includes(q))) : kinds.filter((k) => GROUPS.find((g) => g.key === group)?.kinds.includes(k.key));
    const done = () => setStep(kindFor === "shop" ? "shop" : "money");
    return (
      <div className="welcome kp-page">
        {top}
        <h1 className="h-step">{L("What kind of shop?", "எந்த வகைக் கடை?", "किस तरह की दुकान?")}</h1>
        <input className="field kp-find" type="search" placeholder={L("Search", "தேடு", "खोजें")} value={find} onChange={(e) => setFind(e.target.value)} aria-label={L("Search kinds of shop", "கடை வகைகளைத் தேடு", "दुकान के प्रकार खोजें")} />
        <div className="kp">
          <div className="kp-rail" role="tablist" aria-orientation="vertical">
            {GROUPS.map((g) => <button key={g.key} role="tab" aria-selected={!q && group === g.key} className={`kp-group ${!q && group === g.key ? "on" : ""}`} onClick={() => { setFind(""); setGroup(g.key); }}>
              <span className="kp-ico"><Glyph d={g.icon} /></span>{L(...g.name)}</button>)}
          </div>
          <div className="kp-cards">
            {shown.map((k) => <button key={k.key} className={`kp-card ${kind === k.key ? "on" : ""}`} aria-pressed={kind === k.key} onClick={() => setKind(k.key)}>
              <span className="kp-shop" style={{ color: k.color }}><Glyph d={SHOP} size={30} /></span>{kn(k)}</button>)}
            {shown.length === 0 && <p className="fine kp-none">{L("Nothing matches. Try another word.", "பொருந்தவில்லை. வேறு சொல்லை முயலுங்கள்.", "कुछ नहीं मिला। दूसरा शब्द आज़माएँ।")}</p>}
            {kindFor === "fence" && !q && <button className={`kp-card kp-unsure ${kind == null ? "on" : ""}`} aria-pressed={kind == null} onClick={() => setKind(null)}>{L("Not sure yet. Show me what the area needs.", "இன்னும் தெரியவில்லை. பகுதிக்கு என்ன தேவை என்று காட்டு.", "अभी तय नहीं। दिखाइए इलाके को क्या चाहिए।")}</button>}
          </div>
        </div>
        <button className="btn btn-primary kp-confirm" onClick={done} disabled={kindFor === "shop" && !kind}>{L("Confirm", "உறுதிசெய்", "पक्का करें")}</button>
      </div>
    );
  }

  if (step === "money") return (
    <div className="welcome">
      {top}
      <h1 className="h-step">{L("How much can you put in?", "எவ்வளவு முதலீடு செய்ய முடியும்?", "कितना लगा सकते हैं?")}</h1>
      <div className="money-picks">{BUDGETS.map((b) => <button key={b} className={`money-pick ${budget === b ? "on" : ""}`} aria-pressed={budget === b} onClick={() => setBudget(b)}>{lakh(b)}</button>)}</div>
      {error && <p className="warn-line">{error}</p>}
      <button className="btn btn-primary" onClick={check} disabled={busy}>{L("Show me the area", "பகுதியைக் காட்டு", "इलाका दिखाएँ")}</button>
      {scanning && place && <AreaScan lat={place.lat} lon={place.lon} label={place.label} kind={kind} ready={fit != null} L={L} onDone={() => { setScanning(false); setStep("fit"); }} />}
    </div>
  );

  if (step === "fit" && fit) {
    const c = fit.chosen;
    const word = (k: FitKind) => k.level === "thin" ? L("Room for one more", "இன்னொன்றுக்கு இடம் உண்டு", "एक और की जगह है") : k.level === "crowded" ? L("Already crowded", "ஏற்கனவே நெரிசல்", "पहले से भीड़") : L("About average", "சராசரி அளவு", "लगभग औसत");
    const cost = (k: FitKind) => k.setup_lakh ? `₹${k.setup_lakh[0]}–${k.setup_lakh[1]} lakh` : null;
    return (
      <div className="welcome arrive">
        {top}
        <p className="step-name">{place?.label ?? fit.locality}, {fit.radius_m} m</p>
        {c ? (
          <div className={`verdict ${c.level}`}>
            <span className="verdict-word">{kn(c)}</span>
            <span className="verdict-line">{word(c)}</span>
            <div className="vs">
              <div><b>{c.here}</b><span>{L("here", "இங்கே", "यहाँ")}</span></div>
              <i aria-hidden="true" />
              <div className="vs-peer"><b>{Math.round(c.expected)}</b><span>{L("in similar areas", "இதுபோன்ற பகுதிகளில்", "ऐसे इलाकों में")}</span></div>
            </div>
            {c.nearest_m != null && <span className="verdict-near">{L(`Nearest one is ${c.nearest_m} m away`, `அருகிலுள்ளது ${c.nearest_m} மீ தொலைவில்`, `सबसे पास वाली ${c.nearest_m} मी दूर`)}</span>}
            {cost(c) && <span className={`verdict-money ${c.within_budget ? "" : "verdict-money-over"}`}>{c.within_budget ? L(`${lakh(budget)} covers it`, `${lakh(budget)} போதும்`, `${lakh(budget)} काफ़ी है`) : L(`Needs ${cost(c)}`, `தேவை ${cost(c)}`, `चाहिए ${cost(c)}`)}</span>}
          </div>
        ) : (
          <div className="verdict">
            <span className="verdict-word">{lakh(budget)}</span>
            <span className="verdict-line">{fit.options.length ? L("What this area is short of", "இந்தப் பகுதியில் குறைவாக உள்ளவை", "इस इलाके में ये कम हैं") : L("Nothing stands out as missing", "குறை எதுவும் தெரியவில்லை", "कोई कमी नहीं दिखती")}</span>
          </div>
        )}
        {c && c.streets.length > 0 && <section className="card"><h2 className="card-title">{L("Where they are", "எங்கே உள்ளன", "कहाँ हैं")}</h2>
          <div className="tags">{c.streets.map((s) => <span key={s.name} className="tag">{s.name}</span>)}</div></section>}
        {fit.options.length > 0 && <section className="card"><h2 className="card-title">{c ? L("Other options", "மற்ற வாய்ப்புகள்", "और विकल्प") : L("Options", "வாய்ப்புகள்", "विकल्प")}</h2>
          {fit.options.slice(0, 4).map((o) => { const usual = Math.max(1, Math.round(o.expected)); return (
            <div key={o.key} className="opt"><i style={{ background: o.color }} /><span className="row-title">{kn(o)}</span>{cost(o) && <span className="opt-cost">{cost(o)}</span>}
              <span className="meter" aria-hidden="true"><b style={{ width: `${Math.min(100, (o.here / usual) * 100)}%`, background: o.color }} /></span>
              <span className="opt-n">{L(`${o.here} here, ${usual} in similar areas`, `இங்கே ${o.here}, இதுபோன்ற பகுதிகளில் ${usual}`, `यहाँ ${o.here}, ऐसे इलाकों में ${usual}`)}</span></div>); })}</section>}
        {fit.peers.length > 0 && <section className="card"><h2 className="card-title">{L(`Compared with ${fit.peer_count} similar areas`, `${fit.peer_count} ஒத்த பகுதிகளுடன் ஒப்பீடு`, `${fit.peer_count} मिलते-जुलते इलाकों से तुलना`)}</h2>
          <p className="fine">{L("Similar means about as many businesses listed nearby as here. Their usual mix shows what an area this busy tends to have.", "ஒத்த பகுதி என்றால், இங்குள்ள அளவுக்கு அருகில் வணிகங்கள் உள்ள பகுதி. அவற்றின் வழக்கமான கலவை, இவ்வளவு பரபரப்பான பகுதியில் என்ன இருக்கும் என்று காட்டுகிறது.", "मिलता-जुलता यानी आसपास लगभग उतने ही कारोबार। उनका आम मेल बताता है कि इतने व्यस्त इलाके में क्या होता है।")}</p>
          <div className="tags">{fit.peers.map((n) => <span key={n} className="tag tag-plain">{n}</span>)}</div></section>}
        {fit.anchors.length > 0 && <section className="card"><h2 className="card-title">{L("Who comes here", "யார் வருகிறார்கள்", "यहाँ कौन आता है")}</h2>
          <div className="tags">{fit.anchors.slice(0, 5).map((a) => <span key={a.key} className="tag">{ANCHOR[a.key] ?? a.key}<b>{a.n}</b></span>)}</div></section>}
        <details className="about"><summary>{L("About these numbers", "இந்த எண்களைப் பற்றி", "इन आँकड़ों के बारे में")}</summary>
          <p className="fine">{fit.total_listed} businesses are listed around this spot. {fit.caveat} {fit.setup_cost_note}</p>
          {fit.crowded.length > 0 && <p className="fine">Already crowded here: {fit.crowded.map((k) => `${kn(k).toLowerCase()} (${k.here})`).join(", ")}.</p>}</details>
        <StartKit chosen={c} budget={budget} kit={kit} setKit={setKit} L={L} />
        {health?.claude && <div className="ai-ask"><button className="btn btn-ai" onClick={() => toMap(true)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 5.6a3 3 0 0 0 1.9 1.9L21.4 11.4l-5.6 1.9a3 3 0 0 0-1.9 1.9L12 20.8l-1.9-5.6a3 3 0 0 0-1.9-1.9L2.6 11.4l5.6-1.9a3 3 0 0 0 1.9-1.9zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" /></svg>
          {L("Ask Saajhedar AI what to open", "சாஜேதார் AI-யிடம் கேளுங்கள்", "साझेदार AI से पूछें क्या खोलें")}</button>
          <p className="fine">{L("It reads these numbers and answers aloud with two or three picks, each with a reason and a risk.", "இந்த எண்களைப் படித்து, இரண்டு மூன்று தேர்வுகளை காரணத்துடனும் ஆபத்துடனும் சொல்லும்.", "यह ये आँकड़े पढ़कर दो-तीन विकल्प बताता है, हर एक की वजह और जोखिम के साथ।")}</p></div>}
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
        <p className="fine">Prototype: no SMS is sent. The code fills itself in to show how it would be read from the message; any six digits work.</p>
      </>}

      {step === "shop" && <>
        {fresh ? <div className="linked"><span><IconCheck /> New merchant account started (simulated)</span><span className="fine">{kit.length ? `Asked for: ${kit.map((k) => ({ qr: "All-in-One QR", soundbox: "Soundbox", card: "card machine", loan: "merchant loan" } as Record<string, string>)[k]).join(", ")}. ` : ""}In the real app the identity check and bank details come next. They are left out of this prototype.</span></div>
          : <div className="linked"><span><IconCheck /> Merchant account found (simulated)</span><span className="fine">QR code, Soundbox and settlement account are linked. No identity check or bank step is needed again.</span></div>}
        <h1 className="h-step">{L("Tell us about the shop", "கடையைப் பற்றிச் சொல்லுங்கள்", "दुकान के बारे में बताइए")}</h1>
        <div className="form">
          <label>{L("Shop name", "கடையின் பெயர்", "दुकान का नाम")}<input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sri Murugan Stores" /></label>
          <label>{L("Your name", "உங்கள் பெயர்", "आपका नाम")}<input className="field" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Selvam" autoComplete="given-name" /></label>
          <div className="lab">{L("What kind of shop", "எந்த வகைக் கடை", "किस तरह की दुकान")}<button className="field kp-open" onClick={() => openKinds("shop")}><span>{kind ? kn(kinds.find((k) => k.key === kind) ?? { label: kind, ta: kind, hi: kind }) : L("Choose", "தேர்ந்தெடுங்கள்", "चुनें")}</span><IconChevron dir="down" /></button></div>
          <div className="lab">{L("Where it is", "எங்கே உள்ளது", "कहाँ है")}<Locality value={place} onPick={setPlace} L={L} /></div>
        </div>
        {kind && kind !== "grocery" && <p className="fine">The prototype's item list and suppliers are a grocery's, whatever kind is picked here.</p>}
        <button className="btn btn-primary" disabled={!name.trim() || !kind} onClick={() => setStep("books")}>{L("Continue", "தொடர்", "आगे बढ़ें")}</button>
      </>}

      {step === "books" && <>
        <h1 className="h-step">{L("How do you write bills today?", "இப்போது பில் எப்படி எழுதுகிறீர்கள்?", "अभी बिल कैसे बनाते हैं?")}</h1>
        {([["paper", "M5 3h10l4 4v14H5zM15 3v4h4M8 11h8M8 14.5h8M8 18h5", L("On paper", "காகிதத்தில்", "कागज़ पर"), L("Say the items. Saajhedar writes the bill.", "பொருட்களைச் சொல்லுங்கள். சாஜேதார் பில் எழுதும்.", "सामान बोलिए। साझेदार बिल लिखेगा।")],
          ["app", "M9 2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 5h2M12 18.5h.01", L("In a billing app", "பில்லிங் ஆப்பில்", "बिलिंग ऐप में"), L("Keep it. Saajhedar works with it.", "அதையே வைத்திருங்கள். சாஜேதார் அதனுடன் இயங்கும்.", "उसे रखिए। साझेदार उसके साथ चलेगा।")],
          ["none", "M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4", L("No bills yet", "பில் இல்லை", "अभी बिल नहीं"), L("Start by voice.", "குரலால் தொடங்குங்கள்.", "बोलकर शुरू करें।")]] as const).map(([k, icon, title, text]) => (
          <button key={k} className={`choice choice-icon ${books === k ? "on" : ""}`} aria-pressed={books === k} onClick={() => setBooks(k)}><span className="choice-glyph"><Glyph d={icon} size={24} /></span>
            <span className="row-main"><span className="row-title">{title}</span><span className="row-detail">{text}</span></span></button>))}
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
