import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/noto-sans-tamil/400.css";
import "@fontsource/noto-sans-tamil/600.css";
import "@fontsource/noto-sans-tamil/700.css";
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-devanagari/600.css";
import "@fontsource/noto-sans-devanagari/700.css";
import "./styles.css";
import { OwnerApp } from "./App";
import { CustomerApp } from "./Customer";

// On laptops the app is drawn inside a device frame of fixed proportions,
// scaled down to fit the window.
function fitDevice() {
  const w = innerWidth - 48, h = innerHeight - 48, r = document.documentElement.style;
  r.setProperty("--fit-phone", String(Math.min(1.1, w / 428, h / 900)));
  r.setProperty("--fit-tab", String(Math.min(1.25, w / 1058, h / 750)));
}
fitDevice(); addEventListener("resize", fitDevice);

function Root() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => { const on = () => setHash(location.hash); addEventListener("hashchange", on); return () => removeEventListener("hashchange", on); }, []);
  return hash.startsWith("#/order") ? <CustomerApp /> : <OwnerApp />;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Root /></StrictMode>);
