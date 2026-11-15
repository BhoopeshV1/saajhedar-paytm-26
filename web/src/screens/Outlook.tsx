// The week ahead in plain words: live weather and the next festival, and what
// each one means for the shelf.
import { useState, type ReactNode } from "react";
import { useApp } from "../store";
import { nameOf, t } from "../i18n";
import type { Lang, WeatherDay } from "../api";
import { IconChevron, IconClose } from "../icons";

const ICON: Record<WeatherDay["kind"], ReactNode> = {
  sun: <><circle cx="12" cy="12" r="4.2" fill="#FFC53D" stroke="none" /><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" stroke="#F0A800" /></>,
  hot: <><circle cx="12" cy="12" r="5" fill="#FF8A3D" stroke="none" /><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="#E0621A" /></>,
  cloud: <path d="M7.5 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17.6 11 3.5 3.5 0 0 1 17 18H7.5Z" fill="#DCE6F0" stroke="#9FB0C8" />,
  rain: <><path d="M7.5 15a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17.6 8 3.5 3.5 0 0 1 17 15H7.5Z" fill="#DCE6F0" stroke="#9FB0C8" /><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5" stroke="#00A3D9" /></>,
  heavy_rain: <><path d="M7.5 14a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17.6 7 3.5 3.5 0 0 1 17 14H7.5Z" fill="#B9C8DA" stroke="#7F93AE" /><path d="M8 16.5l-1.4 4M12 16.5l-1.4 4M16 16.5l-1.4 4" stroke="#0077C8" strokeWidth="2.2" /></>,
};
const Wx = ({ kind, size = 26 }: { kind: WeatherDay["kind"]; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON[kind]}</svg>
);

const list = (names: string[], lang: Lang) => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} ${lang === "ta-IN" ? "மற்றும்" : lang === "hi-IN" ? "और" : "and"} ${names[names.length - 1]}`;

export function Outlook({ compact = false }: { compact?: boolean }) {
  const { state, lang, go } = useApp();
  const [source, setSource] = useState(false);
  if (!state?.outlook) return null;
  const L = (en: string, ta: string, hi: string) => (lang === "ta-IN" ? ta : lang === "hi-IN" ? hi : en);
  const { weather: w, festival: f } = state.outlook;
  const dayName = (d: string, style: "short" | "long" = "short") => new Date(d + "T00:00:00").toLocaleDateString(lang, { weekday: style });
  const more = w.items.filter((i) => i.pct > 0).slice(0, 3).map((i) => nameOf(i, lang));
  const hi = Math.max(...w.days.slice(0, 5).map((d) => d.tmax));

  const weatherLine = w.rainy_days > 0
    ? { "en-IN": `Rain from ${dayName(w.first_rain!, "long")}. ${more.length ? `Stock up on ${list(more, lang)}.` : ""}`,
        "ta-IN": `${dayName(w.first_rain!, "long")} முதல் மழை. ${more.length ? `${list(more, lang)} கூடுதலாக வைத்திருங்கள்.` : ""}`,
        "hi-IN": `${dayName(w.first_rain!, "long")} से बारिश। ${more.length ? `${list(more, lang)} का स्टॉक बढ़ाएँ।` : ""}` }[lang]
    : w.hot_days > 0
    ? { "en-IN": `Hot days ahead, up to ${hi}°. ${more.length ? `${list(more, lang)} sell more in the heat.` : ""}`,
        "ta-IN": `வெயில் அதிகம், ${hi}° வரை. ${more.length ? `வெயிலில் ${list(more, lang)} அதிகம் விற்கும்.` : ""}`,
        "hi-IN": `गर्मी रहेगी, ${hi}° तक। ${more.length ? `गर्मी में ${list(more, lang)} ज़्यादा बिकते हैं।` : ""}` }[lang]
    : { "en-IN": `No rain this week, around ${hi}°. Nothing to stock up on for the weather.`,
        "ta-IN": `இந்த வாரம் மழை இல்லை, சுமார் ${hi}°. வானிலைக்காக கூடுதல் சரக்கு தேவையில்லை.`,
        "hi-IN": `इस हफ़्ते बारिश नहीं, लगभग ${hi}°। मौसम के लिए अलग से स्टॉक की ज़रूरत नहीं।` }[lang];

  const sy = state.sync;
  const tile = (d: ReactNode) => <span className="ol-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg></span>;

  return (
    <section className="card outlook">
      <h2 className="card-title">{L("The week ahead", "வரும் வாரம்", "आने वाला हफ़्ता")}</h2>

      <div className="ol-part">
        <header className="ol-head">
          {tile(<><path d="M7.5 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17.6 11 3.5 3.5 0 0 1 17 18z" /><path d="M9 21v-1M13 21v-1M17 21v-1" /></>)}
          <h3 className="ol-title">{L("Weather analysis", "வானிலை பகுப்பாய்வு", "मौसम विश्लेषण")}</h3>
          <span className={`live ${w.live ? "on" : ""}`}>{w.live ? L("Live weather", "நேரடி வானிலை", "लाइव मौसम") : L("Typical for the season", "பருவ சராசரி", "मौसमी औसत")}</span>
        </header>
        <ol className="wx">
          {w.days.slice(0, compact ? 5 : 7).map((d, i) => (
            <li key={d.day} className={d.kind === "rain" || d.kind === "heavy_rain" ? "wet" : ""}>
              <span className="wx-day">{i === 0 ? L("Today", "இன்று", "आज") : dayName(d.day)}</span>
              <Wx kind={d.kind} />
              <span className="wx-temp">{d.tmax}°</span>
              <span className="wx-rain">{d.rain_pct >= 30 ? `${d.rain_pct}%` : " "}</span>
            </li>
          ))}
        </ol>
        <p className="outlook-line">{weatherLine}</p>
      </div>

      {f && (
        <div className="ol-part ol-cal">
          <header className="ol-head">
            {tile(<><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M4 10h16M8 3v4M16 3v4M8.5 14h.01M12 14h.01M15.5 14h.01" /></>)}
            <h3 className="ol-title">{L("Calendar analysis", "நாட்காட்டி பகுப்பாய்வு", "कैलेंडर विश्लेषण")}</h3>
            <span className="chip chip-festival">{lang === "ta-IN" ? f.name_ta : lang === "hi-IN" ? f.name_hi : f.name}: {f.in_days} {t("days", lang)}</span>
          </header>
          <p className="ol-note">{L("Sells this many times more that week", "அந்த வாரம் இத்தனை மடங்கு விற்கும்", "उस हफ़्ते इतने गुना बिकता है")}</p>
          <ul className="fest-items">
            {f.items.slice(0, compact ? 4 : 6).map((i) => (
              <li key={i.sku} className={i.days_left < 3 ? "low" : ""}>
                <span className="fest-name">{nameOf(i, lang)}</span>
                <span className="fest-lift">{i.lift}×</span>
                <span className="fest-left">{i.days_left < 3 ? `${i.days_left} ${t("daysLeft", lang)}` : L("enough for now", "இப்போதைக்குப் போதும்", "अभी काफ़ी है")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button className="ol-source" onClick={() => setSource(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 20V11M12 20V4M19 20v-6" /></svg>
        {L("From historical sales data", "கடந்த விற்பனைத் தரவிலிருந்து", "पिछली बिक्री के आँकड़ों से")}<IconChevron />
      </button>

      {source && (
        <div className="sheet-scrim" onClick={() => setSource(false)}>
          <div className="sheet ol-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sheet-grip" />
            <div className="sheet-top"><h2 className="pin-title">{L("Where this comes from", "இது எங்கிருந்து வருகிறது", "यह कहाँ से आता है")}</h2>
              <button className="icon-btn" onClick={() => setSource(false)} aria-label="Close"><IconClose /></button></div>
            <p className="lede">{L("Saajhedar compares what your shop sold on rainy days and in past festival weeks with a normal week.", "மழை நாட்களிலும் கடந்த பண்டிகை வாரங்களிலும் உங்கள் கடையில் விற்றதை, சாதாரண வாரத்துடன் சாஜேதார் ஒப்பிடுகிறது.", "साझेदार बारिश के दिनों और पिछले त्योहारों के हफ़्तों की आपकी बिक्री की तुलना आम हफ़्ते से करता है।")}</p>
            <ul className="ol-facts">
              <li><b>{L("Your bill book", "உங்கள் பில் புத்தகம்", "आपकी बिल बुक")}</b><span>{L("Every bill you speak or tap is added to the history.", "நீங்கள் சொல்லும் ஒவ்வொரு பில்லும் வரலாற்றில் சேர்கிறது.", "आपका हर बिल इतिहास में जुड़ता है।")}</span></li>
              <li><b>{L("Billing app", "பில்லிங் ஆப்", "बिलिंग ऐप")}</b><span>{sy.target ? `${L("Connected to", "இணைக்கப்பட்டது:", "जुड़ा है:")} ${sy.target.name}` : L("Not connected. Older bills can be brought in from an export.", "இணைக்கப்படவில்லை. பழைய பில்களை ஏற்றுமதிக் கோப்பிலிருந்து கொண்டு வரலாம்.", "जुड़ा नहीं। पुराने बिल एक्सपोर्ट फ़ाइल से लाए जा सकते हैं।")}</span></li>
            </ul>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={() => { setSource(false); go("sell"); }}>{L("Open my bill book", "என் பில் புத்தகத்தைத் திற", "मेरी बिल बुक खोलें")}</button>
              <button className="btn btn-outline" onClick={() => { setSource(false); go("pay"); }}>{L("Bring in bills", "பில்களைக் கொண்டு வா", "बिल लाएँ")}</button>
            </div>
            <p className="fine">{L("In this prototype the shop's past sales are made up.", "இந்த முன்மாதிரியில் கடையின் கடந்த விற்பனை கற்பனையானது.", "इस प्रोटोटाइप में दुकान की पिछली बिक्री बनावटी है।")}</p>
          </div>
        </div>
      )}
    </section>
  );
}
