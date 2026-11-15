import { useApp } from "../store";
import { inr, type Screen } from "../api";
import { t, ago, type Key } from "../i18n";
import { IconChevron, IconCheck, JOB_ICON } from "../icons";
import { Outlook } from "./Outlook";
import { GrowCard } from "./Grow";

export function Home() {
  const { state, lang, go, setFocus, openPin } = useApp();
  if (!state) return <div className="skeleton" />;
  const o = state.overview;
  const fest = o.stock.festival;
  const festName = fest && (lang === "ta-IN" ? fest.name_ta : lang === "hi-IN" ? fest.name_hi : fest.name);

  // What actually needs the owner, most pressing first.
  const needs: { key: string; job: Screen; title: string; detail: string; onClick: () => void }[] = [];
  for (const p of state.pending) needs.push({ key: "p" + p.id, job: "rules", title: p.summary, detail: t("needsPin", lang), onClick: () => openPin(p) });
  const fresh = state.orders.filter((x) => x.status === "new");
  if (fresh.length) needs.push({ key: "orders", job: "sell", title: `${fresh.length} ${t(fresh.length === 1 ? "orderWaiting" : "ordersWaiting", lang)}`, detail: fresh.map((x) => x.customer).join(", "), onClick: () => go("sell") });
  const wrong = state.bills.find((b) => b.status !== "paid" && b.overcharge > 0);
  if (wrong) needs.push({ key: "bill", job: "pay", title: `${wrong.supplier}: ${t("billedNotReceived", lang)}`, detail: `${inr(wrong.overcharge)}`, onClick: () => { go("pay"); setFocus({ bill_id: wrong.id }); } });
  if (o.stock.urgent) needs.push({ key: "stock", job: "stock", title: `${o.stock.urgent} ${t("runOutSoon", lang)}`, detail: fest ? `${festName}, ${fest.in_days} ${t("days", lang)}` : o.stock.weather, onClick: () => go("stock") });
  if (o.pay.shortfall > 0) needs.push({ key: "cash", job: "pay", title: `${t("shortBy", lang)} ${inr(o.pay.shortfall)}`, detail: t("stockLoan", lang), onClick: () => go("pay") });
  const wasteful = state.standing.find((s) => s.status === "active" && s.waste_per_week >= 300);
  if (wasteful) needs.push({ key: "so", job: "stock", title: `${wasteful.name_en}: ${wasteful.surplus_per_week} ${wasteful.unit} ${t("wasting", lang)}`, detail: `${inr(wasteful.waste_per_week)}`, onClick: () => { go("stock"); setFocus({ standing_id: wasteful.id }); } });

  const jobs: { s: Screen; figure: string; label: string }[] = [
    { s: "sell", figure: String(o.sell.waiting + o.sell.packing + o.sell.ready), label: t(o.sell.waiting === 1 ? "orderWaiting" : "ordersWaiting", lang) },
    { s: "stock", figure: String(o.stock.urgent), label: t("runOutSoon", lang) },
    { s: "pay", figure: inr(o.pay.bills_due_soon), label: `${o.pay.bills_open} ${t("billsOpen", lang)}` },
    { s: "collect", figure: inr(o.collect.total), label: `${t("udhaarWith", lang)} ${o.collect.people} ${t("people", lang)}` },
  ];

  return (
    <div className="screen home">
      <section className="greet">
        <p className="greet-hello">{t("hello", lang)}, {o.shop.owner}</p>
        <h1 className="greet-shop">{o.shop.name}</h1>
        <p className="greet-meta">
          <span>{new Date(o.date + "T00:00:00").toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" })}</span>
          {fest && <span className="chip chip-festival">{festName}: {fest.in_days} {t("days", lang)}</span>}
        </p>
      </section>

      {state.briefing.done_for_you.some((d) => d.authority !== "routine") && (
        <section className="done">
          <p className="done-title">{{ "en-IN": "Done inside your rules", "ta-IN": "உங்கள் விதிகளுக்குள் செய்தவை", "hi-IN": "आपके नियमों के अंदर किया" }[lang]}</p>
          {state.briefing.done_for_you.filter((d) => d.authority !== "routine").map((d, i) => <p key={i} className="done-line"><IconCheck /> {d.what}</p>)}
        </section>
      )}

      <section className="card needs">
        <h2 className="card-title">{t("needsYou", lang)}</h2>
        {needs.length === 0 && <p className="empty">{t("allClear", lang)}</p>}
        <ul className="rows">
          {needs.slice(0, 5).map((n) => {
            const Icon = JOB_ICON[n.job];
            return (
              <li key={n.key}>
                <button className="row" onClick={n.onClick}>
                  <span className="row-icon"><Icon size={26} /></span>
                  <span className="row-main"><span className="row-title">{n.title}</span><span className="row-detail">{n.detail}</span></span>
                  <IconChevron />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <Outlook compact />

      <section className="jobs">
        {jobs.map((j) => {
          const Icon = JOB_ICON[j.s];
          return (
            <button key={j.s} className="job" onClick={() => go(j.s)}>
              <span className="job-top"><Icon size={34} /><span className="job-name">{t(j.s as Key, lang)}</span></span>
              <span className="job-figure">{j.figure}</span>
              <span className="job-label">{j.label}</span>
            </button>
          );
        })}
      </section>

      <GrowCard />

      <section className="pair">
        <button className="wide" onClick={() => go("area")}>
          <span className="wide-icon">{JOB_ICON.area({ size: 30 })}</span>
          <span className="row-main"><span className="row-title">{t("area", lang)}</span><span className="row-detail">{t("areaLead", lang)}</span></span>
          <IconChevron />
        </button>
        <button className="wide" onClick={() => go("rules")}>
          <span className="wide-icon">{JOB_ICON.rules({ size: 30 })}</span>
          <span className="row-main"><span className="row-title">{t("rules", lang)}</span><span className="row-detail">{t("rulesLead", lang)}</span></span>
          <IconChevron />
        </button>
      </section>

      <section className="card">
        <h2 className="card-title">{t("didToday", lang)}</h2>
        <ol className="feed">
          {state.activity.slice(0, 8).map((a) => (
            <li key={a.id} className={`feed-item feed-${a.job}`}>
              <span className="feed-dot" />
              <div>
                <p className="feed-text">{a.text}</p>
                {a.detail && <p className="feed-detail">{a.detail}</p>}
                <p className="feed-meta">{ago(a.at, lang)}{a.by === "rule" ? `, ${t("byRule", lang)}` : a.by === "owner" ? `, ${t("byYou", lang)}` : a.by === "customer" ? `, ${t("byCustomer", lang)}` : ""}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <p className="proto">{t("prototype", lang)}. Figures are illustrative.</p>
    </div>
  );
}
