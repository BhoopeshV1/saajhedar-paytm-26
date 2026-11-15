// Grow my shop: the area data that helped someone start a shop, asked again by
// a merchant who already has one. Three ways to grow, each answered from the
// same listings: the same shop somewhere else, more lines in this shop, or a
// different shop nearby.
import { useEffect, useState } from "react";
import { useApp } from "../store";
import { api, type AreaKind, type BranchSpot, type FitKind, type KindLite } from "../api";
import { IconChevron, IconClose } from "../icons";

type Way = "branch" | "bigger" | "different";
// Kinds a grocery could carry as a shelf rather than open as a separate shop.
const SHELF = new Set(["produce", "bakery", "stationery", "mobile", "hardware", "gifts", "pets", "clothing"]);

const Sprout = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21v-9M12 12c0-3.5-2.5-6-7-6 0 4 2.5 6.5 7 6zM12 15c0-3 2.2-5.5 7-5.5 0 3.8-2.5 5.5-7 5.5z" /></svg>
);
const Spark = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.900 5.600a3 3 0 0 0 1.900 1.900L21.400 11.400l-5.600 1.900a3 3 0 0 0-1.900 1.900L12 20.800l-1.900-5.600a3 3 0 0 0-1.900-1.900L2.600 11.400l5.600-1.900a3 3 0 0 0 1.900-1.900z" /></svg>;

// Set by the welcome page's "Grow your business" door, so the sheet is open on arrival.
export const growIntent = { open: false };

export function GrowCard() {
  const { lang } = useApp();
  const [open, setOpen] = useState(() => growIntent.open);
  useEffect(() => { growIntent.open = false; }, []);
  const L = (en: string, ta: string, hi: string) => lang === "ta-IN" ? ta : lang === "hi-IN" ? hi : en;
  return (
    <>
      <button className="grow-card" onClick={() => setOpen(true)}>
        <span className="grow-icon"><Sprout /></span>
        <span className="row-main"><span className="row-title">{L("Grow my shop", "என் கடையை வளர்க்க", "मेरी दुकान बढ़ाएँ")}</span>
          <span className="row-detail">{L("A second branch, more on the shelf, or a different shop.", "இரண்டாவது கிளை, கூடுதல் பொருட்கள், அல்லது வேறு கடை.", "दूसरी शाखा, और सामान, या अलग दुकान।")}</span></span>
        <IconChevron />
      </button>
      {open && <GrowSheet onClose={() => setOpen(false)} L={L} />}
    </>
  );
}

function GrowSheet({ onClose, L }: { onClose: () => void; L: (en: string, ta: string, hi: string) => string }) {
  const { state, lang, go, setFocus, say, health } = useApp();
  const shop = state!.overview.shop;
  const kindKey: string = (state as any)?.profile?.kind || "grocery";
  const [way, setWay] = useState<Way>("branch");
  const [kinds, setKinds] = useState<KindLite[]>([]);
  const [spots, setSpots] = useState<BranchSpot[] | null>(null);
  const [shelf, setShelf] = useState<AreaKind[] | null>(null);
  const [other, setOther] = useState<FitKind[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fail = (e: any) => setError(e?.message || "Could not read the area.");
    api.kinds().then(setKinds).catch(() => {});
    api.areaBranch(kindKey, shop.lat, shop.lon).then(setSpots).catch(fail);
    api.areaReport(shop.lat, shop.lon, 800).then((r) => setShelf(r.gaps.filter((k) => SHELF.has(k.key) && k.key !== kindKey))).catch(fail);
    api.areaFit(shop.lat, shop.lon, 1500, null, null).then((f) => setOther(f.options.filter((k) => k.key !== kindKey))).catch(fail);
  }, []); // eslint-disable-line

  const name = (k: { label: string; ta?: string; hi?: string }) => (lang === "ta-IN" ? k.ta : lang === "hi-IN" ? k.hi : k.label) || k.label;
  const mine = kinds.find((k) => k.key === kindKey);
  const mineName = mine ? name(mine) : kindKey;
  const see = (lat: number, lon: number, radius_m: number, kind: string) => { onClose(); go("area"); setFocus({ lat, lon, radius_m, kind }); };
  const row = (key: string, title: string, side: string, here: number, usual: number, color: string, onClick: () => void) => (
    <button key={key} className="grow-row" onClick={onClick}>
      <span className="row-title">{title}</span><span className="opt-cost">{side}</span>
      <span className="meter" aria-hidden="true"><b style={{ width: `${Math.min(100, (here / Math.max(1, usual)) * 100)}%`, background: color }} /></span>
      <span className="opt-n">{L(`${here} here, ${Math.round(usual)} in similar areas`, `இங்கே ${here}, இதுபோன்ற பகுதிகளில் ${Math.round(usual)}`, `यहाँ ${here}, ऐसे इलाकों में ${Math.round(usual)}`)}</span>
    </button>
  );
  const none = (text: string) => <p className="empty">{text}</p>;
  const wait = <div className="skeleton" />;
  const ask = `I run a ${mine?.label.toLowerCase() ?? kindKey} shop in ${shop.locality} (map point ${shop.lat.toFixed(5)}, ${shop.lon.toFixed(5)}) and I want to grow. Compare three ways: a second branch of the same shop in another area, adding new lines to my current shop, or opening a different kind of shop nearby. Which would you choose, and what should I watch out for?`;

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet grow-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={L("Grow my shop", "என் கடையை வளர்க்க", "मेरी दुकान बढ़ाएँ")}>
        <div className="sheet-grip" />
        <div className="sheet-top"><div><h2 className="pin-title">{L("Grow my shop", "என் கடையை வளர்க்க", "मेरी दुकान बढ़ाएँ")}</h2>
          <p className="grow-sub">{mineName}, {shop.locality}</p></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconClose /></button></div>
        <div className="seg grow-seg" role="tablist">
          {([["branch", L("Second branch", "இரண்டாவது கிளை", "दूसरी शाखा")], ["bigger", L("Bigger shop", "பெரிய கடை", "बड़ी दुकान")], ["different", L("Different shop", "வேறு கடை", "अलग दुकान")]] as [Way, string][])
            .map(([w, label]) => <button key={w} role="tab" aria-selected={way === w} className={`seg-btn ${way === w ? "on" : ""}`} onClick={() => setWay(w)}>{label}</button>)}
        </div>
        {error && <p className="warn-line">{error}</p>}

        {way === "branch" && <section className="grow-list">
          <p className="grow-lead">{L(`Busy areas with fewer ${mineName.toLowerCase()} shops than usual.`, `${mineName} குறைவாக உள்ள பரபரப்பான பகுதிகள்.`, `व्यस्त इलाके जहाँ ${mineName} कम हैं।`)}</p>
          {spots == null ? wait : spots.length === 0 ? none(L("No clear opening within 10 km.", "10 கிமீ-க்குள் தெளிவான வாய்ப்பு இல்லை.", "10 किमी में कोई साफ़ मौका नहीं।"))
            : spots.map((s) => row(s.name, s.name, `${s.km} km`, s.here, s.expected, mine?.color ?? "#00A3D9", () => see(s.lat, s.lon, 800, kindKey)))}
        </section>}

        {way === "bigger" && <section className="grow-list">
          <p className="grow-lead">{L("Sold thinly around your shop. A shelf of these could bring people in.", "உங்கள் கடையைச் சுற்றி குறைவாகக் கிடைப்பவை. இவற்றை வைத்தால் மக்கள் வருவார்கள்.", "आपकी दुकान के आसपास कम मिलता है। इनकी एक शेल्फ़ ग्राहक ला सकती है।")}</p>
          {shelf == null ? wait : shelf.length === 0 ? none(L("Nothing shelf-sized stands out as missing near you.", "உங்கள் அருகில் குறை எதுவும் தெரியவில்லை.", "आपके पास कोई कमी नहीं दिखती।"))
            : shelf.map((k) => row(k.key, name(k), "800 m", k.count, k.expected, k.color, () => see(shop.lat, shop.lon, 800, k.key)))}
        </section>}

        {way === "different" && <section className="grow-list">
          <p className="grow-lead">{L("Other shops your neighbourhood is short of, within 1.5 km.", "உங்கள் பகுதியில் 1.5 கிமீ-க்குள் குறைவாக உள்ள மற்ற கடைகள்.", "1.5 किमी में आपके इलाके में जो दुकानें कम हैं।")}</p>
          {other == null ? wait : other.length === 0 ? none(L("Nothing stands out as missing near you.", "உங்கள் அருகில் குறை எதுவும் தெரியவில்லை.", "आपके पास कोई कमी नहीं दिखती।"))
            : other.map((k) => row(k.key, name(k), k.setup_lakh ? `₹${k.setup_lakh[0]}–${k.setup_lakh[1]} lakh` : "", k.here, k.expected, k.color, () => see(shop.lat, shop.lon, 1500, k.key)))}
        </section>}

        {health?.claude && <button className="btn btn-ai" onClick={() => { onClose(); go("area"); say(ask); }}><Spark />{L("Ask Saajhedar AI which way to grow", "எப்படி வளர்வது என்று சாஜேதார் AI-யிடம் கேளுங்கள்", "साझेदार AI से पूछें कैसे बढ़ें")}</button>}
        <p className="fine">{L("Tap a row to see it on the map. Counts come from open map listings and miss small shops, so treat them as a guide. Your own sales are not used yet.", "வரைபடத்தில் பார்க்க ஒரு வரியைத் தொடுங்கள். எண்ணிக்கைகள் திறந்த வரைபடத் தரவிலிருந்து; சிறு கடைகள் விடுபடலாம்.", "नक्शे पर देखने के लिए पंक्ति दबाएँ। गिनती खुले नक्शे से है; छोटी दुकानें छूट सकती हैं।")}</p>
      </div>
    </div>
  );
}
