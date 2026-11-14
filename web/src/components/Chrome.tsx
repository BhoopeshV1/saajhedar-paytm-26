// The parts of the app that stay on screen: the assistant bar, the bottom
// navigation with the talk button, the PIN sheet and toasts.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { api, inr, type Lang, type Screen } from "../api";
import { t, LANG_NAMES, type Key } from "../i18n";
import { Orb } from "./Orb";
import { IconBack, IconClose, IconKeyboard, IconLock, IconMic, JOB_ICON } from "../icons";

const STATE_KEY: Record<string, Key> = { listening: "listening", hearing: "hearing", thinking: "thinking", speaking: "speaking" };

export function AssistantBar({ onMenu }: { onMenu: () => void }) {
  const { voice, caption, lang, toggleVoice, screen, go, say, busy, quiet, setQuiet } = useApp();
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (typing) input.current?.focus(); }, [typing]);

  const line = caption?.text ?? (voice === "off" ? t("tapToTalk", lang) : t(STATE_KEY[voice], lang));
  const status = voice !== "off" && caption ? t(STATE_KEY[voice], lang) : null;
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (text.trim()) { say(text); setText(""); setTyping(false); } };

  return (
    <header className="topbar">
      {screen === "home"
        ? <button className="icon-btn" onClick={onMenu} aria-label="Menu"><span className="avatar-dot" /></button>
        : <button className="icon-btn" onClick={() => go("home")} aria-label={t("home", lang)}><IconBack /></button>}
      {typing ? (
        <form className="pill pill-typing" onSubmit={submit}>
          <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("typePlaceholder", lang)} enterKeyHint="send" />
          <button type="submit" className="pill-send" disabled={!text.trim() || busy}>{t("send", lang)}</button>
          <button type="button" className="pill-x" onClick={() => setTyping(false)} aria-label="Close"><IconClose /></button>
        </form>
      ) : (
        <div className={`pill pill-${voice} ${caption?.who === "error" ? "pill-error" : ""}`}>
         <button className="pill-main" onClick={toggleVoice} aria-live="polite">
          <Orb size={44} />
          <span className="pill-text">
            {status && <span className="pill-status">{status}</span>}
            <span className={`pill-line ${caption?.who === "you" ? "pill-you" : ""}`} lang={/[஀-௿]/.test(line) ? "ta" : /[ऀ-ॿ]/.test(line) ? "hi" : "en"}>{line}</span>
          </span>
         </button>
         <button className={`pill-mute ${quiet ? "on" : ""}`} onClick={() => setQuiet(!quiet)} aria-pressed={quiet} aria-label={quiet ? "Spoken replies are off. Turn on" : "Spoken replies are on. Turn off"}>
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z" />{quiet ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" />}</svg>
         </button>
        </div>
      )}
      {!typing && <button className="icon-btn" onClick={() => setTyping(true)} aria-label={t("typeInstead", lang)}><IconKeyboard size={24} /></button>}
    </header>
  );
}

const TABS: Screen[] = ["sell", "stock", "pay", "collect"];

export function BottomNav() {
  const { screen, go, lang, voice, toggleVoice, state } = useApp();
  const badge: Record<string, number> = { sell: state?.overview.sell.waiting ?? 0, stock: state?.overview.stock.urgent ?? 0,
    pay: state?.bills.filter((b) => b.status !== "paid" && b.due_in <= 1).length ?? 0, collect: 0 };
  const tab = (s: Screen) => {
    const Icon = JOB_ICON[s];
    return (
      <button key={s} className={`tab ${screen === s ? "tab-on" : ""}`} onClick={() => go(s)} aria-current={screen === s ? "page" : undefined}>
        <span className="tab-icon"><Icon size={26} />{badge[s] > 0 && <span className="tab-badge">{badge[s]}</span>}</span>
        <span className="tab-label">{t(s as Key, lang)}</span>
      </button>
    );
  };
  return (
    <nav className="bottomnav">
      {TABS.slice(0, 2).map(tab)}
      <button className={`talk talk-${voice}`} onClick={toggleVoice} aria-label={voice === "off" ? "Talk to Thunai" : "Stop listening"}>
        <Orb size={68} interactive />
        <span className="talk-glyph">{voice === "off" ? <IconMic /> : null}</span>
      </button>
      {TABS.slice(2).map(tab)}
    </nav>
  );
}

export function PinSheet() {
  const { pin, closePin, lang, tellAssistant, toast, refresh } = useApp();
  const [digits, setDigits] = useState("");
  const [bad, setBad] = useState(false);
  const [working, setWorking] = useState(false);
  useEffect(() => { setDigits(""); setBad(false); }, [pin?.id]);

  useEffect(() => {
    if (!pin || digits.length < 4 || working) return;
    setWorking(true);
    api.pending(pin.id, digits, true).then((r) => {
      closePin(); refresh();
      toast({ title: r.outcome || r.summary, tone: "good" });
      const guard = r.guard_actions?.length ? ` The new rule already acted: ${r.guard_actions.map((g: any) => `${g.action} the ${g.item} standing order`).join("; ")}.` : "";
      tellAssistant(`The owner entered their PIN and approved: ${pin.summary}. Result: ${r.outcome}${guard}`);
    }).catch((err) => {
      if (/PIN/i.test(err.message)) { setBad(true); setDigits(""); }
      else { toast({ title: err.message }); closePin(); refresh(); }
    }).finally(() => setWorking(false));
  }, [digits]); // eslint-disable-line

  if (!pin) return null;
  const decline = () => {
    api.pending(pin.id, null, false).catch(() => {}).finally(() => { closePin(); refresh(); tellAssistant(`The owner declined: ${pin.summary}. Nothing was changed.`); });
  };
  const press = (d: string) => { setBad(false); setDigits((x) => (x.length < 4 ? x + d : x)); };
  const amount = pin.payload?.amount as number | undefined;

  return (
    <div className="sheet-scrim" role="dialog" aria-modal="true" aria-label={t("enterPin", lang)}>
      <div className="sheet">
        <div className="sheet-grip" />
        <div className="pin-head">
          <span className="pin-lock"><IconLock size={20} /></span>
          <div>
            <h2 className="pin-title">{pin.summary}</h2>
            {amount != null && pin.kind !== "pay_bill" && <p className="pin-amount">{inr(amount)}</p>}
          </div>
        </div>
        <p className="pin-reason">{pin.reason}</p>
        <p className={`pin-prompt ${bad ? "pin-bad" : ""}`}>{bad ? t("wrongPin", lang) : t("enterPin", lang)}</p>
        <div className={`pin-dots ${bad ? "shake" : ""}`}>{[0, 1, 2, 3].map((i) => <span key={i} className={`pin-dot ${digits.length > i ? "on" : ""}`} />)}</div>
        <div className="keypad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} className="key" onClick={() => press(d)} disabled={working}>{d}</button>)}
          <button className="key key-text" onClick={decline}>{t("decline", lang)}</button>
          <button className="key" onClick={() => press("0")} disabled={working}>0</button>
          <button className="key key-text" onClick={() => setDigits((x) => x.slice(0, -1))} aria-label="Delete">⌫</button>
        </div>
        <p className="pin-note">Demo PIN: 1234</p>
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`toast toast-${x.tone ?? "info"}`}><strong>{x.title}</strong>{x.body && <span>{x.body}</span>}</div>
      ))}
    </div>
  );
}

export function Menu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang, setLang, state, act, health, go, quiet, setQuiet } = useApp();
  if (!open) return null;
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet menu" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h2 className="menu-shop">{state?.overview.shop.name}</h2>
        <p className="menu-sub">{state?.overview.shop.owner}, {state?.overview.shop.locality}</p>
        <div className="menu-block">
          <span className="menu-label">{t("language", lang)}</span>
          <div className="seg">
            {(Object.keys(LANG_NAMES) as Lang[]).map((l) => <button key={l} className={`seg-btn ${lang === l ? "on" : ""}`} onClick={() => setLang(l)}>{LANG_NAMES[l]}</button>)}
          </div>
        </div>
        <div className="menu-block">
          <span className="menu-label">{lang === "ta-IN" ? "குரல் பதில்" : lang === "hi-IN" ? "बोलकर जवाब" : "Spoken replies"}</span>
          <div className="seg">
            <button className={`seg-btn ${!quiet ? "on" : ""}`} onClick={() => setQuiet(false)}>{lang === "ta-IN" ? "இயக்கு" : lang === "hi-IN" ? "चालू" : "On"}</button>
            <button className={`seg-btn ${quiet ? "on" : ""}`} onClick={() => setQuiet(true)}>{lang === "ta-IN" ? "நிறுத்து (உரை மட்டும்)" : lang === "hi-IN" ? "बंद (केवल लिखित)" : "Off (text only)"}</button>
          </div>
        </div>
        <button className="menu-row" onClick={() => { go("rules"); onClose(); }}>{t("rules", lang)}</button>
        <button className="menu-row" onClick={() => { go("area"); onClose(); }}>{t("area", lang)}</button>
        <a className="menu-row" href="#/order" target="_blank" rel="noreferrer">{t("customerView", lang)}</a>
        <button className="menu-row" onClick={() => window.dispatchEvent(new Event("thunai:welcome"))}>{lang === "ta-IN" ? "தொடக்கத் திரை" : lang === "hi-IN" ? "शुरुआती स्क्रीन" : "Welcome and setup"}</button>
        <button className="menu-row menu-danger" onClick={() => act(() => api.reset()).then(onClose)}>{t("resetDemo", lang)}</button>
        <p className="menu-foot">
          {t("prototype", lang)}. Voice by Sarvam AI {health?.sarvam ? "" : "(key missing)"}, reasoning by Claude {health?.claude ? "" : "(key missing)"}. Payments, loans and messages are simulated.
        </p>
      </div>
    </div>
  );
}
