// Line icons drawn to sit beside Paytm for Business artwork: navy outlines with
// one cyan-filled detail each.
import type { ReactNode } from "react";

const NAVY = "#0B2A66", CYAN = "#00B9F1";
type P = { size?: number; className?: string };
const svg = (children: ReactNode) => ({ size = 28, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {children}
  </svg>
);

export const IconSell = svg(<>
  <path d="M5 12h22l-1.6 13a2 2 0 0 1-2 1.8H8.6a2 2 0 0 1-2-1.8L5 12Z" fill="#fff" />
  <path d="M11 12V9.5a5 5 0 0 1 10 0V12" />
  <rect x="11.5" y="16.5" width="9" height="5" rx="1.5" fill={CYAN} stroke="none" />
</>);
export const IconStock = svg(<>
  <path d="M4.5 11.5 16 5.5l11.5 6v10L16 27.5l-11.5-6v-10Z" fill="#fff" />
  <path d="M4.5 11.5 16 17.5l11.5-6M16 17.5v10" />
  <path d="m10 8.6 11.6 6v4.2l-3 1.5v-4.1L7.2 10.1" fill={CYAN} stroke="none" opacity=".95" />
</>);
export const IconPay = svg(<>
  <rect x="4" y="8" width="24" height="17" rx="3.5" fill="#fff" />
  <path d="M4 13.5h24" />
  <rect x="8" y="17.5" width="8" height="3.6" rx="1.2" fill={CYAN} stroke="none" />
</>);
export const IconCollect = svg(<>
  <path d="M8 4.5h13l4 4V26a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 7 26V5.5a1 1 0 0 1 1-1Z" fill="#fff" />
  <path d="M11.5 12h9M11.5 16.5h5" />
  <circle cx="20.5" cy="21.5" r="4.2" fill={CYAN} stroke="none" />
  <path d="m18.7 21.6 1.3 1.3 2.4-2.6" stroke="#fff" strokeWidth="1.8" />
</>);
export const IconHome = svg(<>
  <path d="M5 14.5 16 5.5l11 9V26a1.5 1.5 0 0 1-1.5 1.5h-19A1.5 1.5 0 0 1 5 26V14.5Z" fill="#fff" />
  <rect x="12.5" y="18" width="7" height="9.5" rx="1.2" fill={CYAN} stroke="none" />
</>);
export const IconRules = svg(<>
  <path d="M16 4.5 26 8v7.5c0 6-4.2 10-10 12-5.8-2-10-6-10-12V8l10-3.5Z" fill="#fff" />
  <path d="m11.5 15.8 3.2 3.2 6-6.4" stroke={CYAN} strokeWidth="2.6" />
</>);
export const IconArea = svg(<>
  <path d="M4.5 9 12 6l8 3 7.5-3v17L20 26l-8-3-7.5 3V9Z" fill="#fff" />
  <path d="M12 6v17M20 9v17" />
  <circle cx="16" cy="14.5" r="3.2" fill={CYAN} stroke="none" />
</>);
export const IconKeyboard = svg(<>
  <rect x="3.5" y="8.5" width="25" height="15" rx="3" />
  <path d="M8 13h.01M12 13h.01M16 13h.01M20 13h.01M24 13h.01M8 17h.01M24 17h.01M11.5 19.5h9" strokeWidth="2.4" />
</>);
export const IconChevron = ({ size = 18, dir = "right" }: { size?: number; dir?: "right" | "left" | "down" }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ transform: dir === "left" ? "rotate(180deg)" : dir === "down" ? "rotate(90deg)" : undefined }}><path d="m7.5 4.5 5.5 5.5-5.5 5.5" /></svg>
);
export const IconCheck = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4.5 10.5 3.8 3.8 7.2-8" /></svg>
);
export const IconClose = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
);
export const IconSearch = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="m13.5 13.5 3.5 3.5" /></svg>
);
export const IconMic = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </svg>
);
export const IconBack = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5m0 0 6-6m-6 6 6 6" /></svg>
);
export const IconLock = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="9" width="12" height="8" rx="2" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg>
);

export const JOB_ICON: Record<string, (p: P) => ReactNode> = { sell: IconSell, stock: IconStock, pay: IconPay, collect: IconCollect, rules: IconRules, area: IconArea, home: IconHome };
