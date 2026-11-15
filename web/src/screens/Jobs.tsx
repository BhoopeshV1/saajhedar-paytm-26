// The four job screens: Sell, Stock, Pay and Collect, and the rules screen.
import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { api, inr, qty, type Bill, type Order } from "../api";
import { t, nameOf, ago, reasonText } from "../i18n";
import { Outlook } from "./Outlook";
import { Suppliers } from "./Suppliers";
import { AddBill } from "./AddBill";
import { BillBook } from "./BillBook";
import { RulesFor } from "./RulesFor";
import { PhoneOrders } from "./PhoneOrders";
import { IconCheck, IconLock } from "../icons";

function useFocusScroll(match: boolean) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (match) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [match]);
  return ref as any;
}

// ---------------- Sell ----------------
function OrderCard({ o }: { o: Order }) {
  const { lang, act, focus } = useApp();
  const on = focus?.order_id === o.id;
  const ref = useFocusScroll(on);
  const next = o.status === "new" ? { to: "packing", label: t("startPacking", lang) } : o.status === "packing" ? { to: "ready", label: t("bagReady", lang) } : { to: "done", label: t("handedOver", lang) };
  return (
    <article ref={ref} className={`card order ${on ? "focus" : ""}`}>
      <header className="order-head">
        <div>
          <h3 className="order-name">{o.customer}</h3>
          <p className="muted">{o.street ? `${o.street}, ` : ""}{ago(o.created_at, lang)}</p>
        </div>
        <div className="order-total">{inr(o.total)}<span className={`chip ${o.fulfil === "parcel" ? "chip-warn" : ""}`}>{t(o.fulfil === "parcel" ? "parcel" : "pickup", lang)}</span></div>
      </header>
      {o.said && <p className="quote" lang={/[஀-௿]/.test(o.said) ? "ta" : undefined}>“{o.said}”</p>}
      <ul className="lines">
        {o.lines.map((l) => <li key={l.sku}><span>{nameOf(l, lang)}</span><span className="num">{qty(l.qty)} {l.unit}</span></li>)}
      </ul>
      <button className="btn btn-primary" onClick={() => act(() => api.orderStatus(o.id, next.to))}>{next.label}</button>
    </article>
  );
}

export function Sell() {
  const { state, lang } = useApp();
  if (!state) return null;
  const open = state.orders.filter((o) => o.status !== "done");
  const groups: [string, Order[]][] = [[t("newOrders", lang), open.filter((o) => o.status === "new")], [t("packing", lang), open.filter((o) => o.status === "packing")], [t("ready", lang), open.filter((o) => o.status === "ready")]];
  return (
    <div className="screen">
      <h1 className="title">{t("sell", lang)}</h1>
      <RulesFor job="sell" />
      <BillBook />
      {open.length === 0 && <p className="empty card">{t("noOrders", lang)}</p>}
      {groups.filter(([, list]) => list.length).map(([label, list]) => (
        <section key={label}>
          <h2 className="section">{label} <span className="count">{list.length}</span></h2>
          {list.map((o) => <OrderCard key={o.id} o={o} />)}
        </section>
      ))}
    </div>
  );
}

// ---------------- Stock ----------------
export function Stock() {
  const { state, lang, act, toast, focus } = useApp();
  const [placed, setPlaced] = useState(false);
  if (!state) return null;
  const first = state.plan.lines.filter((l) => l.order_qty > 0 && (l.urgency === "today" || l.reasons.some((r) => r.code === "festival")));
  const later = state.plan.lines.filter((l) => l.order_qty > 0 && l.urgency === "this_week" && !first.includes(l));
  const firstCost = first.reduce((s, l) => s + l.line_cost, 0);
  const fest = state.overview.stock.festival;
  const order = () => act(() => api.restock({ scope: "urgent" })).then((r) => { if (r) { setPlaced(true); toast({ title: `${t("ordered", lang)}: ${inr(r.total)}`, body: r.placed.map((p) => p.supplier).join(", "), tone: "good" }); } });

  return (
    <div className="screen">
      <h1 className="title">{t("stock", lang)}</h1>
      <RulesFor job="stock" />
      <PhoneOrders />
      <Outlook />

      <section className="card">
        <h2 className="card-title">{t("orderFirst", lang)}</h2>
        <ul className="restock">
          {first.map((l) => (
            <li key={l.sku} className="restock-item">
              <div className="restock-top">
                <span className="restock-name">{nameOf(l, lang)}</span>
                <span className="restock-qty">{qty(l.order_qty)} {l.unit}</span>
              </div>
              <div className="cover" title={`${l.days_left} ${t("daysLeft", lang)}`}>
                <span className={`cover-bar ${l.days_left < 2 ? "low" : ""}`} style={{ width: `${Math.max(4, Math.min(100, (l.days_left / 7) * 100))}%` }} />
              </div>
              <p className="restock-why"><strong>{l.days_left} {t("daysLeft", lang)}.</strong> {l.reasons.filter((r) => r.code !== "low_cover" && r.code !== "perishable").map((r) => reasonText(r, lang, fest ? (lang === "ta-IN" ? fest.name_ta : lang === "hi-IN" ? fest.name_hi : fest.name) : undefined)).slice(0, 2).join(". ")}</p>
            </li>
          ))}
        </ul>
        <button className="btn btn-primary" onClick={order} disabled={placed || first.length === 0}>
          {placed ? <><IconCheck /> {t("ordered", lang)}</> : <>{t("orderThese", lang)}, {inr(firstCost)}</>}
        </button>
      </section>

      <section>
        <h2 className="section">{t("standingOrders", lang)}</h2>
        {state.standing.map((s) => {
          const wasteful = s.status === "active" && s.waste_per_week >= 300;
          return (
            <article key={s.id} className={`card standing ${focus?.standing_id === s.id ? "focus" : ""}`}>
              <header className="order-head">
                <div>
                  <h3 className="order-name">{nameOf(s, lang)}</h3>
                  <p className="muted">{s.supplier}, {qty(s.qty)} {s.unit} {s.cadence}</p>
                </div>
                {s.status !== "active" && <span className="chip chip-warn">{t("paused", lang)}</span>}
              </header>
              <div className="twobar">
                <div><span className="twobar-label">{s.cadence === "daily" ? "arrives a day" : "arrives a day (avg)"}</span><span className="twobar-track"><span className="twobar-fill in" style={{ width: `${Math.min(100, (s.per_day / Math.max(s.per_day, s.daily)) * 100)}%` }} /></span><span className="num">{qty(s.per_day)}</span></div>
                <div><span className="twobar-label">{t("sellsPerDay", lang)}</span><span className="twobar-track"><span className="twobar-fill out" style={{ width: `${Math.min(100, (s.daily / Math.max(s.per_day, s.daily)) * 100)}%` }} /></span><span className="num">{qty(s.daily)}</span></div>
              </div>
              {wasteful && <p className="warn-line">{s.surplus_per_week} {s.unit} {t("wasting", lang)}: {inr(s.waste_per_week)}</p>}
              <div className="btn-row">
                {s.status === "active"
                  ? <>
                      {wasteful && <button className="btn btn-primary" onClick={() => act(() => api.standing(s.id, "cut", s.suggested_qty))}>{t("cutTo", lang)} {s.suggested_qty}</button>}
                      <button className="btn btn-quiet" onClick={() => act(() => api.standing(s.id, "pause"))}>{t("pause", lang)}</button>
                    </>
                  : <button className="btn btn-quiet" onClick={() => act(() => api.standing(s.id, "resume"))}>{t("resume", lang)}</button>}
              </div>
            </article>
          );
        })}
      </section>

      {later.length > 0 && (
        <section className="card">
          <h2 className="card-title">{t("laterThisWeek", lang)}</h2>
          <ul className="lines">
            {later.map((l) => <li key={l.sku}><span>{nameOf(l, lang)} <span className="muted">{l.days_left} {t("daysLeft", lang)}</span></span><span className="num">{qty(l.order_qty)} {l.unit}</span></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------- Pay ----------------
function BillCard({ b }: { b: Bill }) {
  const { lang, act, focus, toast } = useApp();
  const on = focus?.bill_id === b.id;
  const ref = useFocusScroll(on);
  const short = b.lines.filter((l) => l.short_qty > 0);
  const paid = b.status === "paid";
  const pay = () => act(() => api.payBill(b.id)).then((r) => { if (r?.result === "paid") toast({ title: `${t("paid", lang)}: ${b.supplier} ${inr(r.amount)}`, body: r.why, tone: "good" }); if (r?.result === "refused") toast({ title: r.why }); });
  const v = b.verdict;
  return (
    <article ref={ref} className={`card bill ${on ? "focus" : ""} ${paid ? "bill-paid" : ""}`}>
      <header className="order-head">
        <div>
          <h3 className="order-name">{b.supplier}</h3>
          <p className="muted">{b.ref}, {paid ? t("paid", lang) : b.due_in <= 0 ? t("dueToday", lang) : `${t("dueIn", lang)} ${b.due_in} ${t("days", lang)}`}</p>
        </div>
        <div className="order-total">
          {b.overcharge > 0 && !paid ? <><s className="muted">{inr(b.amount)}</s> {inr(b.correct_amount)}</> : inr(paid ? b.paid_amount ?? b.amount : b.amount)}
          {!b.trusted && !paid && <span className="chip chip-warn">{t("newSupplier", lang)}</span>}
          {b.source !== "entered" && <span className="chip">{b.source === "photo" ? "From a photo" : `From ${b.source}`}</span>}
        </div>
      </header>
      {short.length > 0 ? (
        <div className="mismatch">
          <p className="mismatch-title">{t("billedNotReceived", lang)}: {inr(b.overcharge)}</p>
          {short.map((l) => <p key={l.sku} className="mismatch-line">{nameOf(l, lang)}: billed {qty(l.billed_qty)}, received {qty(l.received_qty)} {l.unit}</p>)}
        </div>
      ) : !paid && <p className="ok-line"><IconCheck /> {t("matchesDelivery", lang)}</p>}
      {b.note && !paid && <p className="fine">{b.note}</p>}
      {!paid && v && (
        <>
          <p className={`verdict verdict-${v.decision}`}>{v.decision === "ask" && <IconLock size={15} />} {v.why}</p>
          <button className={`btn ${v.decision === "allow" ? "btn-primary" : "btn-outline"}`} onClick={pay} disabled={v.decision === "refuse"}>
            {t("payAmount", lang)} {inr(b.correct_amount)}{v.decision === "ask" ? `, ${t("needsPin", lang)}` : ""}
          </button>
        </>
      )}
      {paid && <p className="ok-line"><IconCheck /> {b.paid_via}</p>}
    </article>
  );
}

export function Pay() {
  const { state, lang, act } = useApp();
  if (!state) return null;
  const c = state.cash; const offer = state.loan_offer;
  return (
    <div className="screen">
      <h1 className="title">{t("pay", lang)}</h1>
      <RulesFor job="pay" />
      <section className="card cash">
        <div className="cash-row"><span>{t("cashOnHand", lang)}</span><strong>{inr(c.cash)}</strong></div>
        <div className="cash-row"><span>{t("billsToPay", lang)}, 3 {t("days", lang)}</span><span className="num">{inr(c.bills_due_soon)}</span></div>
        <div className="cash-row"><span>{t("orderFirst", lang)}</span><span className="num">{inr(c.restock_cost)}</span></div>
        {c.shortfall > 0 && <div className="cash-row cash-short"><span>{t("shortBy", lang)}</span><strong>{inr(c.shortfall)}</strong></div>}
        {c.loan && <div className="cash-row"><span>{t("stockLoan", lang)}</span><span className="num">{inr(c.loan.amount)}, {inr(c.loan.daily_repay)}/day</span></div>}
      </section>

      {offer.eligible && (
        <section className="card loan">
          <h2 className="card-title">{t("stockLoan", lang)}: {inr(offer.amount!)}</h2>
          <p className="muted">{offer.basis} Fee {inr(offer.fee!)}, repaid at {inr(offer.daily_repay!)} a day for {offer.days} days from Paytm settlements.</p>
          <button className="btn btn-outline" onClick={() => act(() => api.loan())}><IconLock size={15} /> {t("takeLoan", lang)}, {t("needsPin", lang)}</button>
          <p className="fine">{offer.note}</p>
        </section>
      )}

      <AddBill />
      <Suppliers />

      <h2 className="section">{t("billsToPay", lang)}</h2>
      {state.bills.map((b) => <BillCard key={b.id} b={b} />)}
    </div>
  );
}

// ---------------- Collect ----------------
export function Collect() {
  const { state, lang, act, toast } = useApp();
  const [open, setOpen] = useState<number | null>(null);
  if (!state) return null;
  const total = state.dues.reduce((s, d) => s + d.amount, 0);
  const max = Math.max(1, ...state.dues.map((d) => d.amount));
  const remind = (customer?: string) => act(() => api.remind({ customer, language: lang })).then((r) => r && toast({ title: `${t("reminded", lang)}: ${r.sent.map((s) => s.customer).join(", ")}`, tone: "good" }));
  return (
    <div className="screen">
      <h1 className="title">{t("collect", lang)}</h1>
      <RulesFor job="collect" />
      <section className="card udhaar-total">
        <p className="muted">{t("udhaarOut", lang)}</p>
        <p className="big">{inr(total)}</p>
        {state.dues.length > 0 && <button className="btn btn-primary" onClick={() => remind()}>{t("remindAll", lang)}</button>}
      </section>
      {state.dues.length === 0 && <p className="empty card">{t("noDues", lang)}</p>}
      {state.dues.map((d) => (
        <article key={d.id} className="card due">
          <header className="order-head">
            <div>
              <h3 className="order-name">{d.customer}</h3>
              <p className="muted">{d.street}, {d.days} {t("daysOld", lang)}{d.reminders > 0 ? `, ${t("reminded", lang)} ×${d.reminders}` : ""}</p>
            </div>
            <div className="order-total">{inr(d.amount)}</div>
          </header>
          <div className="due-bar"><span style={{ width: `${(d.amount / max) * 100}%` }} className={d.days > 30 ? "old" : ""} /></div>
          {d.last_message && open === d.id && <p className="bubble" lang={lang.slice(0, 2)}>{d.last_message}</p>}
          <div className="btn-row">
            <button className="btn btn-outline" onClick={() => remind(d.customer).then(() => setOpen(d.id))}>{t("remind", lang)}</button>
            {d.last_message && <button className="btn btn-quiet" onClick={() => setOpen(open === d.id ? null : d.id)}>{open === d.id ? "Hide message" : "See message"}</button>}
          </div>
        </article>
      ))}
    </div>
  );
}

// ---------------- Rules ----------------
const EXAMPLES: Record<string, string[]> = {
  "en-IN": ["Pay KPN Traders up to 15,000 rupees without asking.", "Pause the bread order if more than ten loaves are left over.", "No more udhaar for anyone who owes over 2,000 rupees."],
  "ta-IN": ["KPN டிரேடர்ஸுக்கு 15,000 ரூபாய் வரை கேட்காமல் செலுத்து.", "பத்து பிரெட்டுக்கு மேல் மீதம் இருந்தால் பிரெட் ஆர்டரை நிறுத்தி வை.", "2,000 ரூபாய்க்கு மேல் கடன் உள்ளவர்களுக்கு மேலும் கடன் வேண்டாம்."],
  "hi-IN": ["KPN ट्रेडर्स को 15,000 रुपये तक बिना पूछे दे दो।", "दस से ज़्यादा ब्रेड बचे तो ब्रेड का ऑर्डर रोक दो।", "जिस पर 2,000 रुपये से ज़्यादा उधार है, उसे और उधार नहीं।"],
};

export function Rules() {
  const { state, lang, act, say } = useApp();
  if (!state) return null;
  return (
    <div className="screen">
      <h1 className="title">{t("rules", lang)}</h1>
      <p className="lead-text">{t("rulesLead", lang)}</p>
      {state.rules.map((r) => (
        <article key={r.id} className="card rule">
          <p className="rule-kind">{t(r.job as any, lang)}: {r.title}</p>
          <blockquote className="rule-spoken">“{r.spoken}”</blockquote>
          <footer className="rule-foot">
            <span className="muted"><IconLock size={14} /> {new Date(r.signed_at).toLocaleDateString(lang, { day: "numeric", month: "short" })}</span>
            <button className="link" onClick={() => act(() => api.removeRule(r.id))}>{t("remove", lang)}</button>
          </footer>
        </article>
      ))}
      <section className="card examples">
        <p className="muted">{t("sayARule", lang)}</p>
        {EXAMPLES[lang].map((x) => <button key={x} className="example" onClick={() => say(x)} lang={lang.slice(0, 2)}>“{x}”</button>)}
      </section>
    </div>
  );
}
