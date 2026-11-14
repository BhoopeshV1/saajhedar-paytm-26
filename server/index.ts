// HTTP server: JSON API, server-sent events, the voice turn endpoint, and the
// built web app. Run from the app folder so Bun picks up .env.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "./db";
import { seed } from "./seed";
import * as ops from "./ops";
import * as area from "./area";
import { subscribe, type BusEvent } from "./bus";
import { converse, claudeReady, resetSessions, MODEL, type Persona, type AgentEvent } from "./agent";
import { transcribe, speak, sentences, langOfText, sarvamReady, SpeechError, STT_MODEL, TTS_MODEL, TTS_SPEAKER, type Lang, LANGS } from "./sarvam";
import { all } from "./db";
import { startWeather, refreshWeather } from "./weather";
import { readBillPhoto, parseBillFile, ImportError, SOURCES } from "./billing";
import { LlmError } from "./llm";
import * as sync from "./sync";

migrate();
seed(false);
ops.autopilot();
startWeather();
sync.startSync();

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, "../web/dist");
const DEMO = path.resolve(here, "../demo");
const PORT = Number(process.env.PORT || 8787);

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const fail = (err: unknown) => {
  if (err instanceof ops.OpError || err instanceof area.AreaError || err instanceof ImportError || err instanceof sync.SyncError || err instanceof LlmError) return json({ error: err.message }, 400);
  if (err instanceof SpeechError) return json({ error: err.message }, 502);
  console.error("[api]", err);
  return json({ error: (err as Error).message || "Something went wrong" }, 500);
};

// Words the speech recogniser should expect: item, customer and supplier names.
function keyterms(): string[] {
  const out = new Set<string>(["Thunai", "udhaar", "Paytm", "Soundbox", "Karthigai Deepam"]);
  for (const r of all("SELECT name_en, name_ta, name_hi FROM items")) { out.add(r.name_en); out.add(r.name_ta); out.add(r.name_hi); }
  for (const r of all("SELECT name FROM customers")) out.add(r.name);
  for (const r of all("SELECT name FROM suppliers")) out.add(r.name);
  return [...out];
}

// One voice or text turn, streamed back as newline-delimited JSON so the phone
// can show what was heard, switch screens as tools run, and start playing the
// first sentence before the rest is synthesised.
function turnStream(input: { audio?: Blob; filename?: string; text?: string; event?: string; sessionId: string; persona: Persona; customerId?: number; hint?: Lang | "unknown"; wantAudio: boolean }) {
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    async start(ctrl) {
      const send = (o: unknown) => { try { ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch {} };
      const t0 = performance.now();
      try {
        let text = input.text?.trim() ?? "";
        let lang: Lang = input.hint && input.hint !== "unknown" ? input.hint : "en-IN";
        if (input.audio) {
          const heard = await transcribe(input.audio, input.filename || "speech.webm", { hint: input.hint ?? "unknown", keyterms: keyterms() });
          text = heard.text; lang = heard.lang;
          send({ type: "heard", text, lang, ms: heard.ms });
          if (!text) { send({ type: "empty" }); send({ type: "done" }); ctrl.close(); return; }
        } else if (text) {
          lang = langOfText(text, lang);
          send({ type: "heard", text, lang, ms: 0 });
        }
        if (!claudeReady()) throw new ops.OpError("ANTHROPIC_API_KEY is not set, so the assistant cannot answer yet.");
        const prompt = input.event ? `(app event) ${input.event}` : text;
        const tA = performance.now();
        const reply = await converse({ sessionId: input.sessionId, persona: input.persona, customerId: input.customerId, text: prompt,
          onEvent: (e: AgentEvent) => send(e) });
        const replyLang = langOfText(reply, lang);
        send({ type: "say", text: reply, lang: replyLang, ms: Math.round(performance.now() - tA) });
        if (input.wantAudio && sarvamReady()) {
          const parts = sentences(reply);
          const jobs = parts.map((p) => speak(p, replyLang));
          for (let i = 0; i < jobs.length; i++) {
            try { const a = await jobs[i]; send({ type: "audio", seq: i, last: i === jobs.length - 1, b64: a.b64, mime: a.mime, ms: a.ms }); }
            catch (err) { send({ type: "audio_error", message: (err as Error).message }); break; }
          }
        }
        send({ type: "done", ms: Math.round(performance.now() - t0) });
      } catch (err) {
        const known = err instanceof ops.OpError || err instanceof SpeechError || err instanceof area.AreaError;
        if (!known) console.error("[turn]", err);
        send({ type: "error", message: known ? (err as Error).message : "The assistant hit a problem. Please try again." , detail: known ? undefined : String((err as Error).message).slice(0, 300) });
      }
      try { ctrl.close(); } catch {}
    },
  }), { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}

function sse(req: Request) {
  const enc = new TextEncoder();
  let off = () => {}; let beat: ReturnType<typeof setInterval>;
  return new Response(new ReadableStream({
    start(ctrl) {
      const push = (e: BusEvent | { type: "hello" }) => { try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch {} };
      push({ type: "hello" });
      off = subscribe(push);
      beat = setInterval(() => { try { ctrl.enqueue(enc.encode(": keep-alive\n\n")); } catch {} }, 20000);
      req.signal.addEventListener("abort", () => { off(); clearInterval(beat); try { ctrl.close(); } catch {} });
    },
    cancel() { off(); clearInterval(beat); },
  }), { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".woff": "font/woff", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
function serveStatic(pathname: string) {
  let file = path.join(DIST, decodeURIComponent(pathname));
  if (!file.startsWith(DIST)) return new Response("Not found", { status: 404 });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  if (!fs.existsSync(file)) return new Response("The web app is not built yet. Run: bun run build", { status: 503 });
  const ext = path.extname(file);
  return new Response(Bun.file(file), { headers: { "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache" } });
}

const num = (v: string | null, d?: number) => { const n = Number(v); if (v == null || v === "" || !isFinite(n)) { if (d == null) throw new ops.OpError("Missing number"); return d; } return n; };

Bun.serve({
  port: PORT, hostname: "0.0.0.0", idleTimeout: 120,
  async fetch(req) {
    const url = new URL(req.url); const p = url.pathname; const m = req.method;
    if (!p.startsWith("/api/")) return serveStatic(p);
    try {
      if (p === "/api/health") return json({ ok: true, sarvam: sarvamReady(), claude: claudeReady(), model: MODEL, stt: STT_MODEL, tts: TTS_MODEL, speaker: TTS_SPEAKER, area: area.areaMeta() });
      if (p === "/api/state") return json(ops.snapshot());
      if (p === "/api/events") return sse(req);

      if (p === "/api/voice" && m === "POST") {
        const form = await req.formData();
        const audio = form.get("audio");
        if (!(audio instanceof Blob) || audio.size < 800) return json({ error: "No speech was recorded." }, 400);
        const hint = String(form.get("lang") || "unknown");
        return turnStream({ audio, filename: (audio as File).name || "speech.webm", sessionId: String(form.get("session") || "default"),
          persona: form.get("persona") === "customer" ? "customer" : "owner", customerId: form.get("customer_id") ? Number(form.get("customer_id")) : undefined,
          hint: (LANGS as string[]).includes(hint) ? (hint as Lang) : "unknown", wantAudio: form.get("audio_out") !== "0" });
      }
      if (p === "/api/text" && m === "POST") {
        const b = await req.json() as any;
        if (!b.text && !b.event) return json({ error: "Nothing to say." }, 400);
        return turnStream({ text: b.text, event: b.event, sessionId: String(b.session || "default"), persona: b.persona === "customer" ? "customer" : "owner",
          customerId: b.customer_id ? Number(b.customer_id) : undefined, hint: (LANGS as string[]).includes(b.lang) ? b.lang : "unknown", wantAudio: b.audio_out !== false });
      }
      if (p === "/api/tts" && m === "POST") {
        const b = await req.json() as any;
        const lang = (LANGS as string[]).includes(b.lang) ? (b.lang as Lang) : langOfText(String(b.text || ""));
        return json(await speak(String(b.text || "").slice(0, 600), lang));
      }

      let mm: RegExpMatchArray | null;
      if ((mm = p.match(/^\/api\/orders\/(\d+)\/status$/)) && m === "POST") return json(ops.setOrderStatus(Number(mm[1]), (await req.json() as any).status));
      if (p === "/api/orders" && m === "POST") return json(ops.createOrder(await req.json() as any));
      if ((mm = p.match(/^\/api\/customers\/(\d+)\/usual$/))) return json(ops.usualFor(Number(mm[1])));
      if (p === "/api/restock" && m === "POST") return json(ops.placeRestock(await req.json() as any));
      if ((mm = p.match(/^\/api\/standing\/(\d+)$/)) && m === "POST") { const b = await req.json() as any; return json(ops.adjustStanding(Number(mm[1]), b.action, b.qty)); }
      if ((mm = p.match(/^\/api\/bills\/(\d+)\/pay$/)) && m === "POST") return json(ops.payBill(Number(mm[1])));
      if ((mm = p.match(/^\/api\/bills\/(\d+)$/))) return json(ops.checkBill(Number(mm[1])));
      if (p === "/api/loan" && m === "POST") return json(ops.requestLoan());
      if (p === "/api/dues/remind" && m === "POST") return json(await ops.sendReminders(await req.json() as any));
      if (p === "/api/dues/pay" && m === "POST") { const b = await req.json() as any; return json(ops.recordDuePayment(b.customer, Number(b.amount), b.by || "customer")); }
      if ((mm = p.match(/^\/api\/pending\/(\d+)$/)) && m === "POST") { const b = await req.json() as any; return json(ops.resolvePending(Number(mm[1]), b.pin ?? null, b.approve !== false)); }
      if ((mm = p.match(/^\/api\/rules\/(\d+)\/remove$/)) && m === "POST") return json(ops.proposeRuleRemoval(Number(mm[1])));
      if (p === "/api/reset" && m === "POST") { seed(true); resetSessions(); sync.demoReset(); ops.autopilot(); return json({ ok: true }); }

      if (p === "/api/onboard" && m === "POST") { const r = ops.onboard(await req.json() as any); refreshWeather(); return json(r); }
      if (p === "/api/area/kinds") return json(area.openableKinds());
      if (p === "/api/area/fit") return json(area.fit(num(url.searchParams.get("lat")), num(url.searchParams.get("lon")), num(url.searchParams.get("r"), 800), url.searchParams.get("kind") || null, num(url.searchParams.get("budget"), 0) || null));

      // The bill book, and keeping another billing app in step with it.
      if (p === "/api/bills/counter" && m === "POST") return json(ops.counterSale(await req.json() as any));
      if ((mm = p.match(/^\/api\/bills\/counter\/(\d+)\/cancel$/)) && m === "POST") return json(ops.cancelBill(Number(mm[1])));
      if (p === "/api/billing/export") {
        const what = url.searchParams.get("what"), format = url.searchParams.get("format") || "xlsx";
        if (!["sales", "purchases", "stock"].includes(what!) || !["xlsx", "csv", "tally"].includes(format)) return json({ error: "Unknown export." }, 400);
        const f = sync.exportFile(what as any, format as any);
        return new Response(f.body as any, { headers: { "Content-Type": f.type, "Content-Disposition": `attachment; filename="${f.name}"`, "Cache-Control": "no-store" } });
      }
      if (p === "/api/billing/sync/connect" && m === "POST") return json(sync.connect(await req.json() as any));
      if (p === "/api/billing/sync/disconnect" && m === "POST") return json(sync.disconnect());
      if (p === "/api/billing/sync/retry" && m === "POST") return json(sync.retry());
      if (p === "/api/demo-ledger/hook" && m === "POST") return json(sync.demoReceive(await req.json()));

      // Bills coming in from a photo or a billing-app export.
      if (p === "/api/billing/sources") return json({ sources: SOURCES, claude: claudeReady() });
      if (p === "/api/billing/scan" && m === "POST") {
        const form = await req.formData(); let img: any = form.get("image");
        if (form.get("sample")) img = Bun.file(path.join(DEMO, "bill-kpn.png"));
        if (!(img instanceof Blob) || img.size < 1000) return json({ error: "No photo was received." }, 400);
        if (img.size > 8_000_000) return json({ error: "That photo is too large. Try again a little further from the bill." }, 400);
        return json(ops.importPurchase(await readBillPhoto(img), "photo"));
      }
      if (p === "/api/billing/import" && m === "POST") {
        const form = await req.formData(); const sample = String(form.get("sample") || "");
        let name: string, bytes: Uint8Array;
        if (sample) {
          if (!/^[a-z0-9-]+\.(csv|xml|xlsx)$/.test(sample) || !fs.existsSync(path.join(DEMO, sample))) return json({ error: "No such sample." }, 400);
          name = sample; bytes = new Uint8Array(fs.readFileSync(path.join(DEMO, sample)));
        } else {
          const f = form.get("file");
          if (!(f instanceof Blob) || !f.size) return json({ error: "No file was received." }, 400);
          if (f.size > 5_000_000) return json({ error: "That file is over 5 MB. Export a shorter date range." }, 400);
          name = (f as File).name || "export.csv"; bytes = new Uint8Array(await f.arrayBuffer());
        }
        const parsed = parseBillFile(name, bytes, form.get("kind") === "sale" ? "sale" : "purchase");
        return json({ format: parsed.format, ...ops.importDocs(parsed.docs, parsed.format) });
      }

      if (p === "/api/area/search") return json(area.search(url.searchParams.get("q") || "", url.searchParams.get("lat") ? { lat: num(url.searchParams.get("lat")), lon: num(url.searchParams.get("lon")) } : undefined));
      if (p === "/api/area/report") return json(area.report(num(url.searchParams.get("lat")), num(url.searchParams.get("lon")), num(url.searchParams.get("r"), 800)));
      if (p === "/api/area/map") return json(area.mapData(num(url.searchParams.get("lat")), num(url.searchParams.get("lon")), num(url.searchParams.get("r"), 800)));

      return json({ error: "Not found" }, 404);
    } catch (err) { return fail(err); }
  },
});

console.log(`[thunai] http://localhost:${PORT}  sarvam:${sarvamReady() ? "ready" : "NO KEY"}  claude:${claudeReady() ? MODEL : "NO KEY"}  area:${area.areaReady() ? "ready" : "not built"}`);
