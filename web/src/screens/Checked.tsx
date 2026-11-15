// How the area answer was checked, shown as a flow: the peers picked, the peers
// thrown out, then four attempts to explain the number away. All of it is plain
// code on the server (server/area.ts); nothing here is written by a model.
import type { Fit } from "../api";

type T = (en: string, ta: string, hi: string) => string;
const Tick = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const Bang = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v9M12 18.5v.5" /></svg>;
const low = (s: string) => s.toLowerCase();

export function Checked({ fit, kind, L, onMove }: { fit: Fit; kind: string; L: T; onMove: (lat: number, lon: number, label: string) => void }) {
  const c = fit.checks, pr = fit.peer_review;
  if (!c || !pr) return null;
  const claim = c.claim === "thin" ? L("short", "குறைவு", "कम") : c.claim === "crowded" ? L("crowded", "நெரிசல்", "भीड़") : L("average", "சராசரி", "औसत");
  const passed = [c.coverage.ok, c.outside.ok, c.substitutes.ok, c.citywide.ok].filter(Boolean).length;
  const head = c.strength === "direction" ? L("A direction, not a number", "ஒரு திசை மட்டும், எண் அல்ல", "दिशा है, पक्का आँकड़ा नहीं")
    : c.strength === "fair" ? L("Mostly holds up", "பெரும்பாலும் சரி", "ज़्यादातर सही")
    : c.strength === "firm" ? L("Holds up", "உறுதியாக உள்ளது", "पक्का है") : L("Nothing unusual", "வழக்கத்துக்கு மாறாக ஏதும் இல்லை", "कुछ अलग नहीं");
  const drop = pr.dropped.slice(0, 3);
  const subs = c.substitutes.kinds;
  const rows: { ok: boolean; title: string; badge: string; note?: string }[] = [
    { ok: true, title: L("Areas of the same size", "அதே அளவுள்ள பகுதிகள்", "उतने ही बड़े इलाके"), badge: String(pr.picked),
      note: L("Picked by how many businesses are listed nearby.", "அருகில் உள்ள வணிகங்களின் எண்ணிக்கையால் தேர்ந்தது.", "आसपास के कारोबार की गिनती से चुने।") },
    { ok: true, title: pr.dropped.length ? L(`Dropped ${pr.dropped.length} unlike this one`, `ஒத்துப்போகாத ${pr.dropped.length} நீக்கப்பட்டன`, `${pr.dropped.length} अलग किस्म के हटाए`) : L("All of them resemble this one", "அனைத்தும் ஒத்துள்ளன", "सभी मिलते-जुलते हैं"),
      badge: L(`${pr.kept} kept`, `${pr.kept} வைத்தது`, `${pr.kept} रखे`),
      note: drop.length ? L(`${drop.map((d) => d.name).join(", ")}: more ${low(drop[0].mostly.slice(0, 2).join(" and ")) || "of other things"} there. Here it is more ${low(pr.here_mostly.slice(0, 2).join(" and "))}.`,
        `${drop.map((d) => d.name).join(", ")}: வேறு வகை வணிகக் கலவை.`, `${drop.map((d) => d.name).join(", ")}: कारोबार का मेल अलग है।`)
        + (c.moved.changed ? L(` The usual number moved from ${c.moved.from} to ${c.moved.to}.`, ` வழக்கமான எண் ${c.moved.from}-இலிருந்து ${c.moved.to} ஆனது.`, ` आम गिनती ${c.moved.from} से ${c.moved.to} हुई।`) : "") : undefined },
    { ok: c.coverage.ok, title: L("Enough data here?", "இங்கே போதுமான தரவு உள்ளதா?", "यहाँ काफ़ी डेटा है?"), badge: L(`${c.coverage.listed} listed`, `${c.coverage.listed} பதிவு`, `${c.coverage.listed} दर्ज`),
      note: c.coverage.ok ? undefined : L("Few businesses are listed here, so every count is shaky.", "இங்கே பதிவுகள் குறைவு; எண்கள் உறுதியற்றவை.", "यहाँ कम कारोबार दर्ज हैं, गिनती कच्ची है।") },
    { ok: c.outside.ok, title: L("Different just outside?", "சற்று வெளியே வேறுபடுகிறதா?", "ज़रा बाहर अलग है?"), badge: L(`${c.outside.count} in the next ${c.outside.within_m} m`, `மேலும் ${c.outside.within_m} மீ-க்குள் ${c.outside.count}`, `${c.outside.within_m} मी आगे ${c.outside.count}`),
      note: c.outside.ok ? undefined : c.claim === "thin" ? L("There are some just past the circle, so the gap is smaller than it looks.", "வட்டத்துக்கு சற்று வெளியே சில உள்ளன.", "घेरे के ठीक बाहर कुछ हैं, कमी उतनी नहीं।") : L("It thins out just past the circle.", "வட்டத்துக்கு வெளியே குறைகிறது.", "घेरे के बाहर कम हो जाती हैं।") },
    { ok: c.substitutes.ok, title: L("Something else filling the need?", "வேறு கடைகள் தேவையை நிரப்புகின்றனவா?", "कोई और दुकान ज़रूरत पूरी कर रही?"),
      badge: subs.length ? subs.map((s) => `${s.here} ${low(L(s.label, s.ta, s.hi))}`).join(", ") : L("none close", "இல்லை", "कोई नहीं"),
      note: c.substitutes.ok ? undefined : c.claim === "thin" ? L("Nearby kinds of shop are plentiful and may already serve this.", "அருகிலுள்ள மற்ற வகைக் கடைகள் தேவையை நிரப்பலாம்.", "पास की दूसरी दुकानें यह ज़रूरत पूरी कर सकती हैं।") : L("Nearby kinds of shop are scarce, so demand may spill over.", "மற்ற வகைக் கடைகள் குறைவு.", "पास की दूसरी दुकानें कम हैं।") },
    { ok: c.citywide.ok, title: L("Only here, or all over the city?", "இங்கே மட்டுமா, நகரம் முழுவதுமா?", "सिर्फ़ यहाँ, या पूरे शहर में?"),
      badge: c.claim === "typical" ? L("typical", "வழக்கம்", "आम") : L(`${c.citywide.same_pct}% of areas`, `${c.citywide.same_pct}% பகுதிகள்`, `${c.citywide.same_pct}% इलाके`),
      note: c.claim === "typical" ? undefined : c.citywide.ok ? L(`Few areas are this ${claim}, so it is about this place.`, `சில பகுதிகளில் மட்டுமே இப்படி; இது இந்த இடத்தின் நிலை.`, `कम इलाके ऐसे हैं, यानी बात इसी जगह की है।`)
        : L(`Many areas look this ${claim}, so the listings may simply be incomplete.`, `பல பகுதிகளில் இப்படியே; தரவு முழுமையற்றதாக இருக்கலாம்.`, `कई इलाके ऐसे दिखते हैं, डेटा अधूरा हो सकता है।`) },
  ];
  return (
    <section className="card chk">
      <div className="chk-head"><h2 className="card-title">{L("How this was checked", "இது எப்படிச் சரிபார்க்கப்பட்டது", "यह कैसे जाँचा गया")}</h2>
        <span className={`chk-verdict chk-${c.strength}`}>{head}{c.claim !== "typical" && `, ${passed}/4`}</span></div>
      {c.strength === "direction" && <p className="chk-lead">{L("The evidence is thin here. Use this to decide where to look, then count the shops on foot.", "இங்கே சான்று குறைவு. எங்கே பார்க்க வேண்டும் என்பதற்கு மட்டும் பயன்படுத்துங்கள்; கடைகளை நேரில் எண்ணுங்கள்.", "यहाँ सबूत कमज़ोर है। इसे सिर्फ़ दिशा मानें, दुकानें खुद गिनें।")}</p>}
      <ol className="chk-flow">
        {rows.map((r, i) => (
          <li key={i} className={r.ok ? "ok" : "warn"}>
            <span className="chk-dot">{r.ok ? <Tick /> : <Bang />}</span>
            <span className="chk-main"><span className="chk-title">{r.title}</span>{r.note && <span className="chk-note">{r.note}</span>}</span>
            <span className="chk-badge">{r.badge}</span>
          </li>
        ))}
      </ol>
      {(c.what_if.length > 0 || c.more) && <div className="chk-if">
        <span className="chk-if-label">{L("What if", "இப்படி இருந்தால்", "अगर ऐसा हो")}</span>
        {c.what_if.map((w) => (
          <button key={w.dir} className="chk-chip" onClick={() => onMove(w.lat, w.lon, w.toward)}>
            {L(`600 m ${w.dir}, toward ${w.toward}`, `600 மீ ${w.toward} நோக்கி`, `600 मी ${w.toward} की ओर`)}<b>{L(`${w.here} there, ${w.usual} usual`, `அங்கே ${w.here}, வழக்கம் ${w.usual}`, `वहाँ ${w.here}, आम ${w.usual}`)}</b>
          </button>))}
        {c.more && <span className="chk-chip still">{L(`With ₹${c.more.short_lakh} lakh more`, `மேலும் ₹${c.more.short_lakh} லட்சம் இருந்தால்`, `₹${c.more.short_lakh} लाख और हों तो`)}<b>{L("the money covers it", "பணம் போதும்", "पैसा काफ़ी")}</b></span>}
      </div>}
      <p className="fine">{L(`Checked by plain code on open map listings, for ${low(kind)}. Tap a "what if" to run it again there.`, `திறந்த வரைபடத் தரவில் சாதாரண நிரலால் சரிபார்க்கப்பட்டது.`, `खुले नक्शे के डेटा पर सीधे कोड से जाँचा गया।`)}</p>
    </section>
  );
}
