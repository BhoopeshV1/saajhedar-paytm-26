import { useEffect, useState } from "react";
import { AppProvider, useApp } from "./store";
import { AssistantBar, BottomNav, Menu, PinSheet, Toasts } from "./components/Chrome";
import { Home } from "./screens/Home";
import { Sell, Stock, Pay, Collect, Rules } from "./screens/Jobs";
import { Area } from "./screens/Area";
import { Welcome } from "./screens/Welcome";

const seen = () => { try { return localStorage.getItem("thunai_setup") != null; } catch { return true; } };

function Shell() {
  const { screen } = useApp();
  const [menu, setMenu] = useState(false);
  const [welcome, setWelcome] = useState(() => !seen());
  useEffect(() => { const on = () => { setMenu(false); setWelcome(true); }; window.addEventListener("thunai:welcome", on); return () => window.removeEventListener("thunai:welcome", on); }, []);
  if (welcome) return <div className="shell welcome-shell"><Welcome onDone={(how) => { try { localStorage.setItem("thunai_setup", how); } catch {} setWelcome(false); }} /><Toasts /></div>;
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
    </div>
  );
}

export function OwnerApp() {
  return <AppProvider persona="owner"><Shell /></AppProvider>;
}
