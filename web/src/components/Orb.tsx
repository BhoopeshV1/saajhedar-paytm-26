// The assistant's orb. It breathes when idle, swells with the speaker's voice
// while listening, turns while thinking, and pulses with its own speech.
import { useEffect, useRef } from "react";
import { useApp } from "../store";

export function Orb({ size = 56, interactive = false }: { size?: number; interactive?: boolean }) {
  const { voice, levelRef } = useApp();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0, smooth = 0;
    const tick = () => {
      smooth += (levelRef.current - smooth) * 0.25;
      ref.current?.style.setProperty("--level", smooth.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levelRef]);
  return (
    <span ref={ref} className={`orb orb-${voice}${interactive ? " orb-big" : ""}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="orb-halo" />
      <span className="orb-body"><span className="orb-swirl" /><span className="orb-core" /></span>
    </span>
  );
}
