import { useEffect, useState } from "react";
import { AppProvider, useApp } from "./store";
import { AssistantBar, BottomNav, Menu, PinSheet, Toasts } from "./components/Chrome";
import { Home } from "./screens/Home";
import { Sell, Stock, Pay, Collect, Rules } from "./screens/Jobs";
import { Area } from "./screens/Area";
import { Welcome, Splash } from "./screens/Welcome";

const seen = () => { try { return localStorage.getItem("thunai_setup") != null; } catch { return true; } };

// Laptop screens only: switch between the wide layout and a phone-width one.
function LayoutToggle() {
  const [mode, setMode] = useState<"wide" | "phone">(() => { try { return localStorage.getItem("saajhedar.layout") === "phone" ? "phone" : "wide"; } catch { return "wide"; } });
  useEffect(() => { document.documentElement.dataset.layout = mode; try { localStorage.setItem("saajhedar.layout", mode); } catch {} }, [mode]);
  const ico = (d: string) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
  return (
    <div className="layout-toggle" role="group" aria-label="Layout">
      <button aria-pressed={mode === "wide"} aria-label="Wide view" title="Wide view" onClick={() => setMode("wide")}>{ico("M3 5h18v11H3zM8 20h8M12 16v4")}</button>
      <button aria-pressed={mode === "phone"} aria-label="Phone view" title="Phone view" onClick={() => setMode("phone")}>{ico("M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2")}</button>
    </div>
  );
}

function Shell() {
  const { screen } = useApp();
  const [menu, setMenu] = useState(false);
  const [welcome, setWelcome] = useState(() => !seen());
  const [splash, setSplash] = useState(true);
  useEffect(() => { const on = () => { setMenu(false); setWelcome(true); }; window.addEventListener("thunai:welcome", on); return () => window.removeEventListener("thunai:welcome", on); }, []);
  if (welcome) return <div className="shell welcome-shell"><Welcome onDone={(how) => { try { localStorage.setItem("thunai_setup", how); } catch {} setWelcome(false); }} /><Toasts />{splash && <Splash onDone={() => setSplash(false)} />}</div>;
  return (
    <div className="shell">
      <AssistantBar onMenu={() => setMenu(true)} />
      <main key={screen}>
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
      <LayoutToggle />
      {splash && <Splash onDone={() => setSplash(false)} />}
    </div>
  );
}

export function OwnerApp() {
  return <AppProvider persona="owner"><Shell /></AppProvider>;
}
