import { useEffect, useState } from "react";
import { AppProvider, useApp } from "./store";
import { AssistantBar, BottomNav, Menu, PinSheet, Toasts, Waiting } from "./components/Chrome";
import { Home } from "./screens/Home";
import { Sell, Stock, Pay, Collect, Rules } from "./screens/Jobs";
import { Area } from "./screens/Area";
import { Welcome, Splash } from "./screens/Welcome";

const seen = () => { try { return localStorage.getItem("thunai_setup") != null; } catch { return true; } };

// Laptop screens only: switch between the wide layout and a phone-width one.
function LayoutToggle() {
  const [mode, setMode] = useState<"wide" | "phone">(() => { try { return localStorage.getItem("saajhedar.layout") === "phone" ? "phone" : "wide"; } catch { return "wide"; } });
  // Background behind the device: plain gradient, logo wallpaper, or doodles.
  const WALLS = ["plain", "logo", "doodle"] as const;
  const [wall, setWall] = useState<(typeof WALLS)[number]>(() => { const w = document.documentElement.dataset.wall; return w === "logo" || w === "doodle" ? w : "plain"; });
  useEffect(() => { if (wall === "plain") delete document.documentElement.dataset.wall; else document.documentElement.dataset.wall = wall; try { localStorage.setItem("saajhedar.wall", wall); } catch {} }, [wall]);
  useEffect(() => { document.documentElement.dataset.layout = mode; try { localStorage.setItem("saajhedar.layout", mode); } catch {} }, [mode]);
  const ico = (d: string) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
  return (
    <div className="layout-toggle" role="group" aria-label="Layout">
      <button aria-pressed={mode === "wide"} aria-label="Wide view" title="Wide view" onClick={() => setMode("wide")}>{ico("M3 5h18v11H3zM8 20h8M12 16v4")}</button>
      <button aria-pressed={mode === "phone"} aria-label="Phone view" title="Phone view" onClick={() => setMode("phone")}>{ico("M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2")}</button>
      <span className="layout-sep" />
      <button aria-pressed={wall !== "plain"} aria-label={`Background: ${wall}. Change it`} title="Change the background" onClick={() => setWall(WALLS[(WALLS.indexOf(wall) + 1) % WALLS.length])}>{ico("M4 4h7v7H4zM13 13h7v7h-7zM13 4h7v7h-7zM4 13h7v7H4z")}</button>
    </div>
  );
}

// Laptop screens only: the team's badge, tucked into the corner of the wallpaper.
// It peeks in, opens once to show the team name, and shows the members on hover.
function TeamBadge() {
  const [open, setOpen] = useState(false);
  return (
    <button className={`team-badge ${open ? "is-open" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Team Finance Tours: Bhoopesh and Mirudhula">
      <span className="tb-mascot" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="44" height="44">
          <defs><radialGradient id="tbFace" cx="38%" cy="30%" r="80%"><stop offset="0" stopColor="#B9F0FF" /><stop offset=".55" stopColor="#22BDF2" /><stop offset="1" stopColor="#0B63C9" /></radialGradient></defs>
          <circle cx="24" cy="27" r="17" fill="url(#tbFace)" />
          <path className="tb-cap" d="M9.5 20.5C11 11 18 7 25 7.6c6.6.6 12 5 13.6 12.6l5.2 1.5c1 .3.9 1.7-.1 1.9-9.5 1.8-23 1.5-33.5-.6-1.1-.2-1.4-1.6-.7-2.5z" fill="#002970" />
          <circle cx="25" cy="7.4" r="1.9" fill="#8FDCF8" />
          <g className="tb-eyes" fill="#00224F"><ellipse cx="18.5" cy="29" rx="2.1" ry="2.7" /><ellipse cx="29.5" cy="29" rx="2.1" ry="2.7" /></g>
          <path d="M19 35.5c3 2.6 7 2.6 10 0" fill="none" stroke="#00224F" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="14.5" cy="33.5" r="2.2" fill="#fff" opacity=".35" /><circle cx="33.5" cy="33.5" r="2.2" fill="#fff" opacity=".35" />
        </svg>
      </span>
      <span className="tb-text">
        <b>Finance Tours</b>
        <span className="tb-members"><i>Bhoopesh</i><i>Mirudhula</i></span>
      </span>
    </button>
  );
}

function Shell() {
  const { screen } = useApp();
  const [menu, setMenu] = useState(false);
  const [welcome, setWelcome] = useState(() => !seen());
  const [splash, setSplash] = useState(true);
  useEffect(() => { const on = () => { setMenu(false); setWelcome(true); }; window.addEventListener("thunai:welcome", on); return () => window.removeEventListener("thunai:welcome", on); }, []);
  if (welcome) return <><div className="shell welcome-shell"><Welcome onDone={(how) => { try { localStorage.setItem("thunai_setup", how); } catch {} setWelcome(false); }} /><Toasts />{splash && <Splash onDone={() => setSplash(false)} />}</div><LayoutToggle /><TeamBadge /></>;
  return (
    <>
    <div className="shell">
      <AssistantBar onMenu={() => setMenu(true)} />
      <main key={screen}>
        {screen !== "home" && screen !== "area" && <Waiting />}
        {screen === "home" && <Home />}
        {screen === "sell" && <Sell />}
        {screen === "stock" && <Stock />}
        {screen === "pay" && <Pay />}
        {screen === "collect" && <Collect />}
        {screen === "rules" && <Rules />}
        {screen === "area" && <Area />}
      </main>
      <BottomNav />
      <Menu open={menu} onClose={() => setMenu(false)} />
      <PinSheet />
      <Toasts />
      {splash && <Splash onDone={() => setSplash(false)} />}
    </div>
    <LayoutToggle />
    <TeamBadge />
    </>
  );
}

export function OwnerApp() {
  return <AppProvider persona="owner"><Shell /></AppProvider>;
}
