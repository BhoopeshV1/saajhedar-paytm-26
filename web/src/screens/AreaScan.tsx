// The wait between "Show me the area" and the result: a line-drawn globe turns
// to the chosen place, dives to street level, and drops a pin for each shop of
// the chosen kind that is already there. Coastlines are Natural Earth (public
// domain); streets and shops come from the same area data as the result.
import { useEffect, useRef, useState } from "react";
import { api, type AreaMap } from "../api";

type Props = { lat: number; lon: number; label: string; kind: string | null; ready: boolean; onDone: () => void; L: (en: string, ta: string, hi: string) => string };
type Pin = { x: number; y: number; d: number; color: string };

const RADIUS_M = 800, D = Math.PI / 180;
const T_TURN = 2.4, T_ZOOM = 1.7, T_PINS = T_TURN + T_ZOOM + 0.25, MAX_PINS = 70;
const c01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => { const p = c01((x - a) / (b - a)); return p * p * (3 - 2 * p); };
const inOut = (p: number) => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const out3 = (p: number) => 1 - Math.pow(1 - p, 3);
const backOut = (p: number) => 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);

export function AreaScan({ lat, lon, label, kind, ready, onDone, L }: Props) {
  const cv = useRef<HTMLCanvasElement>(null);
  const readyRef = useRef(ready); readyRef.current = ready;
  const doneRef = useRef(onDone); doneRef.current = onDone;
  const skip = useRef(false);
  const [phase, setPhase] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let alive = true, raf = 0, left = false;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const iv = setInterval(() => { if (readyRef.current) { clearInterval(iv); doneRef.current(); } }, 120);
      return () => clearInterval(iv);
    }
    let land: number[][] = [], map: AreaMap | null = null, mapSettled = false, pins: Pin[] = [];
    const mx = (lo: number) => (lo - lon) * Math.cos(lat * D) * 111320, my = (la: number) => -(la - lat) * 110540;
    fetch("/land.json").then((r) => r.json()).then((d) => { land = d; }).catch(() => {});
    api.areaMap(lat, lon, RADIUS_M).then((m) => {
      map = m;
      pins = m.places.filter((p) => p[2] >= 0 && (kind ? m.kinds[p[2]]?.key === kind : true))
        .map((p) => { const x = mx(p[1]), y = my(p[0]); return { x, y, d: Math.hypot(x, y), color: m.kinds[p[2]]?.color ?? "#00BAF2" }; })
        .filter((p) => p.d <= RADIUS_M).sort((a, b) => a.d - b.d);
      if (pins.length > MAX_PINS) { const step = pins.length / MAX_PINS; pins = Array.from({ length: MAX_PINS }, (_, i) => pins[Math.floor(i * step)]); }
    }).catch(() => {}).finally(() => { mapSettled = true; });

    const el = cv.current!, ctx = el.getContext("2d")!;
    const t0 = performance.now();
    let pinT0 = 0, shown = -1;
    const leave = () => { if (left) return; left = true; setLeaving(true); setTimeout(() => alive && doneRef.current(), 640); };

    const draw = (now: number) => {
      if (!alive) return;
      raf = requestAnimationFrame(draw);
      const w = el.clientWidth, h = el.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const t = (now - t0) / 1000, cx = w / 2, cy = h * 0.46, unit = Math.min(w, h);
      const z = inOut(c01((t - T_TURN) / T_ZOOM));

      // ---- globe ----
      const ga = 1 - smooth(0.3, 0.78, z);
      if (ga > 0.01) {
        const turn = inOut(c01(t / T_TURN));
        const l0 = (lon - 230 * (1 - turn)) * D, p0 = (lat + (8 - lat) * (1 - turn) + 14 * (1 - z) * turn) * D;
        const R = unit * 0.36 * Math.exp(z * 5.6), sp0 = Math.sin(p0), cp0 = Math.cos(p0);
        const proj = (lo: number, la: number): [number, number] | null => {
          const l = lo * D - l0, p = la * D, cp = Math.cos(p);
          if (sp0 * Math.sin(p) + cp0 * cp * Math.cos(l) < 0) return null;
          return [cx + R * cp * Math.sin(l), cy - R * (cp0 * Math.sin(p) - sp0 * cp * Math.cos(l))];
        };
        const path = (pts: number[]) => { let pen = false; for (let i = 0; i < pts.length; i += 2) { const q = proj(pts[i], pts[i + 1]); if (!q) { pen = false; continue; } if (pen) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); pen = true; } };
        ctx.globalAlpha = ga;
        const glow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.25);
        glow.addColorStop(0, "rgba(0,186,242,.13)"); glow.addColorStop(0.8, "rgba(0,186,242,.05)"); glow.addColorStop(1, "rgba(0,186,242,0)");
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.25, 0, 7); ctx.fill();
        ctx.beginPath();
        for (let lo = -180; lo < 180; lo += 20) { const pts: number[] = []; for (let la = -90; la <= 90; la += 5) pts.push(lo, la); path(pts); }
        for (let la = -60; la <= 60; la += 20) { const pts: number[] = []; for (let lo = -180; lo <= 180; lo += 5) pts.push(lo, la); path(pts); }
        ctx.strokeStyle = "rgba(0,186,242,.22)"; ctx.lineWidth = 0.7; ctx.stroke();
        ctx.beginPath(); for (const line of land) path(line);
        ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(0,186,242,.18)"; ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = "rgba(150,232,255,.95)"; ctx.lineWidth = 1.1; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.strokeStyle = "rgba(120,220,255,.55)"; ctx.lineWidth = 1.2; ctx.stroke();
        const here = proj(lon, lat);
        if (here && t > 1.3) {
          const a = c01((t - 1.3) / 0.4), pulse = (t * 1.3) % 1;
          ctx.globalAlpha = ga * a; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(here[0], here[1], 3, 0, 7); ctx.fill();
          ctx.globalAlpha = ga * a * (1 - pulse); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(here[0], here[1], 4 + pulse * 20, 0, 7); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // ---- street level ----
      const sa = smooth(0.42, 0.95, z);
      if (sa > 0.01) {
        const S = (unit * 0.4 / RADIUS_M) * (0.12 + 0.88 * out3(z)), ring = RADIUS_M * S;
        const X = (m: number) => cx + m * S, Y = (m: number) => cy + m * S;
        if (map) {
          for (const pass of [4, 3, 2] as const) {
            ctx.beginPath();
            for (const [cls, , pts] of map.roads) {
              if (pass === 4 ? cls < 4 : pass === 3 ? cls !== 3 : cls > 2) continue;
              for (let i = 0; i < pts.length; i += 2) { const x = X(mx(pts[i])), y = Y(my(pts[i + 1])); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
            }
            ctx.globalAlpha = sa; ctx.lineJoin = "round"; ctx.lineCap = "round";
            if (pass === 2) { ctx.strokeStyle = "rgba(0,186,242,.2)"; ctx.lineWidth = 6; ctx.stroke(); }
            ctx.strokeStyle = pass === 4 ? "rgba(0,186,242,.34)" : pass === 3 ? "rgba(90,210,255,.7)" : "rgba(190,240,255,.95)";
            ctx.lineWidth = pass === 4 ? 0.8 : pass === 3 ? 1.3 : 1.9; ctx.stroke();
          }
        }
        // the 800 m circle draws itself once the dive ends
        const sweep = out3(c01((t - T_TURN - T_ZOOM * 0.8) / 0.9));
        ctx.globalAlpha = sa; ctx.setLineDash([5, 6]); ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(cx, cy, ring, -Math.PI / 2, -Math.PI / 2 + sweep * Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);

        if (!pinT0 && t >= T_PINS && mapSettled) pinT0 = t;
        const gap = pins.length ? Math.min(0.07, 1.7 / pins.length) : 0, scanAt = pinT0 ? pinT0 + pins.length * gap + 0.75 : Infinity;

        // the "reading" sweep, clipped to the circle
        if (t > scanAt && "createConicGradient" in ctx) {
          const ang = (t - scanAt) * 2.3 - Math.PI / 2, a = c01((t - scanAt) / 0.4);
          const g = ctx.createConicGradient(ang, cx, cy);
          g.addColorStop(0, "rgba(0,186,242,0)"); g.addColorStop(0.8, "rgba(0,186,242,0)"); g.addColorStop(1, "rgba(120,225,255,.34)");
          ctx.globalAlpha = sa * a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, ring, 0, 7); ctx.fill();
          ctx.strokeStyle = "rgba(190,240,255,.8)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * ring, cy + Math.sin(ang) * ring); ctx.stroke();
        }

        // pins: drop, land with a small overshoot, then a ripple on the ground
        if (pinT0) pins.forEach((p, i) => {
          const q = (t - pinT0 - i * gap) / 0.55; if (q <= 0) return;
          const x = X(p.x), y = Y(p.y), k = c01(q), s = backOut(k), lift = -30 * (1 - out3(c01(q * 1.25)));
          const rip = c01((q - 0.75) / 1.1);
          if (rip > 0 && rip < 1) { ctx.globalAlpha = sa * (1 - rip) * 0.7; ctx.strokeStyle = p.color; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y, 3 + rip * 15, (3 + rip * 15) * 0.55, 0, 0, 7); ctx.stroke(); }
          ctx.globalAlpha = sa * c01(q * 3);
          ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + lift); ctx.lineTo(x, y + lift - 9 * s); ctx.stroke();
          ctx.shadowColor = p.color; ctx.shadowBlur = 10; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y + lift - 12 * s, 4.2 * s, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y + lift - 12 * s, 1.6 * s, 0, 7); ctx.fill();
        });

        // the spot being considered
        const beat = (t * 0.9) % 1;
        ctx.globalAlpha = sa; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 7); ctx.fill();
        ctx.globalAlpha = sa * (1 - beat); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 5 + beat * 22, 0, 7); ctx.stroke();
        ctx.globalAlpha = 1;

        const ph = t > scanAt ? 3 : pinT0 ? 2 : 1;
        if (ph !== shown) setPhase((shown = ph));
        if (readyRef.current && pinT0 && (t > scanAt + 1.5 || skip.current)) leave();
      } else if (shown !== 0) setPhase((shown = 0));
      if (skip.current && readyRef.current && t > 0.3) leave();
    };
    raf = requestAnimationFrame(draw);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, []);

  const status = [
    L("Finding the place", "இடத்தைக் கண்டறிகிறது", "जगह ढूँढ रहे हैं"),
    L("Tracing the streets", "தெருக்களை வரைகிறது", "गलियाँ बना रहे हैं"),
    L("Marking the shops already there", "அங்குள்ள கடைகளைக் குறிக்கிறது", "वहाँ की दुकानें दिखा रहे हैं"),
    L("Working out what the area needs", "பகுதிக்கு என்ன தேவை என்று பார்க்கிறது", "देख रहे हैं इलाके को क्या चाहिए"),
  ][phase];
  return (
    <div className={`scan ${leaving ? "out" : ""}`} role="status" aria-live="polite">
      <canvas ref={cv} aria-hidden="true" />
      <p className="scan-place">{label}</p>
      <p className="scan-status" key={phase}>{status}</p>
      <button className="scan-skip" onClick={() => { skip.current = true; }}>{L("Skip", "தவிர்", "छोड़ें")}</button>
    </div>
  );
}
