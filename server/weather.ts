// Live weather for the shop's location, from Open-Meteo (free, no key).
// The forecast reads the cached copy, so a slow or failed fetch never blocks it.
import { get } from "./db";
import { emit } from "./bus";

export type WeatherDay = { day: string; kind: "rain" | "heavy_rain" | "cloud" | "sun" | "hot"; tmax: number; tmin: number; rain_mm: number; rain_pct: number };
export type Weather = {
  live: boolean; fetched_at: string | null; source: string;
  now: { temp: number; kind: WeatherDay["kind"] } | null;
  days: WeatherDay[]; rainy_days: number; hot_days: number; first_rain: string | null;
  summary: string;
  items: Record<string, number>; // sku -> sales lift over the next five days
};

// What weather does to a kirana's sales. Illustrative until the shop has a
// monsoon and a summer of its own sales to learn from.
const RAIN: Record<string, number> = { tea: 1.25, coffee: 1.2, biscuit: 1.15, mixture: 1.15, milk: 1.08, bread: 1.05, matchbox: 1.1, tomato: 0.9 };
const HEAT: Record<string, number> = { curd: 1.3, milk: 1.1, salt: 1.05, tea: 0.92 };

const kindOf = (code: number, mm: number, pct: number, tmax: number): WeatherDay["kind"] =>
  mm >= 20 || code >= 95 || code === 65 || code === 82 ? "heavy_rain" : mm >= 4 || pct >= 60 ? "rain" : tmax >= 35.5 ? "hot" : code >= 2 ? "cloud" : "sun";

function build(days: WeatherDay[], now: Weather["now"], live: boolean): Weather {
  const next = days.slice(0, 5);
  const rainy = next.filter((d) => d.kind === "rain" || d.kind === "heavy_rain");
  const hot = next.filter((d) => d.kind === "hot");
  const items: Record<string, number> = {};
  const blend = (table: Record<string, number>, share: number) => {
    for (const [sku, lift] of Object.entries(table)) items[sku] = Math.round((items[sku] ?? 1) * (1 + (lift - 1) * share) * 100) / 100;
  };
  if (rainy.length) blend(RAIN, Math.min(1, rainy.length / 3));
  if (hot.length) blend(HEAT, Math.min(1, hot.length / 3));
  const hi = Math.round(Math.max(...next.map((d) => d.tmax)));
  const summary = rainy.length >= 3 ? `Rain on ${rainy.length} of the next 5 days`
    : rainy.length ? `Rain likely on ${rainy.length === 1 ? "one day" : "two days"} this week`
    : hot.length ? `Hot week ahead, up to ${hi}°`
    : `Dry week ahead, around ${hi}°`;
  return { live, fetched_at: live ? new Date().toISOString() : null, source: live ? "Open-Meteo" : "Seasonal stand-in (live weather unavailable)",
    now, days, rainy_days: rainy.length, hot_days: hot.length, first_rain: rainy[0]?.day ?? null, summary, items };
}

// Used until the first fetch lands, and if the network is down: a typical
// north-east monsoon week for Chennai in November.
function standIn(): Weather {
  const base = new Date();
  const kinds: WeatherDay["kind"][] = ["cloud", "rain", "rain", "cloud", "heavy_rain", "rain", "cloud"];
  const days = kinds.map((kind, i) => ({ day: new Date(base.getTime() + i * 86400000 + 5.5 * 3600000).toISOString().slice(0, 10), kind,
    tmax: 29, tmin: 24, rain_mm: kind === "heavy_rain" ? 30 : kind === "rain" ? 8 : 0, rain_pct: kind === "cloud" ? 30 : 75 }));
  return build(days, null, false);
}

let cached: Weather = standIn();
export const currentWeather = () => cached;

export async function refreshWeather() {
  try {
    const s = get("SELECT lat, lon FROM shop WHERE id = 1");
    if (!s) return cached;
    // Coordinates are rounded to about a kilometre; that is all a forecast needs.
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${s.lat.toFixed(2)}&longitude=${s.lon.toFixed(2)}` +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max" +
      "&current=temperature_2m,weather_code,precipitation&timezone=Asia%2FKolkata&forecast_days=7";
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`weather ${res.status}`);
    const d = await res.json() as any;
    const days: WeatherDay[] = d.daily.time.map((day: string, i: number) => {
      const mm = d.daily.precipitation_sum[i] ?? 0, pct = d.daily.precipitation_probability_max[i] ?? 0, tmax = d.daily.temperature_2m_max[i];
      return { day, kind: kindOf(d.daily.weather_code[i], mm, pct, tmax), tmax: Math.round(tmax), tmin: Math.round(d.daily.temperature_2m_min[i]), rain_mm: Math.round(mm * 10) / 10, rain_pct: pct };
    });
    const now = d.current ? { temp: Math.round(d.current.temperature_2m), kind: kindOf(d.current.weather_code, (d.current.precipitation ?? 0) * 8, d.current.precipitation > 0 ? 100 : 0, d.current.temperature_2m) } : null;
    const before = cached.summary;
    cached = build(days, now, true);
    if (before !== cached.summary) emit({ type: "refresh" });
  } catch (err) {
    console.warn("[weather] using the last known forecast:", (err as Error).message);
  }
  return cached;
}

export function startWeather() {
  refreshWeather();
  setInterval(refreshWeather, 30 * 60 * 1000);
}
