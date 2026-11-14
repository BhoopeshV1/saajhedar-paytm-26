// What someone on the fence told us, carried from the first check to the map
// and on into setting up the shop, so no step asks for it twice.
import type { Fit } from "./api";
export type Plan = { kind: string | null; budget: number; place: string; lat: number; lon: number; fit: Fit };
export const handoff: { plan: Plan | null; setup: boolean; kit: string[] } = { plan: null, setup: false, kit: ["qr"] };
export const lakh = (n: number) => `₹${n / 100000} lakh`;
export const askFor = (p: Plan) => `I have ${p.budget} rupees to invest${p.fit.chosen ? ` and I am thinking of opening a ${p.fit.chosen.label.toLowerCase()} shop` : ""} near ${p.place} (map point ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}). What should I open there, and what should I watch out for?`;
