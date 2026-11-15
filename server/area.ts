// Area view: what kinds of business a locality has, on which streets, and what
// it is thin on compared with similar localities. Built from open data
// (Overture Maps places and OpenStreetMap); see scripts/prep-area.ts.
// In production the same questions would be answered from Paytm's own
// merchant and payment data, grouped so that no single shop is identifiable.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db";
import { SETUP_LAKH, KINDS } from "./kinds";

export class AreaError extends Error {}

const DIR = path.join(DATA_DIR, "area");
const M_LAT = 110574, M_LON = 111320 * Math.cos((13.02 * Math.PI) / 180);
const distM = (aLat: number, aLon: number, bLat: number, bLon: number) => Math.hypot((aLat - bLat) * M_LAT, (aLon - bLon) * M_LON);

type Meta = { bbox: { w: number; s: number; e: number; n: number }; tile: number; anchors: string[]; street_names: string[];
  localities: { name: string; ta: string; type: string; lat: number; lon: number }[];
  streets: { name: string; at: [number, number, number][] }[];
  bench: { name: string; lat: number; lon: number; total: number; counts: number[] }[]; bench_radius: number;
  built_at: string; sources: string[]; counts: Record<string, number> };
type Places = { lat: number[]; lon: number[]; kind: number[]; anchor: number[]; name: string[]; street: number[]; conf: number[] };

let meta: Meta | null = null, P: Places | null = null;
const grid = new Map<string, number[]>();
const PC = 0.005;

export function areaReady() { return fs.existsSync(path.join(DIR, "meta.json")) && fs.existsSync(path.join(DIR, "places.json")); }

function load() {
  if (meta && P) return;
  if (!areaReady()) throw new AreaError("The area dataset has not been built yet. Run scripts/prep-area.ts.");
  meta = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
  P = JSON.parse(fs.readFileSync(path.join(DIR, "places.json"), "utf8"));
  for (let i = 0; i < P!.lat.length; i++) {
    const k = `${Math.floor(P!.lon[i] / PC)}_${Math.floor(P!.lat[i] / PC)}`;
    let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i);
  }
  console.log(`[area] ${P!.lat.length} places, ${meta!.localities.length} localities loaded`);
}

function within(lat: number, lon: number, rM: number): number[] {
  const out: number[] = []; const dLat = rM / M_LAT, dLon = rM / M_LON;
  for (let x = Math.floor((lon - dLon) / PC); x <= Math.floor((lon + dLon) / PC); x++)
    for (let y = Math.floor((lat - dLat) / PC); y <= Math.floor((lat + dLat) / PC); y++)
      for (const i of grid.get(`${x}_${y}`) ?? []) if (distM(lat, lon, P!.lat[i], P!.lon[i]) <= rM) out.push(i);
  return out;
}

// ---------- search ----------
const norm = (s: string) => s.toLowerCase().replace(/\b(rd)\b/g, "road").replace(/\b(st)\b/g, "street").replace(/\b(nagar|ngr)\b/g, "nagar")
  .replace(/[^a-z0-9஀-௿ ]+/g, " ").replace(/\s+/g, " ").trim();

export type Hit = { label: string; ta?: string; type: "locality" | "street"; lat: number; lon: number; score: number };

export function search(q: string, near?: { lat: number; lon: number }, limit = 8): Hit[] {
  load();
  const nq = norm(q); if (!nq) return [];
  const qt = nq.split(" ");
  const score = (name: string) => {
    const nn = norm(name); if (!nn) return 0;
    if (nn === nq) return 100;
    const nt = nn.split(" ");
    const hit = qt.filter((t) => nt.some((w) => w === t || (t.length >= 3 && w.startsWith(t)))).length;
    if (hit < qt.length) return hit === 0 ? 0 : 20 * (hit / qt.length);
    return 60 + 30 * (qt.length / nt.length) + (nn.startsWith(qt[0]) ? 5 : 0);
  };
  const hits: Hit[] = [];
  for (const l of meta!.localities) {
    const s = Math.max(score(l.name), l.ta && q.includes(l.ta) ? 95 : 0);
    if (s >= 50) hits.push({ label: l.name, ta: l.ta || undefined, type: "locality", lat: l.lat, lon: l.lon, score: s + (l.type === "suburb" || l.type === "town" ? 4 : 0) });
  }
  for (const st of meta!.streets) {
    const s = score(st.name);
    if (s < 55) continue;
    // A street name can exist in several parts of the city: prefer the one nearest the context point, else the longest.
    const at = near ? [...st.at].sort((a, b) => distM(near.lat, near.lon, a[0], a[1]) - distM(near.lat, near.lon, b[0], b[1]))[0] : st.at[0];
    hits.push({ label: st.name, type: "street", lat: at[0], lon: at[1], score: s - 6 });
  }
  if (near) for (const h of hits) h.score -= Math.min(8, distM(near.lat, near.lon, h.lat, h.lon) / 4000);
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function nearestLocality(lat: number, lon: number) {
  load();
  let best = meta!.localities[0], bd = Infinity;
  for (const l of meta!.localities) { const d = distM(lat, lon, l.lat, l.lon); if (d < bd) { bd = d; best = l; } }
  return { name: best.name, ta: best.ta, distance_m: Math.round(bd) };
}

// ---------- report ----------
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

// A locality's mix of businesses as shares, leaving out the catch-all "other".
const OTHER = KINDS.findIndex((k) => k.key === "other");
const mix = (c: number[]) => { const t = c.reduce((s, n, i) => s + (i === OTHER ? 0 : n), 0) || 1; return c.map((n, i) => (i === OTHER ? 0 : n / t)); };
const cosine = (a: number[], b: number[]) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / Math.sqrt(x * y || 1); };
// The kinds one mix has much more of than another: what makes it a different sort of place.
const leansTo = (a: number[], b: number[], n: number) => a.map((v, i) => ({ i, d: v - b[i] })).filter((x) => x.d > 0.02).sort((x, y) => y.d - x.d).slice(0, n).map((x) => KINDS[x.i].label);
const median2 = (rows: number[][]) => (rows[0] ?? []).map((_, i) => median(rows.map((r) => r[i])));
const topKinds = (c: number[], n: number) => c.map((v, i) => ({ i, v })).filter((x) => x.i !== OTHER && x.v > 0).sort((a, b) => b.v - a.v).slice(0, n).map((x) => KINDS[x.i].label);

export function report(lat: number, lon: number, radius = 800) {
  load();
  const b = meta!.bbox;
  if (lat < b.s || lat > b.n || lon < b.w || lon > b.e) throw new AreaError("That point is outside the Chennai area this prototype covers.");
  const r = Math.max(300, Math.min(2500, Math.round(radius)));
  const idx = within(lat, lon, r);
  const counts = new Array(KINDS.length).fill(0);
  const anchors: Record<string, { n: number; names: string[] }> = Object.fromEntries(meta!.anchors.map((a) => [a, { n: 0, names: [] as string[] }]));
  const byStreet = new Map<number, { n: number; kinds: number[] }>();
  let total = 0;
  for (const i of idx) {
    const k = P!.kind[i];
    if (k >= 0) {
      counts[k]++; total++;
      const s = P!.street[i];
      if (s > 0) { let e = byStreet.get(s); if (!e) byStreet.set(s, (e = { n: 0, kinds: new Array(KINDS.length).fill(0) })); e.n++; e.kinds[k]++; }
    }
    const a = P!.anchor[i];
    if (a >= 0) { const e = anchors[meta!.anchors[a]]; e.n++; if (e.names.length < 4 && !e.names.includes(P!.name[i])) e.names.push(P!.name[i]); }
  }

  // Peers: localities with the most similar number of listed businesses. Their
  // typical mix says what this area "should" have for its size, which also
  // cancels out much of the uneven coverage in open data.
  const scale = (r * r) / (meta!.bench_radius * meta!.bench_radius);
  const sizeHere = Math.max(1, total / scale);
  const picked = meta!.bench.filter((p) => distM(lat, lon, p.lat, p.lon) > 600)
    .map((p) => ({ p, d: Math.abs(Math.log(p.total) - Math.log(sizeHere)) })).sort((x, y) => x.d - y.d).slice(0, 40).map((x) => x.p);
  // Second look at the peers: size alone lets in areas of a different character
  // (an office district beside a residential one). Compare each peer's mix of
  // businesses with this area's, and drop the ones that are clearly unlike it.
  const hereMix = mix(counts);
  const scored = picked.map((p) => ({ p, sim: cosine(hereMix, mix(p.counts)) }));
  const cut = median(scored.map((x) => x.sim)) - 0.1;
  let keptS = scored.filter((x) => x.sim >= cut);
  if (keptS.length < 20) keptS = [...scored].sort((a, b) => b.sim - a.sim).slice(0, Math.min(20, scored.length));
  const peers = keptS.map((x) => x.p);
  const dropped = scored.filter((x) => !keptS.includes(x)).sort((a, b) => a.sim - b.sim)
    .map((x) => ({ name: x.p.name, similarity: Math.round(x.sim * 100), mostly: leansTo(mix(x.p.counts), hereMix, 3) }));

  const kinds = KINDS.map((k, ki) => {
    const shares = peers.map((p) => p.counts[ki] / p.total);
    const expected = median(shares) * total;
    const before = median(picked.map((p) => p.counts[ki] / p.total)) * total;
    const peerHave = peers.filter((p) => p.counts[ki] > 0).length / Math.max(1, peers.length);
    const actual = counts[ki];
    let nearest: number | null = null;
    if (actual === 0) {
      for (const i of within(lat, lon, 4000)) if (P!.kind[i] === ki) { const d = distM(lat, lon, P!.lat[i], P!.lon[i]); if (nearest == null || d < nearest) nearest = d; }
    }
    const gap = (expected - actual) / Math.sqrt(expected + 1);
    return { key: k.key, label: k.label, ta: k.ta, hi: k.hi, color: k.color, openable: k.openable, count: actual, expected: Math.round(expected * 10) / 10, expected_by_size: Math.round(before * 10) / 10,
      peer_have: Math.round(peerHave * 100), nearest_m: nearest == null ? null : Math.round(nearest), gap: Math.round(gap * 100) / 100,
      level: (expected >= 1.5 && actual <= expected * 0.5 ? "thin" : actual >= expected * 1.6 && actual >= 4 ? "crowded" : "typical") as "thin" | "crowded" | "typical" };
  });

  const gaps = kinds.filter((k) => k.openable && k.level === "thin" && k.peer_have >= 60).sort((a, b) => b.gap - a.gap).slice(0, 6);
  const crowded = kinds.filter((k) => k.key !== "other" && k.level === "crowded").sort((a, b) => a.gap - b.gap).slice(0, 4);

  const streets = [...byStreet].map(([s, e]) => {
    const top = e.kinds.map((n, ki) => ({ ki, n })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 4);
    return { name: meta!.street_names[s], count: e.n, top: top.map((t) => ({ key: KINDS[t.ki].key, label: KINDS[t.ki].label, color: KINDS[t.ki].color, n: t.n })) };
  }).sort((a, b) => b.count - a.count).slice(0, 14);

  const km2 = (Math.PI * r * r) / 1e6;
  const loc = nearestLocality(lat, lon);
  return {
    lat, lon, radius_m: r, locality: loc.name, locality_ta: loc.ta,
    total_listed: total, per_km2: Math.round(total / km2), kinds, gaps, crowded, streets,
    off_street: total - [...byStreet.values()].reduce((s, e) => s + e.n, 0),
    anchors: Object.entries(anchors).map(([key, v]) => ({ key, n: v.n, names: v.names })).filter((a) => a.n > 0),
    peers: peers.slice(0, 5).map((p) => p.name), peer_count: peers.length,
    peer_review: { picked: picked.length, kept: peers.length, dropped, here_mostly: dropped.length ? leansTo(hereMix, median2(scored.filter((x) => !keptS.includes(x)).map((x) => mix(x.p.counts))), 3) : topKinds(counts, 3) },
    confidence: total >= 150 ? "good" : total >= 50 ? "fair" : "low",
    caveat: "Counts are businesses listed in open map data (Overture Maps, OpenStreetMap). Small shops without an online listing are missing, so treat these as a guide, not a census.",
    sources: meta!.sources,
  };
}

// Places and street geometry for drawing the map on the phone.
const tileCache = new Map<string, any>();
function tile(k: string) {
  if (tileCache.has(k)) return tileCache.get(k);
  const f = path.join(DIR, "tiles", `${k}.json`);
  const t = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
  tileCache.set(k, t); if (tileCache.size > 80) tileCache.delete(tileCache.keys().next().value!);
  return t;
}

export function mapData(lat: number, lon: number, radius = 800) {
  load();
  const r = Math.max(300, Math.min(2500, radius)) * 1.45;
  const dLat = r / M_LAT, dLon = r / M_LON;
  const box = { w: lon - dLon, e: lon + dLon, s: lat - dLat, n: lat + dLat };
  const b = meta!.bbox, T = meta!.tile;
  const layers = { roads: [] as any[], water: [] as any[], park: [] as any[], rail: [] as any[], coast: [] as any[] };
  const seen = new Set<string>();
  const overlaps = (pts: number[], from = 0) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = from; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
    return x1 >= box.w && x0 <= box.e && y1 >= box.s && y0 <= box.n;
  };
  for (let x = Math.floor((box.w - b.w) / T); x <= Math.floor((box.e - b.w) / T); x++)
    for (let y = Math.floor((box.s - b.s) / T); y <= Math.floor((box.n - b.s) / T); y++) {
      const t = tile(`${x}_${y}`); if (!t) continue;
      for (const rd of t.roads) {
        const key = `${rd[1]}:${rd[2][0]}:${rd[2][1]}:${rd[2].length}`;
        if (seen.has(key) || !overlaps(rd[2])) continue; seen.add(key);
        layers.roads.push([rd[0], rd[1] ? meta!.street_names[rd[1]] : "", rd[2]]);
      }
      for (const layer of ["water", "park", "rail", "coast"] as const)
        for (const g of t[layer]) {
          const from = layer === "water" ? 1 : 0;
          const key = `${layer}:${g[from]}:${g[from + 1]}:${g.length}`;
          if (seen.has(key) || !overlaps(g, from)) continue; seen.add(key); layers[layer].push(g);
        }
    }
  const places = within(lat, lon, r).filter((i) => P!.kind[i] >= 0 || P!.anchor[i] >= 0)
    .map((i) => [P!.lat[i], P!.lon[i], P!.kind[i], P!.anchor[i], P!.name[i], P!.street[i] ? meta!.street_names[P!.street[i]] : ""]);
  return { box, ...layers, places, kinds: KINDS.map((k) => ({ key: k.key, label: k.label, color: k.color })), anchors: meta!.anchors };
}

export function resolvePlace(place: string, near?: { lat: number; lon: number }) {
  const hits = search(place, near, 5);
  if (!hits.length) throw new AreaError(`No locality or street called "${place}" in the Chennai area. Ask which area they mean.`);
  return hits;
}

// One kind of shop at one spot, with the checks that tried to explain the number
// away. The assistant calls this again with a different place, radius, kind or
// budget to explore "what if" before it recommends anything.
export function checkForAgent(place: string, kind: string, radius?: number, budget?: number, at?: { lat: number; lon: number }) {
  const h = at ? { label: place, lat: at.lat, lon: at.lon } : resolvePlace(place)[0];
  const f = fit(h.lat, h.lon, radius ?? 800, kind, budget ?? null);
  if (!f.chosen || !f.checks) throw new AreaError(`"${kind}" is not a kind of shop this tool knows. Use a kind_key from area_gaps could_open.`);
  const c = f.checks;
  return { place: h.label, lat: h.lat, lon: h.lon, radius_m: f.radius_m, kind: f.chosen.label, here: f.chosen.here, similar_areas_have_about: f.chosen.expected, standing: f.chosen.level,
    rough_setup_lakh: f.chosen.setup_lakh, within_budget: f.chosen.within_budget,
    how_firmly_to_say_it: c.strength === "direction" ? "direction only: lead with the fact that evidence is thin, and do not state the gap as a number" : c.strength === "fair" ? "fairly: mention the one check that did not pass" : c.strength === "firm" ? "firmly: all four checks passed" : "nothing unusual here",
    peers: { picked_by_size: f.peer_review.picked, kept_after_dropping_unlike_areas: f.peer_review.kept, dropped: f.peer_review.dropped.slice(0, 4).map((d) => `${d.name} (leans to ${d.mostly.join(", ")})`),
      usual_number_before_and_after: [c.moved.from, c.moved.to] },
    checks: { enough_data: { businesses_listed: c.coverage.listed, passed: c.coverage.ok }, just_outside_the_circle: { more_within_400_m: c.outside.count, usual: c.outside.usual, passed: c.outside.ok },
      substitutes: { kinds: c.substitutes.kinds.map((s) => `${s.label}: ${s.here} here, about ${s.usual} usual, ${s.level}`), passed: c.substitutes.ok },
      citywide: { percent_of_areas_that_look_the_same: c.citywide.same_pct, passed: c.citywide.ok } },
    what_if: c.what_if.map((w) => ({ move: `600 m ${w.dir}, toward ${w.toward}`, lat: w.lat, lon: w.lon, here: w.here, usual: w.usual, standing: w.level })),
    caveat: f.caveat };
}

// Compact version for the assistant to speak from.
export function reportForAgent(place: string, radius?: number, budget?: number, at?: { lat: number; lon: number }) {
  const hits = at ? [{ label: place, type: "locality" as const, lat: at.lat, lon: at.lon }] : resolvePlace(place);
  const h = hits[0];
  const rep = report(h.lat, h.lon, radius ?? 800);
  return {
    place: h.label, place_type: h.type, lat: h.lat, lon: h.lon, radius_m: rep.radius_m,
    other_matches: hits.slice(1, 4).map((x) => `${x.label} (${x.type})`),
    listed_businesses: rep.total_listed, data_confidence: rep.confidence,
    thin_compared_with_similar_areas: rep.gaps.map((g) => ({ kind: g.label, here: g.count, similar_areas_have_about: g.expected, share_of_similar_areas_with_one: g.peer_have + "%",
      nearest_one_m: g.nearest_m })),
    crowded: rep.crowded.map((g) => ({ kind: g.label, here: g.count, similar_areas_have_about: g.expected })),
    counts: Object.fromEntries(rep.kinds.filter((k) => k.key !== "other").map((k) => [k.label, k.count])),
    busiest_streets: rep.streets.slice(0, 5).map((s) => ({ street: s.name, businesses: s.count, mostly: s.top.slice(0, 2).map((t) => t.label) })),
    brings_people: rep.anchors.map((a) => ({ what: a.key, count: a.n, examples: a.names.slice(0, 2) })),
    similar_areas: rep.peers, caveat: rep.caveat,
    // Every kind a first-time owner could open, for weighing a shortlist.
    could_open: rep.kinds.filter((k) => k.openable).map((k) => {
      const cost = SETUP_LAKH[k.key];
      return { kind_key: k.key, kind: k.label, here: k.count, similar_areas_have_about: k.expected, standing: k.level, nearest_one_m: k.nearest_m,
        rough_setup_lakh: cost ? `${cost[0]} to ${cost[1]}` : null, within_budget: budget && cost ? cost[0] * 100000 <= budget : null };
    }),
    budget_rupees: budget ?? null,
    setup_cost_note: "Setup costs are rough illustrative ranges for this prototype, not quotes.",
  };
}

// Kinds that serve some of the same need, so a gap in one may be filled by another.
const SUBSTITUTES: Record<string, string[]> = {
  grocery: ["produce"], produce: ["grocery"], bakery: ["cafe", "eatery"], cafe: ["bakery", "eatery"], eatery: ["cafe", "bakery"],
  pharmacy: ["clinic"], clinic: ["pharmacy"], stationery: ["gifts"], gifts: ["stationery"], salon: ["fitness"], optician: ["clinic"],
  mobile: ["hardware"], clothing: ["jewellery"], laundry: ["salon"], pets: ["clinic"], tuition: ["stationery"],
};
const COMPASS: [string, number, number][] = [["north", 1, 0], ["east", 0, 1], ["south", -1, 0], ["west", 0, -1]];

// Before a claim ("thin" or "crowded") is shown, try to explain it away. Each
// check asks whether something other than a real gap could produce the same
// number. What survives sets how firmly the claim may be stated.
function checks(rep: ReturnType<typeof report>, k: ReturnType<typeof report>["kinds"][number], budget: number | null) {
  const ki = KINDS.findIndex((x) => x.key === k.key), r = rep.radius_m;
  // 1. Is the data itself thick enough here?
  const coverage = { listed: rep.total_listed, level: rep.confidence, ok: rep.confidence === "good" };
  // 2. Is the picture different just outside the circle?
  let ring = 0;
  for (const i of within(rep.lat, rep.lon, r + 400)) if (P!.kind[i] === ki && distM(rep.lat, rep.lon, P!.lat[i], P!.lon[i]) > r) ring++;
  const ringUsual = k.expected * (((r + 400) ** 2 - r * r) / (r * r));
  const outside = { within_m: 400, count: ring, usual: Math.round(ringUsual * 10) / 10,
    ok: k.level === "thin" ? ring <= ringUsual * 0.6 : k.level === "crowded" ? ring >= ringUsual * 0.6 : true };
  // 3. Does another kind of shop already serve the need?
  const subs = (SUBSTITUTES[k.key] ?? []).map((key) => rep.kinds.find((x) => x.key === key)!).filter(Boolean)
    .map((x) => ({ key: x.key, label: x.label, ta: x.ta, hi: x.hi, here: x.count, usual: Math.round(x.expected * 10) / 10, level: x.level }));
  const substitutes = { kinds: subs, ok: k.level === "thin" ? !subs.some((x) => x.level === "crowded") : k.level === "crowded" ? !subs.some((x) => x.level === "thin") : true };
  // 4. Is it like this everywhere in the city's data, or only here?
  const big = meta!.bench.filter((p) => p.total >= 60);
  const cityShare = median(big.map((p) => p.counts[ki] / p.total));
  const same = big.filter((p) => { const e = cityShare * p.total, c = p.counts[ki];
    return k.level === "thin" ? e >= 1.5 && c <= e * 0.5 : k.level === "crowded" ? c >= e * 1.6 && c >= 4 : false; }).length;
  const citywide = { areas: big.length, same_pct: Math.round((same / Math.max(1, big.length)) * 100), ok: same / Math.max(1, big.length) <= 0.35 };
  // The number that moved when unlike peers were dropped.
  const moved = { from: k.expected_by_size, to: k.expected, changed: Math.abs(k.expected_by_size - k.expected) >= 0.1 };
  // What if: the same shop 600 m away in each direction, and a larger budget.
  const what_if = COMPASS.map(([dir, dy, dx]) => {
    const lat = rep.lat + (dy * 600) / M_LAT, lon = rep.lon + (dx * 600) / M_LON;
    try { const o = report(lat, lon, r), ok = o.kinds[ki]; return { kind: "move" as const, dir, lat, lon, toward: nearestLocality(lat + (dy * 600) / M_LAT, lon + (dx * 600) / M_LON).name, here: ok.count, usual: Math.max(1, Math.round(ok.expected)), level: ok.level, ratio: ok.count / Math.max(1, ok.expected) }; }
    catch { return null; }
  }).filter((x): x is NonNullable<typeof x> => !!x).filter((x) => x.level !== k.level).sort((a, b) => a.ratio - b.ratio).slice(0, 2).map(({ ratio, ...x }) => x);
  const cost = SETUP_LAKH[k.key];
  const more = budget && cost && cost[0] * 100000 > budget ? { kind: "budget" as const, needs_lakh: cost[0], short_lakh: Math.round((cost[0] - budget / 100000) * 10) / 10 } : null;
  // How firmly the claim may be stated.
  const failed = [coverage.ok, outside.ok, substitutes.ok, citywide.ok].filter((x) => !x).length;
  const strength = k.level === "typical" ? "plain" : rep.confidence === "low" || rep.peer_review.kept < 20 || failed >= 2 ? "direction" : failed === 1 || rep.confidence === "fair" ? "fair" : "firm";
  return { claim: k.level, strength, coverage, outside, substitutes, citywide, moved, what_if, more };
}

// For someone who has not opened a shop yet: how one kind of shop would sit in
// this spot, whether the money covers it, and what else the money could open.
export function fit(lat: number, lon: number, radius: number, kind: string | null, budget: number | null) {
  const rep = report(lat, lon, radius || 800);
  const view = (k: (typeof rep.kinds)[number]) => {
    const cost = SETUP_LAKH[k.key] ?? null;
    return { key: k.key, label: k.label, ta: k.ta, hi: k.hi, color: k.color, here: k.count, expected: k.expected, peer_have: k.peer_have, nearest_m: k.nearest_m, level: k.level,
      setup_lakh: cost, within_budget: budget && cost ? cost[0] * 100000 <= budget : null,
      streets: rep.streets.filter((s) => s.top.some((t) => t.key === k.key)).slice(0, 3).map((s) => ({ name: s.name, n: s.top.find((t) => t.key === k.key)!.n })) };
  };
  const chosen = kind ? rep.kinds.find((k) => k.key === kind && k.openable) : null;
  const options = rep.kinds.filter((k) => k.openable && k.key !== kind && k.level !== "crowded" && k.peer_have >= 50)
    .map(view).filter((o) => !budget || o.within_budget !== false).sort((a, b) => (a.level === "thin" ? 0 : 1) - (b.level === "thin" ? 0 : 1) || b.expected - b.here - (a.expected - a.here)).slice(0, 3);
  return { lat: rep.lat, lon: rep.lon, radius_m: rep.radius_m, locality: rep.locality, locality_ta: rep.locality_ta, total_listed: rep.total_listed, confidence: rep.confidence,
    peer_review: rep.peer_review, checks: chosen ? checks(rep, chosen, budget) : null,
    budget, chosen: chosen ? view(chosen) : null, options, crowded: rep.crowded.slice(0, 3).map((k) => ({ label: k.label, ta: k.ta, hi: k.hi, here: k.count, expected: k.expected })),
    anchors: rep.anchors, peers: rep.peers, peer_count: rep.peer_count, caveat: rep.caveat, setup_cost_note: "Setup costs are rough illustrative ranges for this prototype, not quotes." };
}
// Where a second branch of the same kind of shop has room: localities that are
// busy enough, a sensible distance away, and have fewer of that kind than areas
// of their size usually do. Uses the same benchmark as the area report.
export function branchSpots(kind: string, lat: number, lon: number, limit = 5) {
  load();
  const ki = KINDS.findIndex((k) => k.key === kind);
  if (ki < 0) throw new AreaError("That kind of shop is not in the list.");
  const bench = meta!.bench.filter((p) => p.total >= 120);
  const all = meta!.bench;
  return bench.map((p) => {
    const km = distM(lat, lon, p.lat, p.lon) / 1000;
    if (km < 1.5 || km > 10) return null;
    const peers = all.filter((q) => q !== p).map((q) => ({ q, d: Math.abs(Math.log(q.total) - Math.log(p.total)) })).sort((x, y) => x.d - y.d).slice(0, 40);
    const expected = median(peers.map((x) => x.q.counts[ki] / x.q.total)) * p.total;
    const here = p.counts[ki];
    return { name: p.name, lat: p.lat, lon: p.lon, here, expected: Math.round(expected * 10) / 10, listed: p.total, km: Math.round(km * 10) / 10, score: ((expected - here) / Math.sqrt(expected + 1)) / (1 + km / 5) };      // nearer is easier to run
  }).filter((x): x is NonNullable<typeof x> => !!x && x.expected >= 2 && x.here <= x.expected * 0.6)
    .sort((a, b) => b.score - a.score).slice(0, limit).map(({ score, ...rest }) => rest);
}

export const openableKinds = () => KINDS.filter((k) => k.openable).map(({ key, label, ta, hi, color }) => ({ key, label, ta, hi, color }));

export function areaMeta() {
  if (!areaReady()) return { ready: false as const };
  load();
  return { ready: true as const, counts: meta!.counts, sources: meta!.sources, built_at: meta!.built_at, bbox: meta!.bbox };
}
