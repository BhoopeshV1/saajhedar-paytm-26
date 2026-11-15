// App state: the shop snapshot, the current screen, and the voice assistant.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, turn, type Lang, type Pending, type Screen, type State, type TurnEvent } from "./api";
import { VoiceEngine, type VoiceState } from "./voice";
import { orderAnnouncement } from "./i18n";

export type Caption = { who: "you" | "thunai" | "error"; text: string } | null;
export type Toast = { id: number; title: string; body?: string; tone?: "info" | "good" };

type Ctx = {
  state: State | null; lang: Lang; setLang: (l: Lang) => void;
  screen: Screen; go: (s: Screen) => void; focus: Record<string, any> | null; setFocus: (f: Record<string, any> | null) => void;
  voice: VoiceState; caption: Caption; busy: boolean;
  quiet: boolean; setQuiet: (q: boolean) => void; toggleVoice: () => void; say: (text: string) => void; tellAssistant: (event: string) => void; stopVoice: () => void;
  levelRef: React.MutableRefObject<number>;
  pin: Pending | null; openPin: (p: Pending) => void; closePin: () => void;
  toasts: Toast[]; toast: (t: Omit<Toast, "id">) => void;
  health: { sarvam: boolean; claude: boolean; area: { ready: boolean } } | null;
  refresh: () => void;
  act: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
};
const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);

const session = "s" + Math.random().toString(36).slice(2, 10);

// Voice diagnostics go to the server log, so a microphone problem on someone's
// laptop can be read there. Levels and states only, never audio.
const voiceSession = Math.random().toString(36).slice(2, 8);
const voiceLog = (event: string, data: Record<string, unknown> = {}) => {
  const body = JSON.stringify({ s: voiceSession, event, ...data, ...(event === "mic-open" ? { ua: navigator.userAgent, view: `${innerWidth}x${innerHeight}`, layout: document.documentElement.dataset.layout || "wide" } : {}) });
  fetch("/api/voice-log", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
};

export function AppProvider({ persona, customerId, children }: { persona: "owner" | "customer"; customerId?: number; children: ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem("saajhedar.lang") as Lang) || "en-IN");
  const [screen, setScreen] = useState<Screen>("home");
  // Quiet mode: replies are shown as text only, so no speech is requested or paid for.
  const [quiet, setQuietState] = useState(() => { try { return localStorage.getItem("thunai.quiet") === "1"; } catch { return false; } });
  const quietRef = useRef(quiet);
  const setQuiet = useCallback((q: boolean) => { quietRef.current = q; setQuietState(q); try { localStorage.setItem("thunai.quiet", q ? "1" : "0"); } catch {} }, []);
  const [focus, setFocus] = useState<Record<string, any> | null>(null);
  const [voice, setVoice] = useState<VoiceState>("off");
  const [caption, setCaption] = useState<Caption>(null);
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState<Pending | null>(null);
  const inTurn = useRef(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [health, setHealth] = useState<Ctx["health"]>(null);
  const levelRef = useRef(0);
  const langRef = useRef(lang); langRef.current = lang;
  const abortRef = useRef<AbortController | null>(null);
  const customerRef = useRef(customerId); customerRef.current = customerId;

  const setLang = useCallback((l: Lang) => { setLangState(l); localStorage.setItem("saajhedar.lang", l); }, []);
  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 5200);
  }, []);

  const refresh = useCallback(() => { api.state().then(setState).catch(() => {}); }, []);

  // One assistant turn, from audio, typed text or an app event.
  const runTurn = useCallback(async (input: { audio?: Blob; text?: string; event?: string }) => {
    const eng = engine.current!;
    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;
    setBusy(true); inTurn.current = true;
    if (eng.current !== "off") eng.setThinking();
    let gotAudio = false;
    eng.beginReply(() => { eng.resume(); });
    try {
      await turn({ ...input, session, persona, customerId: customerRef.current, lang: input.audio ? "unknown" : langRef.current, speak: !quietRef.current }, (e: TurnEvent) => {
        if (ac.signal.aborted) return;
        switch (e.type) {
          case "heard": if (e.text) setCaption({ who: "you", text: e.text }); break;
          case "empty": setCaption(null); break;
          case "tool":
            if (e.screen) setScreen(e.screen);
            if (e.focus) setFocus(e.focus);
            refresh();
            break;
          case "say": setCaption({ who: "thunai", text: e.text }); break;
          case "audio": gotAudio = true; eng.enqueue(e.b64, e.last); break;
          case "error": setCaption({ who: "error", text: e.message }); break;
        }
      }, ac.signal);
    } catch (err: any) {
      if (err?.name !== "AbortError") setCaption({ who: "error", text: "Could not reach the server. Check the connection and try again." });
    }
    inTurn.current = false;
    if (!ac.signal.aborted) {
      if (!gotAudio) eng.endReply();
      setBusy(false);
      refresh();
    }
  }, [persona, refresh]);

  const engine = useRef<VoiceEngine | null>(null);
  if (!engine.current) {
    engine.current = new VoiceEngine({
      onState: (st) => { setVoice(st); voiceLog("state", { state: st }); },
      onDebug: voiceLog,
      onLevel: (l) => { levelRef.current = l; },
      onUtterance: (wav) => { voiceLog("sending", { bytes: wav.size }); runTurn({ audio: wav }); },
      onError: (message) => setCaption({ who: "error", text: message }),
    });
  }

  const briefed = useRef(false);
  const toggleVoice = useCallback(() => {
    const eng = engine.current!;
    if (eng.current === "off") {
      setCaption(null); eng.start();
      // The first tap of a session: Saajhedar speaks first with the morning briefing.
      if (persona === "owner" && !briefed.current) { briefed.current = true; runTurn({ event: "The owner has just opened the app for the day. Give the morning briefing." }); }
    }
    else if (eng.current === "speaking") { eng.stopSpeaking(); eng.resume(); }
    else { abortRef.current?.abort(); setBusy(false); eng.stop(); }
  }, [persona, runTurn]);
  const stopVoice = useCallback(() => { abortRef.current?.abort(); setBusy(false); engine.current!.stop(); }, []);
  const say = useCallback((text: string) => { if (!text.trim()) return; engine.current!.unlock().catch(() => {}); runTurn({ text: text.trim() }); }, [runTurn]);
  const tellAssistant = useCallback((event: string) => { runTurn({ event }); }, [runTurn]);

  // Wraps a tapped action: runs it, shows a failure as a toast, refreshes.
  const act = useCallback(async <T,>(fn: () => Promise<T>) => {
    try { const r = await fn(); refresh(); return r; }
    catch (err: any) { toast({ title: err?.message || "That did not work" }); return undefined; }
  }, [refresh, toast]);

  // Live updates from the server.
  useEffect(() => {
    refresh();
    api.health().then(setHealth).catch(() => {});
    let es: EventSource | null = null; let timer: any; let closed = false;
    const connect = () => {
      es = new EventSource("/api/events");
      es.onmessage = (m) => {
        let e: any; try { e = JSON.parse(m.data); } catch { return; }
        if (e.type === "refresh" || e.type === "hello") refresh();
        if (persona !== "owner") return;
        // Asked for by voice just now: open the PIN sheet. Anything else waits in the notice on screen.
        if (e.type === "pin") { if (inTurn.current) setPin(e.pending); else { refresh(); toast({ title: e.pending.summary, body: "Waiting for your PIN", tone: "info" }); } }
        if (e.type === "order") {
          refresh();
          toast({ title: `New order from ${e.customer}`, body: `${e.lines.length} items, ₹${e.total}`, tone: "info" });
          const l = langRef.current;
          if (!quietRef.current) api.tts(orderAnnouncement(e.customer, e.total, l), l).then((a) => engine.current!.playOnce(a.b64)).catch(() => {});
        }
        if (e.type === "paid") toast({ title: `${e.customer} paid ₹${e.amount}`, body: e.left === 0 ? "Udhaar cleared" : `₹${e.left} still open`, tone: "good" });
      };
      es.onerror = () => { es?.close(); if (!closed) timer = setTimeout(connect, 2500); };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); es?.close(); };
  }, [persona, refresh, toast]);

  // If the page loads with something already waiting for a PIN, show it.
  // Things waiting for the PIN are listed on screen (Waiting); the sheet opens only when the owner taps one,
  // or when they have just asked the assistant for it by voice.

  const go = useCallback((s: Screen) => { setScreen(s); setFocus(null); window.scrollTo({ top: 0 }); document.querySelector(".shell > main")?.scrollTo({ top: 0 }); }, []);
  const closePin = useCallback(() => setPin(null), []);

  const value = useMemo<Ctx>(() => ({ quiet, setQuiet, state, lang, setLang, screen, go, focus, setFocus, voice, caption, busy, toggleVoice, say, tellAssistant, stopVoice, levelRef,
    pin, openPin: setPin, closePin, toasts, toast, health, refresh, act }),
    [quiet, setQuiet, state, lang, setLang, screen, go, focus, voice, caption, busy, toggleVoice, say, tellAssistant, stopVoice, pin, closePin, toasts, toast, health, refresh, act]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
