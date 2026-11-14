// In-process event bus. The server pushes these to every open screen over SSE,
// so an order spoken on the customer's phone appears on the owner's phone.
export type BusEvent =
  | { type: "refresh" }
  | { type: "order"; id: number; customer: string; total: number; lines: any[]; fulfil: string }
  | { type: "paid"; customer: string; amount: number; left: number }
  | { type: "pin"; pending: { id: number; kind: string; payload: any; summary: string; reason: string } };

const subs = new Set<(e: BusEvent) => void>();
export function subscribe(fn: (e: BusEvent) => void) { subs.add(fn); return () => subs.delete(fn); }
export function emit(e: BusEvent) { for (const fn of subs) { try { fn(e); } catch {} } }
