// Login gate for the public address. Requests that arrive by the public host
// name must carry the site's username and password (HTTP Basic). Wrong attempts
// are counted per visitor address and locked out, so the password cannot be
// guessed by trying many. Local and tailnet addresses are not gated.
import fs from "node:fs";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";

const FILE = path.join(import.meta.dir, "..", ".site-auth.json");
const creds: { user: string; hash: string } | null = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : null;
const OPEN_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9-]+\.[a-z0-9-]+\.ts\.net)(:\d+)?$/i;

const MAX_FAILS = 5;                 // wrong passwords allowed per address
const WINDOW = 10 * 60_000;          // within this long
const LOCK = 15 * 60_000;            // then locked out for this long
const GLOBAL_MAX = 30;               // wrong passwords from everyone, per minute
const fails = new Map<string, { n: number; first: number; until: number }>();
let recent: number[] = [];
let known: Buffer | null = null;     // the Authorization header that last passed, so bcrypt runs once

const same = (a: string, b: Buffer) => { const x = Buffer.from(a); return x.length === b.length && timingSafeEqual(x, b); };
const ask = () => new Response("Login needed.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Saajhedar demo", charset="UTF-8"', "Cache-Control": "no-store" } });
const slow = (secs: number) => new Response("Too many wrong attempts. Try again later.", { status: 429, headers: { "Retry-After": String(Math.ceil(secs)), "Cache-Control": "no-store" } });

export async function gate(req: Request, peer: string | undefined): Promise<Response | null> {
  if (OPEN_HOST.test(req.headers.get("host") || "")) return null;
  if (!creds) return new Response("This address is not set up.", { status: 503 });
  // Behind Caddy the visitor's address is in X-Forwarded-For; trust it only from this machine.
  const local = !peer || peer === "127.0.0.1" || peer === "::1" || peer === "::ffff:127.0.0.1";
  const ip = (local && req.headers.get("x-forwarded-for")?.split(",")[0].trim()) || peer || "unknown";
  const now = Date.now();
  const f = fails.get(ip);
  if (f && f.until > now) return slow((f.until - now) / 1000);
  const header = req.headers.get("authorization") || "";
  if (!header) return ask();
  if (known && same(header, known)) return null;
  recent = recent.filter((t) => now - t < 60_000);
  if (recent.length >= GLOBAL_MAX) return slow(60);
  let ok = false;
  try {
    const [user, ...rest] = Buffer.from(header.replace(/^Basic\s+/i, ""), "base64").toString("utf8").split(":");
    ok = /^Basic\s/i.test(header) && same(user, Buffer.from(creds.user)) && await Bun.password.verify(rest.join(":"), creds.hash);
  } catch { ok = false; }
  if (ok) { known = Buffer.from(header); fails.delete(ip); return null; }
  recent.push(now);
  const g = f && now - f.first < WINDOW ? f : { n: 0, first: now, until: 0 };
  g.n += 1;
  if (g.n >= MAX_FAILS) { g.until = now + LOCK; console.warn(`[gate] ${ip} locked out after ${g.n} wrong logins`); }
  fails.set(ip, g);
  if (fails.size > 5000) for (const [k, v] of fails) if (v.until < now && now - v.first > WINDOW) fails.delete(k);
  return g.until ? slow(LOCK / 1000) : ask();
}
