// Builds the area dataset the app serves, from two open sources:
//   - Overture Maps places (businesses, with categories and addresses)
//   - OpenStreetMap (roads, water, parks, rail, transit stops, locality names)
// Inputs are in data/raw (see data/raw/fetch_pbf.sh and scripts/fetch-overture.ts).
// Run: node --experimental-strip-types scripts/prep-area.ts
import { DuckDBInstance } from "@duckdb/node-api";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { KINDS, kindOf, anchorOf } from "../server/kinds.ts";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const RAW = path.join(root, "data/raw");
const OUT = path.join(root, "data/area");
fs.mkdirSync(path.join(OUT, "tiles"), { recursive: true });

const BBOX = { w: 80.02, s: 12.78, e: 80.36, n: 13.26 };
const TILE = 0.02;
const M_LAT = 110574, M_LON = 111320 * Math.cos((13.02 * Math.PI) / 180);
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;
const distM = (aLat: number, aLon: number, bLat: number, bLon: number) => Math.hypot((aLat - bLat) * M_LAT, (aLon - bLon) * M_LON);

async function lines(file: string, each: (f: any) => void) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(RAW, file)) });
  for await (const line of rl) { if (line.trim()) each(JSON.parse(line)); }
}

// ---------- roads ----------
type Road = { cls: number; name: string; pts: number[] }; // pts = [lon,lat,lon,lat...]
const CLS: Record<string, number> = { motorway: 0, trunk: 0, motorway_link: 0, trunk_link: 0, primary: 1, primary_link: 1, secondary: 2, secondary_link: 2,
  tertiary: 3, tertiary_link: 3, unclassified: 4, residential: 4, living_street: 4, pedestrian: 4 };
const roads: Road[] = [];
await lines("roads.geojsonseq", (f) => {
  if (f.geometry?.type !== "LineString") return;
  const p = f.properties;
  const pts: number[] = [];
  for (const [lon, lat] of f.geometry.coordinates) pts.push(r5(lon), r5(lat));
  roads.push({ cls: CLS[p.highway] ?? 4, name: (p["name:en"] || p.name || "").trim(), pts });
});
console.log("roads", roads.length, "named", roads.filter((r) => r.name).length);

// Segment grid for nearest-named-road lookup.
const CELL = 0.001;
const segGrid = new Map<string, [number, number, number, number, number][]>(); // lon1,lat1,lon2,lat2,roadIdx
const nameIdx = new Map<string, number>(); const names: string[] = [""];
const idOf = (name: string) => { let i = nameIdx.get(name); if (i == null) { i = names.length; names.push(name); nameIdx.set(name, i); } return i; };
roads.forEach((r, ri) => {
  if (!r.name) return;
  idOf(r.name);
  for (let i = 0; i + 3 < r.pts.length; i += 2) {
    const [x1, y1, x2, y2] = [r.pts[i], r.pts[i + 1], r.pts[i + 2], r.pts[i + 3]];
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / CELL));
    const seen = new Set<string>();
    for (let s = 0; s <= steps; s++) {
      const k = `${Math.floor((x1 + ((x2 - x1) * s) / steps) / CELL)}_${Math.floor((y1 + ((y2 - y1) * s) / steps) / CELL)}`;
      if (seen.has(k)) continue; seen.add(k);
      let a = segGrid.get(k); if (!a) segGrid.set(k, (a = []));
      a.push([x1, y1, x2, y2, ri]);
    }
  }
});
function nearestStreet(lat: number, lon: number, maxM = 60): number {
  const cx = Math.floor(lon / CELL), cy = Math.floor(lat / CELL);
  let best = maxM, bestRoad = -1;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    for (const [x1, y1, x2, y2, ri] of segGrid.get(`${cx + dx}_${cy + dy}`) ?? []) {
      const ax = (x1 - lon) * M_LON, ay = (y1 - lat) * M_LAT, bx = (x2 - lon) * M_LON, by = (y2 - lat) * M_LAT;
      const vx = bx - ax, vy = by - ay; const len2 = vx * vx + vy * vy;
      const t = len2 ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / len2)) : 0;
      const d = Math.hypot(ax + vx * t, ay + vy * t);
      if (d < best) { best = d; bestRoad = ri; }
    }
  }
  return bestRoad < 0 ? 0 : nameIdx.get(roads[bestRoad].name)!;
}

// ---------- places (Overture) ----------
const db = await DuckDBInstance.create(":memory:");
const con = await db.connect();
const rows = (await con.runAndReadAll(`SELECT name, basic, category, hierarchy, confidence, address, brand, lat, lon
  FROM '${path.join(RAW, "overture_places.parquet")}'
  WHERE name IS NOT NULL AND confidence >= 0.3 AND (status IS NULL OR status = 'open')`)).getRowObjects() as any[];
console.log("overture rows", rows.length);

type Place = { lat: number; lon: number; kind: number; anchor: number; name: string; street: number; conf: number };
const places: Place[] = [];
const seen = new Map<string, number>();
let dupes = 0;
const ANCHORS = ["school", "college", "hospital", "worship", "office", "transit", "bus_stop", "mall", "cinema", "park"];
for (const r of rows) {
  const kind = kindOf(r.basic, r.category, r.hierarchy);
  const anchor = anchorOf(r.basic, r.category, r.hierarchy);
  const lat = r5(r.lat), lon = r5(r.lon);
  const key = `${String(r.name).toLowerCase().replace(/[^a-z0-9஀-௿]+/g, "")}|${Math.round(lat / 0.0006)}|${Math.round(lon / 0.0006)}`;
  const prev = seen.get(key);
  if (prev != null) { dupes++; if (places[prev].conf < r.confidence) places[prev].conf = r.confidence; continue; }
  seen.set(key, places.length);
  places.push({ lat, lon, kind: KINDS.findIndex((k) => k.key === kind), anchor: anchor ? ANCHORS.indexOf(anchor) : -1,
    name: String(r.name).slice(0, 60), street: nearestStreet(lat, lon), conf: Math.round(r.confidence * 100) / 100 });
}
console.log("places kept", places.length, "duplicates dropped", dupes);

// ---------- OSM points: localities, stations, bus stops ----------
type Loc = { name: string; ta: string; type: string; lat: number; lon: number };
const locs: Loc[] = [];
await lines("pois.geojsonseq", (f) => {
  const p = f.properties; const g = f.geometry;
  if (g?.type !== "Point") {
    if ((p.railway === "station" || p.railway === "halt") && g?.coordinates) {
      const c = g.type === "Polygon" ? g.coordinates[0][0] : g.coordinates[0];
      if (Array.isArray(c)) places.push({ lat: r5(c[1]), lon: r5(c[0]), kind: -1, anchor: ANCHORS.indexOf("transit"), name: p.name || "Station", street: 0, conf: 1 });
    }
    return;
  }
  const [lon, lat] = g.coordinates;
  if (p.place && p.name && ["suburb", "neighbourhood", "quarter", "town", "village", "locality"].includes(p.place))
    locs.push({ name: (p["name:en"] || p.name).trim(), ta: p["name:ta"] || "", type: p.place, lat: r5(lat), lon: r5(lon) });
  if (p.railway === "station" || p.railway === "halt" || p.station === "subway")
    places.push({ lat: r5(lat), lon: r5(lon), kind: -1, anchor: ANCHORS.indexOf("transit"), name: p["name:en"] || p.name || "Station", street: 0, conf: 1 });
  else if (p.highway === "bus_stop")
    places.push({ lat: r5(lat), lon: r5(lon), kind: -1, anchor: ANCHORS.indexOf("bus_stop"), name: p["name:en"] || p.name || "Bus stop", street: 0, conf: 1 });
});
// Keep one locality per name+neighbourhood (OSM has duplicates across place types).
const locSeen = new Set<string>();
const localities = locs.filter((l) => {
  if (!/[a-zA-Z]/.test(l.name)) return false;
  const k = l.name.toLowerCase() + "|" + Math.round(l.lat / 0.02) + "|" + Math.round(l.lon / 0.02);
  if (locSeen.has(k)) return false; locSeen.add(k); return true;
});
console.log("localities", localities.length);

// ---------- benchmarks: business mix around every locality ----------
const pGrid = new Map<string, number[]>();
const PC = 0.005;
places.forEach((p, i) => { const k = `${Math.floor(p.lon / PC)}_${Math.floor(p.lat / PC)}`; let a = pGrid.get(k); if (!a) pGrid.set(k, (a = [])); a.push(i); });
function within(lat: number, lon: number, rM: number): number[] {
  const out: number[] = []; const dLat = rM / M_LAT, dLon = rM / M_LON;
  for (let x = Math.floor((lon - dLon) / PC); x <= Math.floor((lon + dLon) / PC); x++)
    for (let y = Math.floor((lat - dLat) / PC); y <= Math.floor((lat + dLat) / PC); y++)
      for (const i of pGrid.get(`${x}_${y}`) ?? []) if (distM(lat, lon, places[i].lat, places[i].lon) <= rM) out.push(i);
  return out;
}
const R_BENCH = 800;
const bench = localities.map((l) => {
  const counts = new Array(KINDS.length).fill(0); let total = 0;
  for (const i of within(l.lat, l.lon, R_BENCH)) { const k = places[i].kind; if (k >= 0) { counts[k]++; total++; } }
  return { name: l.name, lat: l.lat, lon: l.lon, total, counts };
}).filter((b) => b.total >= 25);
console.log("benchmark localities", bench.length);

// ---------- street search index ----------
const streetCells = new Map<number, Map<string, { n: number; lat: number; lon: number }>>();
for (const r of roads) {
  if (!r.name) continue;
  const id = nameIdx.get(r.name)!; const mid = Math.floor(r.pts.length / 4) * 2;
  const lon = r.pts[mid], lat = r.pts[mid + 1]; const ck = `${Math.round(lon / 0.015)}_${Math.round(lat / 0.015)}`;
  let m = streetCells.get(id); if (!m) streetCells.set(id, (m = new Map()));
  const c = m.get(ck) ?? { n: 0, lat: 0, lon: 0 }; c.lat = (c.lat * c.n + lat) / (c.n + 1); c.lon = (c.lon * c.n + lon) / (c.n + 1); c.n++; m.set(ck, c);
}
const streets = [...streetCells].map(([id, m]) => ({ name: names[id], at: [...m.values()].sort((a, b) => b.n - a.n).slice(0, 12).map((c) => [r5(c.lat), r5(c.lon), c.n]) }));

// ---------- map tiles: roads, water, parks, rail ----------
type Tile = { roads: [number, number, number[]][]; water: number[][]; park: number[][]; rail: number[][]; coast: number[][] };
const tiles = new Map<string, Tile>();
const tileOf = (k: string) => { let t = tiles.get(k); if (!t) tiles.set(k, (t = { roads: [], water: [], park: [], rail: [], coast: [] })); return t; };
function tilesFor(pts: number[]): string[] {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
  const out: string[] = [];
  for (let x = Math.floor((x0 - BBOX.w) / TILE); x <= Math.floor((x1 - BBOX.w) / TILE); x++)
    for (let y = Math.floor((y0 - BBOX.s) / TILE); y <= Math.floor((y1 - BBOX.s) / TILE); y++) if (x >= 0 && y >= 0) out.push(`${x}_${y}`);
  return out;
}
// Drop points closer than ~4 m to the previous one; minor streets do not need them.
function thin(pts: number[], minM: number) {
  const out = [pts[0], pts[1]];
  for (let i = 2; i < pts.length - 2; i += 2) if (distM(pts[i + 1], pts[i], out[out.length - 1], out[out.length - 2]) >= minM) out.push(pts[i], pts[i + 1]);
  out.push(pts[pts.length - 2], pts[pts.length - 1]);
  return out;
}
for (const r of roads) { const pts = thin(r.pts, r.cls >= 4 ? 6 : 4); for (const k of tilesFor(pts)) tileOf(k).roads.push([r.cls, r.name ? nameIdx.get(r.name)! : 0, pts]); }
await lines("land.geojsonseq", (f) => {
  const p = f.properties; const g = f.geometry; if (!g) return;
  const rings: number[][][] = g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((c: any) => c[0]) : g.type === "LineString" ? [g.coordinates] : [];
  for (const ring of rings) {
    const pts: number[] = []; for (const [lon, lat] of ring) pts.push(r5(lon), r5(lat));
    if (pts.length < 4) continue;
    const t = thin(pts, 8);
    const layer: keyof Tile | null = p.natural === "coastline" ? "coast" : p.railway ? "rail" : p.leisure === "park" ? (g.type === "LineString" ? null : "park")
      : p.natural === "water" || p.waterway ? "water" : null;
    if (!layer) continue;
    const item = p.waterway && g.type === "LineString" ? [0, ...t] : [1, ...t]; // 0 = line, 1 = area
    for (const k of tilesFor(t)) (tileOf(k)[layer] as number[][]).push(layer === "water" ? item : t);
  }
});
for (const [k, t] of tiles) fs.writeFileSync(path.join(OUT, "tiles", `${k}.json`), JSON.stringify(t));
console.log("tiles", tiles.size);

// ---------- write ----------
fs.writeFileSync(path.join(OUT, "places.json"), JSON.stringify({
  lat: places.map((p) => p.lat), lon: places.map((p) => p.lon), kind: places.map((p) => p.kind), anchor: places.map((p) => p.anchor),
  name: places.map((p) => p.name), street: places.map((p) => p.street), conf: places.map((p) => p.conf),
}));
fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({
  bbox: BBOX, tile: TILE, anchors: ANCHORS, street_names: names, localities, streets, bench, bench_radius: R_BENCH,
  built_at: new Date().toISOString(),
  sources: ["Overture Maps Foundation places, release 2026-10-21.0", "OpenStreetMap contributors (ODbL), Geofabrik extract 2026-11-13"],
  counts: { places: places.length, businesses: places.filter((p) => p.kind >= 0).length, roads: roads.length, localities: localities.length },
}));
const byKind = KINDS.map((k, i) => `${k.key}:${places.filter((p) => p.kind === i).length}`).join(", ");
console.log("by kind:", byKind);
console.log("unclassified businesses:", places.filter((p) => p.kind < 0 && p.anchor < 0).length);
console.log("with street:", places.filter((p) => p.street > 0).length);
for (const f of ["places.json", "meta.json"]) console.log(f, Math.round(fs.statSync(path.join(OUT, f)).size / 1024), "KB");
