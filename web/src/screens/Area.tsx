// Area view: what a locality has, street by street, and what it is thin on.
// The map is drawn on a canvas from open street and business data.
import { useCallback, useEffect, useRef, useState } from "react";
import { handoff, lakh, askFor, type Plan } from "../plan";
import { StartKit } from "./StartKit";
import { useApp } from "../store";
import { api, type AreaHit, type AreaKind, type AreaMap, type AreaReport, type Lang, type Shortlist } from "../api";
import { t } from "../i18n";
import { IconSearch, IconClose } from "../icons";

const RADII = [400, 800, 1500];
const M_LAT = 110574;
const ANCHOR_LABEL: Record<string, [string, string, string]> = {
  school: ["Schools", "பள்ளிகள்", "स्कूल"], college: ["Colleges", "கல்லூரிகள்", "कॉलेज"], hospital: ["Hospitals", "மருத்துவமனைகள்", "अस्पताल"],
  worship: ["Temples, churches, mosques", "கோயில், தேவாலயம், மசூதி", "मंदिर, चर्च, मस्जिद"], office: ["Offices", "அலுவலகங்கள்", "दफ़्तर"],
  transit: ["Rail and metro stations", "ரயில், மெட்ரோ நிலையங்கள்", "रेल, मेट्रो स्टेशन"], bus_stop: ["Bus stops", "பேருந்து நிறுத்தங்கள்", "बस स्टॉप"],
  mall: ["Malls and markets", "மால், சந்தை", "मॉल, बाज़ार"], cinema: ["Cinemas", "திரையரங்குகள்", "सिनेमा"], park: ["Parks", "பூங்காக்கள்", "पार्क"],
};
const li = (lang: Lang) => (lang === "ta-IN" ? 1 : lang === "hi-IN" ? 2 : 0);
const kindName = (k: { label: string; ta?: string; hi?: string }, lang: Lang) => (lang === "ta-IN" ? k.ta : lang === "hi-IN" ? k.hi : undefined) || k.label;
const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10} m`);

type Picked = { name: string; kind: string; street: string; x: number; y: number } | null;

function StreetMap({ map, center, radius, only, shop, onMove, onPick, picked }: {
  map: AreaMap | null; center: { lat: number; lon: number }; radius: number; only: string | null; shop: { lat: number; lon: number } | null;
  onMove: (lat: number, lon: number) => void; onPick: (p: Picked) => void; picked: Picked;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const [full, setFull] = useState(false);
  const [box, setBox] = useState({ w: 360, h: 360 });
  // The view lives in a ref and is painted on animation frames, so dragging
  // and pinching never wait for React.
  const view = useRef({ lat: center.lat, lon: center.lon, k: 360 / (radius * 2.5) });
  const baked = useRef<{ cv: HTMLCanvasElement; lat: number; lon: number; k: number; w: number; h: number } | null>(null);
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: false, travel: 0, dist: 0, lastTap: 0 });
  const timers = useRef<{ raf: number; idle: any }>({ raf: 0, idle: 0 });
  const live = useRef({ map, only, shop, radius, box, center, onMove, onPick });
  live.current = { map, only, shop, radius, box, center, onMove, onPick };

  const mLon = (lat: number) => M_LAT * Math.cos((lat * Math.PI) / 180);
  const fit = () => Math.min(live.current.box.w, live.current.box.h) / (live.current.radius * 2.5);

  // Draws the streets and businesses once, a little larger than the screen,
  // so a drag can slide the picture before it is drawn again.
  const bake = useCallback(() => {
    const { map, only, shop, box } = live.current; const v = view.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = box.w * 2, H = box.h * 2;
    const cv = baked.current?.cv ?? document.createElement("canvas");
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#EEF4F8"; g.fillRect(0, 0, W, H);
    baked.current = { cv, lat: v.lat, lon: v.lon, k: v.k, w: W, h: H };
    if (!map) return;
    const ml = mLon(v.lat);
    const X = (lon: number) => W / 2 + (lon - v.lon) * ml * v.k, Y = (lat: number) => H / 2 - (lat - v.lat) * M_LAT * v.k;
    g.lineJoin = "round"; g.lineCap = "round";
    const path = (pts: number[], from = 0) => {
      g.beginPath();
      for (let i = from; i < pts.length; i += 2) { const x = X(pts[i]), y = Y(pts[i + 1]); i === from ? g.moveTo(x, y) : g.lineTo(x, y); }
    };
    g.fillStyle = "#DCEFD9"; for (const p of map.park) { path(p); g.fill(); }
    for (const w of map.water) {
      path(w, 1);
      if (w[0] === 1) { g.fillStyle = "#BFE3F5"; g.fill(); } else { g.strokeStyle = "#BFE3F5"; g.lineWidth = 3; g.stroke(); }
    }
    g.strokeStyle = "#BFE3F5"; g.lineWidth = 2; for (const c of map.coast) { path(c); g.stroke(); }

    const z = Math.max(0.55, Math.min(2.6, v.k * 4.2));
    const Wd = [7.5, 6, 4.6, 3.6, 2.2].map((w) => w * z);
    const roads = [...map.roads].sort((a, b) => b[0] - a[0]);
    g.strokeStyle = "#CBD8E3"; for (const r of roads) { path(r[2]); g.lineWidth = Wd[r[0]] + 1.6; g.stroke(); }
    for (const r of roads) { path(r[2]); g.strokeStyle = r[0] <= 1 ? "#FFE9A8" : "#FFFFFF"; g.lineWidth = Wd[r[0]]; g.stroke(); }
    g.strokeStyle = "#8B98A9"; g.lineWidth = 1.6; g.setLineDash([7, 5]); for (const r of map.rail) { path(r); g.stroke(); } g.setLineDash([]);

    // Street names: more of them appear as you zoom in.
    g.font = `500 ${Math.round(10 + Math.min(3, z))}px Inter, system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    const used: [number, number][] = []; const named = new Set<string>();
    const maxCls = v.k > 0.45 ? 4 : v.k > 0.2 ? 3 : 2;
    for (const r of [...roads].reverse()) {
      const [cls, name, pts] = r; if (!name || named.has(name) || cls > maxCls) continue;
      const mid = Math.floor(pts.length / 4) * 2; if (mid < 2) continue;
      const x1 = X(pts[mid - 2]), y1 = Y(pts[mid - 1]), x2 = X(pts[mid]), y2 = Y(pts[mid + 1]);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      if (mx < 0 || my < 0 || mx > W || my > H) continue;
      if (used.some(([ux, uy]) => Math.hypot(ux - mx, uy - my) < 120)) continue;
      let ang = Math.atan2(y2 - y1, x2 - x1); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      const label = name.length > 26 ? name.slice(0, 24) + "…" : name;
      g.save(); g.translate(mx, my); g.rotate(ang);
      g.strokeStyle = "rgba(255,255,255,.92)"; g.lineWidth = 3.5; g.strokeText(label, 0, 0);
      g.fillStyle = "#4A5B74"; g.fillText(label, 0, 0); g.restore();
      used.push([mx, my]); named.add(name);
      if (used.length > 28) break;
    }

    // Businesses: grey first, coloured kinds over them.
    const dot = Math.max(3, Math.min(8, v.k * 17));
    const other = map.kinds.findIndex((k) => k.key === "other");
    const draw = (p: AreaMap["places"][number], muted: boolean) => {
      const x = X(p[1]), y = Y(p[0]);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) return;
      g.beginPath(); g.arc(x, y, muted ? dot * 0.62 : dot, 0, Math.PI * 2);
      g.fillStyle = muted ? "rgba(140,153,171,.55)" : map.kinds[p[2]].color; g.fill();
      if (!muted) { g.strokeStyle = "#fff"; g.lineWidth = 1; g.stroke(); }
    };
    const shops = map.places.filter((p) => p[2] >= 0);
    for (const p of shops) if (only ? map.kinds[p[2]].key !== only : p[2] === other) draw(p, true);
    for (const p of shops) if (only ? map.kinds[p[2]].key === only : p[2] !== other) draw(p, false);

    if (shop) {
      const x = X(shop.lon), y = Y(shop.lat);
      g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fillStyle = "#002970"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2.5; g.stroke();
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fillStyle = "#00B9F1"; g.fill();
    }
  }, []);

  // Puts the baked picture on screen at the current view, then the ring.
  const paint = useCallback(() => {
    const cv = ref.current, b = baked.current; if (!cv || !b) return;
    const { box, radius } = live.current; const v = view.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#EEF4F8"; g.fillRect(0, 0, box.w, box.h);
    const s = v.k / b.k;
    const cx = box.w / 2 + (b.lon - v.lon) * mLon(v.lat) * v.k, cy = box.h / 2 - (b.lat - v.lat) * M_LAT * v.k;
    g.drawImage(b.cv, cx - (b.w * s) / 2, cy - (b.h * s) / 2, b.w * s, b.h * s);
    // The ring stays in the middle: whatever is inside it is what gets counted.
    const mx = box.w / 2, my = box.h / 2, rr = radius * v.k;
    g.beginPath(); g.rect(0, 0, box.w, box.h); g.arc(mx, my, rr, 0, Math.PI * 2, true);
    g.fillStyle = "rgba(238,244,248,.55)"; g.fill("evenodd");
    g.beginPath(); g.arc(mx, my, rr, 0, Math.PI * 2); g.strokeStyle = "#002970"; g.lineWidth = 1.5; g.setLineDash([2, 5]); g.stroke(); g.setLineDash([]);
    if (gesture.current.moved) {
      g.strokeStyle = "#002970"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(mx - 7, my); g.lineTo(mx + 7, my); g.moveTo(mx, my - 7); g.lineTo(mx, my + 7); g.stroke();
    }
  }, []);

  // After a gesture settles: redraw sharply, and tell the page if the centre moved.
  const settle = useCallback(() => {
    clearTimeout(timers.current.idle);
    timers.current.idle = setTimeout(() => {
      if (fingers.current.size) return;
      gesture.current.moved = false;
      bake(); paint();
      const { center, radius, onMove } = live.current; const v = view.current;
      const moved = Math.hypot((v.lat - center.lat) * M_LAT, (v.lon - center.lon) * mLon(v.lat));
      if (moved > radius * 0.06) onMove(v.lat, v.lon);
    }, 160);
  }, [bake, paint]);
  const frame = useCallback(() => { cancelAnimationFrame(timers.current.raf); timers.current.raf = requestAnimationFrame(paint); }, [paint]);

  const zoomAt = useCallback((px: number, py: number, f: number) => {
    const v = view.current, { box } = live.current, base = fit();
    const k = Math.max(base * 0.8, Math.min(base * 10, v.k * f));
    const ml = mLon(v.lat);
    const lon = v.lon + (px - box.w / 2) / (ml * v.k), lat = v.lat - (py - box.h / 2) / (M_LAT * v.k);
    v.k = k; v.lon = lon - (px - box.w / 2) / (ml * k); v.lat = lat + (py - box.h / 2) / (M_LAT * k);
  }, []); // eslint-disable-line
  const zoomBy = (f: number) => { live.current.onPick(null); zoomAt(live.current.box.w / 2, live.current.box.h / 2, f); frame(); settle(); };

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure); ro.observe(el); measure();
    return () => ro.disconnect();
  }, []);
  // A new place (search, the assistant, "my shop") moves the view to it.
  useEffect(() => { view.current.lat = center.lat; view.current.lon = center.lon; }, [center.lat, center.lon]);
  useEffect(() => { view.current.k = fit(); }, [radius, box.w, box.h]); // eslint-disable-line
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = box.w * dpr; cv.height = box.h * dpr;
    bake(); paint();
  }, [map, only, shop?.lat, shop?.lon, center.lat, center.lon, radius, box.w, box.h, bake, paint]);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); const b = cv.getBoundingClientRect(); live.current.onPick(null); zoomAt(e.clientX - b.left, e.clientY - b.top, Math.exp(-e.deltaY * 0.0022)); frame(); settle(); };
    cv.addEventListener("wheel", wheel, { passive: false });
    return () => cv.removeEventListener("wheel", wheel);
  }, [zoomAt, frame, settle]);
  useEffect(() => {
    if (!full) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    document.body.style.overflow = "hidden"; addEventListener("keydown", esc);
    return () => { document.body.style.overflow = ""; removeEventListener("keydown", esc); };
  }, [full]);

  const at = (e: React.PointerEvent) => { const b = ref.current!.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  const two = () => { const [a, b] = [...fingers.current.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  const down = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    fingers.current.set(e.pointerId, at(e));
    if (fingers.current.size === 1) { gesture.current.moved = false; gesture.current.travel = 0; }
    if (fingers.current.size === 2) { gesture.current.dist = two().d; gesture.current.moved = true; live.current.onPick(null); }
  };
  const move = (e: React.PointerEvent) => {
    const prev = fingers.current.get(e.pointerId); if (!prev) return;
    const p = at(e); const v = view.current, g = gesture.current;
    if (fingers.current.size === 1) {
      const dx = p.x - prev.x, dy = p.y - prev.y;
      g.travel += Math.abs(dx) + Math.abs(dy);
      if (!g.moved && g.travel < 7) return; // still a tap
      if (!g.moved) { g.moved = true; live.current.onPick(null); }
      fingers.current.set(e.pointerId, p);
      v.lon -= dx / (mLon(v.lat) * v.k); v.lat += dy / (M_LAT * v.k);
    } else if (fingers.current.size === 2) {
      const before = two(); fingers.current.set(e.pointerId, p); const after = two();
      v.lon -= (after.x - before.x) / (mLon(v.lat) * v.k); v.lat += (after.y - before.y) / (M_LAT * v.k);
      if (before.d > 10) zoomAt(after.x, after.y, after.d / before.d);
    }
    frame();
  };
  const up = (e: React.PointerEvent) => {
    const had = fingers.current.size; const p = at(e); const g = gesture.current;
    fingers.current.delete(e.pointerId);
    if (fingers.current.size) return;
    if (g.moved || had > 1) { settle(); return; }
    const now = Date.now();
    if (now - g.lastTap < 320) { g.lastTap = 0; live.current.onPick(null); zoomAt(p.x, p.y, 2); frame(); settle(); return; }
    g.lastTap = now;
    const { map, only, box } = live.current; const v = view.current; if (!map) return;
    const ml = mLon(v.lat); let best: Picked = null, bd = 30 * 30;
    for (const pl of map.places) {
      if (pl[2] < 0 || (only && map.kinds[pl[2]].key !== only)) continue;
      const x = box.w / 2 + (pl[1] - v.lon) * ml * v.k, y = box.h / 2 - (pl[0] - v.lat) * M_LAT * v.k; const q = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (q < bd) { bd = q; best = { name: pl[4], kind: map.kinds[pl[2]].label, street: pl[5], x, y }; }
    }
    live.current.onPick(best);
  };
  const cancel = (e: React.PointerEvent) => { fingers.current.delete(e.pointerId); if (!fingers.current.size) settle(); };

  return (
    <div ref={wrap} className={`map ${full ? "map-full" : ""}`}>
      <canvas ref={ref} style={{ width: box.w, height: box.h }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
        role="img" aria-label="Street map with one dot for each listed business. Drag to move, pinch to zoom." />
      {picked && (
        <div className="map-tip" style={{ left: Math.max(100, Math.min(box.w - 100, picked.x)), top: Math.max(64, picked.y) }}>
          <strong>{picked.name}</strong><span>{picked.kind}{picked.street ? `, ${picked.street}` : ""}</span>
        </div>
      )}
      <div className="map-ctl">
        <button onClick={() => setFull(!full)} aria-label={full ? "Close full screen map" : "Open map full screen"}>
          {full ? <IconClose size={20} /> : <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" /></svg>}
        </button>
        <button onClick={() => zoomBy(1.6)} aria-label="Zoom in">+</button>
        <button onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out">−</button>
        {shop && <button onClick={() => { view.current.k = fit(); onMove(shop.lat, shop.lon); view.current.lat = shop.lat; view.current.lon = shop.lon; bake(); paint(); }} aria-label="Back to my shop">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10" cy="10" r="5.5" /><circle cx="10" cy="10" r="1.6" fill="currentColor" /><path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" /></svg>
        </button>}
      </div>
      {!map && <div className="map-wait" />}
    </div>
  );
}

function GapCard({ k, lang, on, onClick }: { k: AreaKind; lang: Lang; on: boolean; onClick: () => void }) {
  const max = Math.max(k.count, k.expected, 1);
  return (
    <button className={`gap ${on ? "gap-on" : ""}`} onClick={onClick} aria-pressed={on}>
      <span className="gap-name"><i style={{ background: k.color }} />{kindName(k, lang)}</span>
      <span className="gap-bars">
        <span className="gap-row"><span className="gap-label">{t("here", lang)}</span><span className="gap-track"><span className="gap-fill" style={{ width: `${(k.count / max) * 100}%`, background: k.color }} /></span><b>{k.count}</b></span>
        <span className="gap-row"><span className="gap-label">{t("similarAreas", lang)}</span><span className="gap-track"><span className="gap-fill gap-peer" style={{ width: `${(k.expected / max) * 100}%` }} /></span><b>{Math.round(k.expected)}</b></span>
      </span>
      {k.count === 0 && k.nearest_m != null && <span className="gap-note">{t("nearestIs", lang)} {dist(k.nearest_m)} {t("away", lang)}</span>}
    </button>
  );
}

export function Area() {
  const { state, lang, focus, say, busy, health } = useApp();
  const shortlist = (focus?.shortlist as Shortlist | undefined) ?? null;
  const shop = state ? { lat: state.overview.shop.lat, lon: state.overview.shop.lon } : null;
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [radius, setRadius] = useState(800);
  const [report, setReport] = useState<AreaReport | null>(null);
  const [map, setMap] = useState<AreaMap | null>(null);
  const [only, setOnly] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<AreaHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [allKinds, setAllKinds] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(handoff.plan);
  const [kit, setKitState] = useState<string[]>(handoff.kit);
  const setKit = (k: string[]) => { handoff.kit = k; setKitState(k); };
  const onPlan = (f: any) => !!(plan && f?.lat && Math.abs(f.lat - plan.lat) < 0.002 && Math.abs(f.lon - plan.lon) < 0.002);
  const L = (en: string, ta: string, hi: string) => (lang === "ta-IN" ? ta : lang === "hi-IN" ? hi : en);

  // Start at the shop; follow the assistant when it looks a place up.
  useEffect(() => { if (!center && shop && !(focus?.lat && focus?.lon)) setCenter(shop); }, [shop?.lat, shop?.lon]); // eslint-disable-line
  useEffect(() => {
    if (focus?.lat && focus?.lon) { setCenter({ lat: focus.lat, lon: focus.lon }); if (focus.radius_m) setRadius(RADII.reduce((a, b) => (Math.abs(b - focus.radius_m) < Math.abs(a - focus.radius_m) ? b : a))); setOnly(onPlan(focus) ? plan!.kind : null); }
  }, [focus?.lat, focus?.lon, focus?.radius_m]);

  useEffect(() => {
    if (!center) return;
    let stale = false; setPicked(null); setError(null);
    Promise.all([api.areaReport(center.lat, center.lon, radius), api.areaMap(center.lat, center.lon, Math.min(2500, Math.max(900, radius * 2)))])
      .then(([r, m]) => { if (!stale) { setReport(r); setMap(m); } })
      .catch((e) => { if (!stale) setError(e.message); });
    return () => { stale = true; };
  }, [center?.lat, center?.lon, radius]); // eslint-disable-line

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const id = setTimeout(() => api.areaSearch(q.trim(), shop ?? undefined).then(setHits).catch(() => setHits([])), 180);
    return () => clearTimeout(id);
  }, [q]); // eslint-disable-line

  const choose = (h: AreaHit) => { setCenter({ lat: h.lat, lon: h.lon }); setQ(""); setHits([]); setOnly(null); if (h.type === "street") setRadius(400); };
  const onMove = useCallback((lat: number, lon: number) => setCenter({ lat, lon }), []);
  const toggle = (key: string) => setOnly((o) => (o === key ? null : key));

  const kinds = report?.kinds.filter((k) => k.key !== "other" && (k.count > 0 || k.expected >= 1)).sort((a, b) => b.count - a.count) ?? [];
  const shown = allKinds ? kinds : kinds.slice(0, 8);
  const kmax = Math.max(1, ...kinds.map((k) => Math.max(k.count, k.expected)));
  const streetMax = Math.max(1, ...(report?.streets.map((s) => s.count) ?? [1]));
  const atShop = !!(shop && center && Math.abs(shop.lat - center.lat) < 0.0005 && Math.abs(shop.lon - center.lon) < 0.0005);

  return (
    <div className="screen area">
      <h1 className="title">{t("area", lang)}</h1>

      {plan && (() => {
        const c = plan.fit.chosen;
        const word = !c ? null : c.level === "thin" ? L("Room for one more", "இன்னொன்றுக்கு இடம் உண்டு", "एक और की जगह है") : c.level === "crowded" ? L("Already crowded", "ஏற்கனவே நெரிசல்", "पहले से भीड़") : L("About average", "சராசரி அளவு", "लगभग औसत");
        return (<>
          <section className={`verdict ${c?.level ?? ""}`}>
            <span className="verdict-word">{L("Your plan", "உங்கள் திட்டம்", "आपकी योजना")}: {plan.place}, {lakh(plan.budget)}</span>
            <span className="verdict-line">{c ? `${L(c.label, c.ta, c.hi)}: ${word}` : L("Looking for the right shop to open", "எந்தக் கடை என்று தேடுகிறோம்", "सही दुकान की तलाश")}</span>
            {c && <p>{c.here} here, about {Math.round(c.expected)} in similar areas. The map below shows only these{c.here ? "" : ", and there are none"}. Tap a kind underneath to compare.</p>}
            <div className="btn-row">
              {health?.claude && <button className="btn btn-light" disabled={busy} onClick={() => say(askFor(plan))}>{L("Ask Thunai", "துணையிடம் கேள்", "थुनै से पूछें")}</button>}
              <button className="btn btn-light" onClick={() => { handoff.setup = true; window.dispatchEvent(new Event("thunai:welcome")); }}>{L("Start this shop", "இந்தக் கடையைத் தொடங்கு", "यह दुकान शुरू करें")}</button>
            </div>
            <button className="verdict-x" onClick={() => { handoff.plan = null; setPlan(null); setOnly(null); }}>{L("Clear the plan", "திட்டத்தை நீக்கு", "योजना हटाएँ")}</button>
          </section>
        </>);
      })()}

      <div className="search">
        <IconSearch />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchArea", lang)} enterKeyHint="search" aria-label={t("searchArea", lang)} />
        {q && <button className="search-x" onClick={() => { setQ(""); setHits([]); }} aria-label="Clear"><IconClose size={16} /></button>}
        {hits.length > 0 && (
          <ul className="hits">
            {hits.slice(0, 7).map((h) => (
              <li key={h.label + h.lat}><button onClick={() => choose(h)}><span>{lang === "ta-IN" && h.ta ? h.ta : h.label}</span><span className="muted">{h.type === "street" ? "Street" : "Locality"}</span></button></li>
            ))}
          </ul>
        )}
      </div>

      <div className="area-bar">
        <div className="seg" role="group" aria-label="Distance">
          {RADII.map((r) => <button key={r} className={`seg-btn ${radius === r ? "on" : ""}`} onClick={() => setRadius(r)}>{dist(r)}</button>)}
        </div>
        {!atShop && shop && <button className="link" onClick={() => { setCenter(shop); setOnly(null); }}>{t("myShop", lang)}</button>}
      </div>

      {error && <p className="empty card">{error}</p>}

      <section className="card map-card">
        {report && (
          <header className="map-head">
            <div>
              <h2 className="map-place">{lang === "ta-IN" && report.locality_ta ? report.locality_ta : report.locality}</h2>
              <p className="muted">{t("within", lang)} {dist(report.radius_m)}</p>
            </div>
            <p className="map-count"><b>{report.total_listed.toLocaleString("en-IN")}</b><span>{t("listed", lang)}</span></p>
          </header>
        )}
        {center && <StreetMap map={map} center={center} radius={radius} only={only} shop={shop} onMove={onMove} onPick={setPicked} picked={picked} />}
        <div className="legend">
          {kinds.slice(0, 12).map((k) => (
            <button key={k.key} className={`legend-chip ${only === k.key ? "on" : ""} ${only && only !== k.key ? "dim" : ""}`} onClick={() => toggle(k.key)} aria-pressed={only === k.key}>
              <i style={{ background: k.color }} />{kindName(k, lang)} <b>{k.count}</b>
            </button>
          ))}
        </div>
      </section>

      {report && (
        <section className="card ask">
          <h2 className="card-title">{{ "en-IN": "Thinking of opening a shop here?", "ta-IN": "இங்கே கடை தொடங்க நினைக்கிறீர்களா?", "hi-IN": "यहाँ दुकान खोलने की सोच रहे हैं?" }[lang]}</h2>
          <p className="muted">{{ "en-IN": "Pick what you can invest. Thunai weighs what is thin here, what brings people, and the rough cost.", "ta-IN": "முதலீட்டைத் தேர்ந்தெடுங்கள். இங்கே எது குறைவு, மக்களை எது ஈர்க்கிறது, தோராயச் செலவு ஆகியவற்றை துணை பார்க்கும்.", "hi-IN": "निवेश चुनिए। थुनई देखेगा कि यहाँ क्या कम है, लोग क्यों आते हैं और मोटा ख़र्च कितना है।" }[lang]}</p>
          <div className="budgets">
            {[1, 3, 5, 10].map((l) => (
              <button key={l} className="budget" disabled={busy} onClick={() => say({
                "en-IN": `I have ${l} lakh rupees to invest. What shop could I open near ${report.locality}? Give me a shortlist.`,
                "ta-IN": `என்னிடம் ${l} லட்சம் ரூபாய் முதலீடு உள்ளது. ${report.locality_ta || report.locality} அருகே என்ன கடை தொடங்கலாம்? ஒரு பட்டியல் கொடுங்கள்.`,
                "hi-IN": `मेरे पास ${l} लाख रुपये हैं। ${report.locality} के पास कौन सी दुकान खोल सकता हूँ? एक सूची दीजिए।` }[lang])}>₹{l} {{ "en-IN": "lakh", "ta-IN": "லட்சம்", "hi-IN": "लाख" }[lang]}</button>
            ))}
          </div>
          {health && !health.claude && <p className="fine">The shortlist is reasoned by Claude and needs its key.</p>}
          {shortlist && (
            <ol className="shortlist">
              {shortlist.options.map((o, i) => (
                <li key={o.key}>
                  <button className="short" onClick={() => toggle(o.key)}>
                    <span className="short-rank">{i + 1}</span>
                    <span className="short-body">
                      <span className="short-name"><i style={{ background: o.color }} />{kindName(o, lang)}</span>
                      <span className="short-why">{o.why}</span>
                      <span className="short-watch">{o.watch_out}</span>
                      <span className="short-cost">₹{o.setup_lakh[0]} to {o.setup_lakh[1]} lakh to set up, rough</span>
                    </span>
                  </button>
                </li>
              ))}
              <p className="fine">Reasoned by Thunai from the listings on this screen. Setup costs are illustrative ranges. This is a starting point, not a promise of income.</p>
            </ol>
          )}
        </section>
      )}

      {plan && <StartKit chosen={plan.fit.chosen} budget={plan.budget} kit={kit} setKit={setKit} L={L} />}

      {report && (
        <>
          <section>
            <h2 className="section">{t("thinHere", lang)}</h2>
            {report.gaps.length === 0 && <p className="empty card">{t("noGaps", lang)}</p>}
            <div className="gaps">{report.gaps.map((k) => <GapCard key={k.key} k={k} lang={lang} on={only === k.key} onClick={() => toggle(k.key)} />)}</div>
            {report.peers.length > 0 && <p className="fine">{t("similarAreas", lang)}: {report.peers.join(", ")}.</p>}
          </section>

          {report.crowded.length > 0 && (
            <section>
              <h2 className="section">{t("crowdedHere", lang)}</h2>
              <div className="gaps">{report.crowded.map((k) => <GapCard key={k.key} k={k} lang={lang} on={only === k.key} onClick={() => toggle(k.key)} />)}</div>
            </section>
          )}

          <section className="card">
            <h2 className="card-title">{t("byStreet", lang)}</h2>
            <ol className="streets">
              {report.streets.slice(0, 8).map((s) => (
                <li key={s.name} className="street">
                  <div className="street-top"><span className="street-name">{s.name}</span><b>{s.count}</b></div>
                  <div className="street-bar" style={{ width: `${Math.max(12, (s.count / streetMax) * 100)}%` }}>
                    {s.top.map((x) => <span key={x.key} style={{ flex: x.n, background: x.color }} title={`${x.label}: ${x.n}`} />)}
                    {s.count - s.top.reduce((a, x) => a + x.n, 0) > 0 && <span style={{ flex: s.count - s.top.reduce((a, x) => a + x.n, 0), background: "#DCE3EC" }} />}
                  </div>
                  <p className="street-mix">{s.top.filter((x) => x.key !== "other").slice(0, 3).map((x) => `${x.label} ${x.n}`).join(", ")}</p>
                </li>
              ))}
            </ol>
            {report.off_street > 0 && <p className="fine">{report.off_street} more are not close to a named street.</p>}
          </section>

          <section className="card">
            <h2 className="card-title">{t("whatsHere", lang)}</h2>
            <ul className="kinds">
              {shown.map((k) => (
                <li key={k.key}>
                  <button className={`kind ${only === k.key ? "on" : ""}`} onClick={() => toggle(k.key)}>
                    <span className="kind-name"><i style={{ background: k.color }} />{kindName(k, lang)}</span>
                    <span className="kind-track">
                      <span className="kind-fill" style={{ width: `${(k.count / kmax) * 100}%`, background: k.color }} />
                      <span className="kind-mark" style={{ left: `${(k.expected / kmax) * 100}%` }} title={`${t("similarAreas", lang)}: ${Math.round(k.expected)}`} />
                    </span>
                    <b>{k.count}</b>
                  </button>
                </li>
              ))}
            </ul>
            <p className="fine"><span className="kind-mark inline" /> {t("similarAreas", lang)}</p>
            {kinds.length > 8 && <button className="link" onClick={() => setAllKinds(!allKinds)}>{allKinds ? "Show fewer" : `Show all ${kinds.length}`}</button>}
          </section>

          {report.anchors.length > 0 && (
            <section className="card">
              <h2 className="card-title">{t("bringsPeople", lang)}</h2>
              <ul className="anchors">
                {report.anchors.map((a) => (
                  <li key={a.key}><b>{a.n}</b><div><span className="anchor-name">{(ANCHOR_LABEL[a.key] ?? [a.key, a.key, a.key])[li(lang)]}</span>
                    <span className="muted">{a.names.filter((n) => n && !n.startsWith("#")).slice(0, 3).map((n) => n.trim()).join(", ")}</span></div></li>
                ))}
              </ul>
            </section>
          )}

          <p className="caveat">
            {report.caveat} {report.confidence !== "good" && "Listings are sparse here, so the comparison is weak. "}
            In a Paytm product, merchant payment data would replace these listings. Sources: {report.sources.join("; ")}.
          </p>
        </>
      )}
    </div>
  );
}
