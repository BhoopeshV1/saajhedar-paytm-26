// SQLite store for one shop. Everything the assistant does goes through here,
// so the UI, the rules engine and the agent all read the same state.
import { Database } from "bun:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(here, "../data");
export const db = new Database(path.join(DATA_DIR, "shop.sqlite"), { create: true });
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

export function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS shop (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL, owner TEXT NOT NULL, locality TEXT NOT NULL,
    lat REAL NOT NULL, lon REAL NOT NULL,
    cash INTEGER NOT NULL,              -- rupees available for supplier payments
    language TEXT NOT NULL DEFAULT 'ta-IN'
  );
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, supplies TEXT NOT NULL,
    trusted INTEGER NOT NULL DEFAULT 1,  -- 0 = new supplier, never paid before
    lead_days INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY, sku TEXT UNIQUE NOT NULL,
    name_en TEXT NOT NULL, name_ta TEXT NOT NULL, name_hi TEXT NOT NULL,
    aliases TEXT NOT NULL DEFAULT '',    -- comma separated spoken variants
    category TEXT NOT NULL, unit TEXT NOT NULL,
    price INTEGER NOT NULL, cost INTEGER NOT NULL,
    stock REAL NOT NULL, pack REAL NOT NULL DEFAULT 1,
    supplier_id INTEGER REFERENCES suppliers(id),
    perishable INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sales (
    day TEXT NOT NULL, item_id INTEGER NOT NULL REFERENCES items(id), qty REAL NOT NULL,
    PRIMARY KEY (day, item_id)
  );
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL,
    street TEXT NOT NULL DEFAULT '', usual TEXT NOT NULL DEFAULT '[]',
    language TEXT NOT NULL DEFAULT 'ta-IN'
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id),
    lines TEXT NOT NULL, total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',   -- new | packing | ready | done
    fulfil TEXT NOT NULL DEFAULT 'pickup',-- pickup | parcel
    pay TEXT NOT NULL DEFAULT 'upi',      -- upi | cash | udhaar
    channel TEXT NOT NULL DEFAULT 'voice',
    said TEXT NOT NULL DEFAULT '',        -- what the customer actually said
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS standing_orders (
    id INTEGER PRIMARY KEY, supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    item_id INTEGER NOT NULL REFERENCES items(id),
    qty REAL NOT NULL, cadence TEXT NOT NULL,      -- daily | weekly
    status TEXT NOT NULL DEFAULT 'active',         -- active | paused | cancelled
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS supplier_orders (
    id INTEGER PRIMARY KEY, supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    lines TEXT NOT NULL, total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'placed', created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY, supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    ref TEXT NOT NULL, lines TEXT NOT NULL,       -- [{sku, billed_qty, received_qty, rate}]
    amount INTEGER NOT NULL, due_day TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'due',           -- due | paid | held
    paid_amount INTEGER, paid_at TEXT, paid_via TEXT,
    source TEXT NOT NULL DEFAULT 'entered',       -- entered | photo | Tally XML | Excel | CSV
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS receipts (           -- what was counted in at delivery
    id INTEGER PRIMARY KEY, supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    day TEXT NOT NULL, lines TEXT NOT NULL,       -- [{sku, qty}]
    bill_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS dues (
    id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id),
    amount INTEGER NOT NULL, since_day TEXT NOT NULL,
    reminders INTEGER NOT NULL DEFAULT 0, last_reminder_at TEXT,
    last_message TEXT
  );
  CREATE TABLE IF NOT EXISTS due_payments (
    id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id),
    amount INTEGER NOT NULL, at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY, kind TEXT NOT NULL,
    params TEXT NOT NULL, spoken TEXT NOT NULL,   -- the owner's own words
    active INTEGER NOT NULL DEFAULT 1, signed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY, amount INTEGER NOT NULL, fee INTEGER NOT NULL,
    daily_repay INTEGER NOT NULL, purpose TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', taken_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pending (
    id INTEGER PRIMARY KEY, kind TEXT NOT NULL,   -- pay_bill | add_rule | remove_rule | take_loan
    payload TEXT NOT NULL, summary TEXT NOT NULL, reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',       -- waiting | approved | declined
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY, at TEXT NOT NULL,
    job TEXT NOT NULL,                            -- sell | stock | pay | collect | rules | area
    text TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
    by TEXT NOT NULL DEFAULT 'thunai'             -- thunai | owner | rule | customer
  );
  CREATE TABLE IF NOT EXISTS outbox (             -- entries owed to the shop's billing app
    id INTEGER PRIMARY KEY, at TEXT NOT NULL,
    kind TEXT NOT NULL,                           -- sale | purchase_bill | payment
    ref TEXT NOT NULL, title TEXT NOT NULL, payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',       -- waiting | sent | failed
    tries INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', sent_at TEXT
  );
  CREATE TABLE IF NOT EXISTS calls (              -- phone orders placed with suppliers
    id INTEGER PRIMARY KEY, at TEXT NOT NULL, supplier_id INTEGER, supplier TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'simulated',       -- simulated | sarvam
    status TEXT NOT NULL, via TEXT NOT NULL DEFAULT '',
    lines TEXT NOT NULL DEFAULT '[]', total INTEGER NOT NULL DEFAULT 0,
    transcript TEXT NOT NULL DEFAULT '[]', summary TEXT NOT NULL DEFAULT '',
    order_id INTEGER, bill_id INTEGER,
    attempt_id TEXT                               -- the voice agent's id for a real call
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  // Databases made before real calls existed lack this column.
  try { db.exec("ALTER TABLE calls ADD COLUMN attempt_id TEXT"); } catch {}
}

export const nowIso = () => new Date().toISOString();
export const today = () => dayStr(new Date());
export function dayStr(d: Date) {
  // Shop days are local (IST) days.
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}
export function addDays(day: string, n: number) {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

export function log(job: string, text: string, detail = "", by = "thunai") {
  db.query("INSERT INTO activity (at, job, text, detail, by) VALUES (?,?,?,?,?)").run(nowIso(), job, text, detail, by);
}

export type Row = Record<string, any>;
export const all = (sql: string, ...p: any[]) => db.query(sql).all(...p) as any[];
export const get = (sql: string, ...p: any[]) => db.query(sql).get(...p) as any;
export const run = (sql: string, ...p: any[]) => db.query(sql).run(...p);
