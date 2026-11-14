// The week ahead in plain words: live weather and the next festival, and what
// each one means for the shelf.
import type { ReactNode } from "react";
import { useApp } from "../store";
import { nameOf, t } from "../i18n";
import type { Lang, WeatherDay } from "../api";

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
  const { state, lang } = useApp();
  if (!state?.outlook) return null;
  const { weather: w, festival: f } = state.outlook;
  const dayName = (d: string, style: "short" | "long" = "short") => new Date(d + "T00:00:00").toLocaleDateString(lang, { weekday: style });
  const more = w.items.filter((i) => i.pct > 0).slice(0, 3).map((i) => nameOf(i, lang));
  const hi = Math.max(...w.days.slice(0, 5).map((d) => d.tmax));

  const weatherLine = w.rainy_days > 0
    ? { "en-IN": `Rain expected from ${dayName(w.first_rain!, "long")}. ${more.length ? `${list(more, lang)} sell more on wet days, so keep them stocked.` : ""}`,
        "ta-IN": `${dayName(w.first_rain!, "long")} முதல் மழை எதிர்பார்க்கப்படுகிறது. ${more.length ? `மழை நாட்களில் ${list(more, lang)} அதிகம் விற்கும்; இருப்பு வைத்திருங்கள்.` : ""}`,
        "hi-IN": `${dayName(w.first_rain!, "long")} से बारिश की उम्मीद है। ${more.length ? `बारिश में ${list(more, lang)} ज़्यादा बिकते हैं, स्टॉक रखिए।` : ""}` }[lang]
    : w.hot_days > 0
    ? { "en-IN": `Hot days ahead, up to ${hi}°. ${more.length ? `${list(more, lang)} sell more in the heat.` : ""}`,
        "ta-IN": `வெயில் அதிகம், ${hi}° வரை. ${more.length ? `வெயிலில் ${list(more, lang)} அதிகம் விற்கும்.` : ""}`,
        "hi-IN": `गर्मी रहेगी, ${hi}° तक। ${more.length ? `गर्मी में ${list(more, lang)} ज़्यादा बिकते हैं।` : ""}` }[lang]
    : { "en-IN": `No rain this week, around ${hi}°. Nothing to stock up on for the weather.`,
        "ta-IN": `இந்த வாரம் மழை இல்லை, சுமார் ${hi}°. வானிலைக்காக கூடுதல் சரக்கு தேவையில்லை.`,
        "hi-IN": `इस हफ़्ते बारिश नहीं, लगभग ${hi}°। मौसम के लिए अलग से स्टॉक की ज़रूरत नहीं।` }[lang];

  const festLine = f && { "en-IN": `${f.name} is in ${f.in_days} days. These sell many times more that week:`,
    "ta-IN": `${f.name_ta} இன்னும் ${f.in_days} நாட்களில். அந்த வாரம் இவை பல மடங்கு விற்கும்:`,
    "hi-IN": `${f.name_hi} ${f.in_days} दिन में है। उस हफ़्ते ये कई गुना बिकते हैं:` }[lang];

  return (
    <section className="card outlook">
      <header className="outlook-head">
        <h2 className="card-title">{{ "en-IN": "The week ahead", "ta-IN": "வரும் வாரம்", "hi-IN": "आने वाला हफ़्ता" }[lang]}</h2>
        <span className={`live ${w.live ? "on" : ""}`}>{w.live ? { "en-IN": "Live weather", "ta-IN": "நேரடி வானிலை", "hi-IN": "लाइव मौसम" }[lang] : { "en-IN": "Typical for the season", "ta-IN": "பருவ சராசரி", "hi-IN": "मौसमी औसत" }[lang]}</span>
      </header>
      <ol className="wx">
        {w.days.slice(0, compact ? 5 : 7).map((d, i) => (
          <li key={d.day} className={d.kind === "rain" || d.kind === "heavy_rain" ? "wet" : ""}>
            <span className="wx-day">{i === 0 ? { "en-IN": "Today", "ta-IN": "இன்று", "hi-IN": "आज" }[lang] : dayName(d.day)}</span>
            <Wx kind={d.kind} />
            <span className="wx-temp">{d.tmax}°</span>
            <span className="wx-rain">{d.rain_pct >= 30 ? `${d.rain_pct}%` : " "}</span>
          </li>
        ))}
      </ol>
      <p className="outlook-line">{weatherLine}</p>
      {f && (
        <div className="fest">
          <p className="outlook-line">{festLine}</p>
          <ul className="fest-items">
            {f.items.slice(0, compact ? 4 : 6).map((i) => (
              <li key={i.sku} className={i.days_left < 3 ? "low" : ""}>
                <span className="fest-name">{nameOf(i, lang)}</span>
                <span className="fest-lift">{i.lift}×</span>
                <span className="fest-left">{i.days_left < 3 ? `${i.days_left} ${t("daysLeft", lang)}` : { "en-IN": "enough for now", "ta-IN": "இப்போதைக்குப் போதும்", "hi-IN": "अभी काफ़ी है" }[lang]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
