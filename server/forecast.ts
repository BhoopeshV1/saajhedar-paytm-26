// Restock forecast. Deliberately simple and explainable: recent same-weekday
// sales, lifted by what the item did around the last festival, and by weather.
// Every suggestion carries the reasons it was made, so the owner can question it.
import { all, today, addDays, daysBetween } from "./db";
import { currentWeather, type Weather } from "./weather";

export type Festival = { key: string; name: string; name_ta: string; name_hi: string; day: string; items: Record<string, number> };

// Dates checked against public calendars for 2026-27; lifts are illustrative
// until the shop has a year of its own sales to learn them from.
export const FESTIVALS: Festival[] = [
  { key: "deepavali", name: "Deepavali", name_ta: "தீபாவளி", name_hi: "दिवाली", day: "2026-11-08",
    items: { sugar: 2.0, jaggery: 2.0, ghee: 2.2, "oil-sunflower": 1.9, atta: 1.8, rava: 1.8, groundnut: 1.7, agal: 2.5, "oil-lamp": 2.2 } },
  { key: "karthigai", name: "Karthigai Deepam", name_ta: "கார்த்திகை தீபம்", name_hi: "कार्तिगई दीपम", day: "2026-11-24",
    items: { agal: 9, "oil-lamp": 5, wick: 5, pori: 6, jaggery: 3, aval: 2.5, camphor: 3, "oil-gingelly": 2, groundnut: 1.8, coconut: 1.6, matchbox: 1.5 } },
  { key: "pongal", name: "Pongal", name_ta: "பொங்கல்", name_hi: "पोंगल", day: "2027-01-14",
    items: { jaggery: 5, "rice-ponni": 1.8, ghee: 2.5, "dal-toor": 1.3, turmeric: 2, coconut: 2, milk: 1.3 } },
];

export type RestockLine = {
  item_id: number; sku: string; name_en: string; name_ta: string; name_hi: string; unit: string;
  stock: number; daily: number; days_left: number; need: number; order_qty: number; cost: number; line_cost: number;
  supplier_id: number; supplier: string; urgency: "today" | "this_week" | "ok";
  reasons: { code: "low_cover" | "festival" | "weather" | "trend_up" | "trend_down" | "perishable"; text: string; value?: number; days?: number }[];
  standing: { id: number; qty: number; cadence: string; status: string } | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function upcomingFestival(horizon = 14): (Festival & { in_days: number }) | null {
  const t = today();
  const next = FESTIVALS.map((f) => ({ ...f, in_days: daysBetween(t, f.day) }))
    .filter((f) => f.in_days >= 0 && f.in_days <= horizon).sort((a, b) => a.in_days - b.in_days)[0];
  return next ?? null;
}

export function restockPlan(coverDays = 5): { festival: ReturnType<typeof upcomingFestival>; weather: Weather; lines: RestockLine[]; total: number } {
  const t = today();
  const fest = upcomingFestival();
  const weather = currentWeather();
  const items = all(`SELECT i.*, s.name AS supplier, s.lead_days FROM items i JOIN suppliers s ON s.id = i.supplier_id`);
  const standing = all("SELECT * FROM standing_orders WHERE status != 'cancelled'");
  const lines: RestockLine[] = [];

  for (const it of items) {
    const recent = all("SELECT day, qty FROM sales WHERE item_id = ? AND day >= ? ORDER BY day", it.id, addDays(t, -14));
    const prior = all("SELECT qty FROM sales WHERE item_id = ? AND day >= ? AND day < ?", it.id, addDays(t, -28), addDays(t, -14));
    const avg = (rows: any[]) => rows.length ? rows.reduce((s, r) => s + r.qty, 0) / rows.length : 0;
    const base = avg(recent);
    const before = avg(prior);
    const reasons: RestockLine["reasons"] = [];

    let daily = base;
    const trend = before > 0 ? base / before : 1;
    if (trend >= 1.2) reasons.push({ code: "trend_up", text: `Selling ${Math.round((trend - 1) * 100)}% faster than two weeks ago`, value: Math.round((trend - 1) * 100) });
    if (trend <= 0.75) reasons.push({ code: "trend_down", text: `Selling ${Math.round((1 - trend) * 100)}% slower than two weeks ago`, value: Math.round((1 - trend) * 100) });

    // Festival lift applies only to the days before the festival inside the cover window.
    let festLift = 1;
    if (fest && fest.items[it.sku]) {
      const share = Math.min(1, Math.max(1, fest.in_days) / coverDays);
      festLift = 1 + (fest.items[it.sku] - 1) * share;
      reasons.push({ code: "festival", text: `${fest.name} in ${fest.in_days} days: sells about ${fest.items[it.sku]}× then`, value: fest.items[it.sku], days: fest.in_days });
    }
    const wLift = weather.items[it.sku] ?? 1;
    if (wLift > 1.04) reasons.push({ code: "weather", text: `${weather.rainy_days ? "Rain" : "Heat"} forecast: sells about ${Math.round((wLift - 1) * 100)}% more`, value: Math.round((wLift - 1) * 100) });
    daily = daily * festLift * wLift;

    const so = standing.find((s) => s.item_id === it.id) ?? null;
    const incomingDaily = so && so.status === "active" ? (so.cadence === "daily" ? so.qty : so.qty / 7) : 0;
    const netDaily = Math.max(0.01, daily - incomingDaily);
    const daysLeft = incomingDaily >= daily ? 99 : it.stock / netDaily;
    const horizon = coverDays + it.lead_days;
    const need = Math.max(0, netDaily * horizon - it.stock);
    const orderQty = need > 0 && incomingDaily < daily ? Math.ceil(need / it.pack) * it.pack : 0;

    if (daysLeft < 3) reasons.unshift({ code: "low_cover", text: `Only ${round1(daysLeft)} days of stock left`, value: round1(daysLeft) });
    if (it.perishable && orderQty > 0) reasons.push({ code: "perishable", text: "Perishable: order little and often" });

    const urgency: RestockLine["urgency"] = daysLeft < 2 ? "today" : daysLeft < horizon ? "this_week" : "ok";
    lines.push({
      item_id: it.id, sku: it.sku, name_en: it.name_en, name_ta: it.name_ta, name_hi: it.name_hi, unit: it.unit,
      stock: round1(it.stock), daily: round1(daily), days_left: round1(Math.min(daysLeft, 99)), need: round1(need),
      order_qty: orderQty, cost: it.cost, line_cost: Math.round(orderQty * it.cost),
      supplier_id: it.supplier_id, supplier: it.supplier, urgency, reasons,
      standing: so ? { id: so.id, qty: so.qty, cadence: so.cadence, status: so.status } : null,
    });
  }
  const rank = { today: 0, this_week: 1, ok: 2 } as const;
  lines.sort((a, b) => rank[a.urgency] - rank[b.urgency] || a.days_left - b.days_left);
  const total = lines.reduce((s, l) => s + l.line_cost, 0);
  return { festival: fest, weather, lines, total };
}

// Leftover check for standing orders: how much of a perishable is still on the
// shelf against what the standing order will bring.
export function standingOrderHealth() {
  const t = today();
  return all(`SELECT so.*, i.sku, i.name_en, i.name_ta, i.name_hi, i.unit, i.stock, i.cost, s.name AS supplier
              FROM standing_orders so JOIN items i ON i.id = so.item_id JOIN suppliers s ON s.id = so.supplier_id
              WHERE so.status != 'cancelled'`).map((so) => {
    const rows = all("SELECT qty FROM sales WHERE item_id = ? AND day >= ?", so.item_id, addDays(t, -14));
    const daily = rows.length ? rows.reduce((s, r) => s + r.qty, 0) / rows.length : 0;
    const perDay = so.cadence === "daily" ? so.qty : so.qty / 7;
    const surplusPerWeek = Math.max(0, Math.round((perDay - daily) * 7));
    return { ...so, daily: round1(daily), per_day: round1(perDay), leftover: round1(so.stock),
      surplus_per_week: surplusPerWeek, waste_per_week: Math.round(surplusPerWeek * so.cost),
      suggested_qty: so.cadence === "daily" ? Math.ceil(daily / 12) * 12 : Math.ceil((daily * 7) / 10) * 10 };
  });
}

// The week ahead in plain terms: the weather, the next festival and the items
// each one moves. Drives the outlook card and the morning briefing.
export function outlook() {
  const plan = restockPlan();
  const w = plan.weather; const fest = plan.festival;
  const named = (sku: string) => plan.lines.find((l) => l.sku === sku);
  const festival = fest && { key: fest.key, name: fest.name, name_ta: fest.name_ta, name_hi: fest.name_hi, day: fest.day, in_days: fest.in_days,
    items: Object.entries(fest.items).sort((a, b) => b[1] - a[1]).map(([sku, lift]) => { const l = named(sku);
      return l && { sku, name_en: l.name_en, name_ta: l.name_ta, name_hi: l.name_hi, lift, days_left: l.days_left, stock: l.stock, unit: l.unit, order_qty: l.order_qty }; }).filter(Boolean).slice(0, 6) };
  const moved = Object.entries(w.items).filter(([, lift]) => Math.abs(lift - 1) >= 0.04).sort((a, b) => b[1] - a[1])
    .map(([sku, lift]) => { const l = named(sku); return l && { sku, name_en: l.name_en, name_ta: l.name_ta, name_hi: l.name_hi, pct: Math.round((lift - 1) * 100), days_left: l.days_left }; }).filter(Boolean);
  return { weather: { live: w.live, source: w.source, fetched_at: w.fetched_at, now: w.now, days: w.days, rainy_days: w.rainy_days, hot_days: w.hot_days, first_rain: w.first_rain, summary: w.summary, items: moved }, festival };
}
