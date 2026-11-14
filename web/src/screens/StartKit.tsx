// What a new shop would start with: the four merchant products, and where a
// loan fits against the money the person said they have. Nothing is ordered.
import type { ReactNode } from "react";
import type { FitKind } from "../api";
import { lakh } from "../plan";

const I = (d: ReactNode) => <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const ICON: Record<string, ReactNode> = {
  qr: I(<><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2M20 14v6h-4M14 20v-2" /></>),
  soundbox: I(<><path d="M7 4h10l2 16H5L7 4Z" /><circle cx="12" cy="13" r="3" /><path d="M10 7.5h4" /></>),
  card: I(<><rect x="6" y="3" width="12" height="18" rx="2" /><rect x="9" y="6" width="6" height="4" rx="1" /><path d="M9 14h.01M12 14h.01M15 14h.01M9 17h.01M12 17h.01M15 17h.01" /></>),
  loan: I(<><circle cx="12" cy="12" r="9" /><path d="M9 8h6M9 11h6M9 11c4 0 4 3 1 3l4 4" /></>),
};

export function StartKit({ chosen, budget, kit, setKit, L }: { chosen: FitKind | null; budget: number; kit: string[]; setKit: (k: string[]) => void; L: (en: string, ta: string, hi: string) => string }) {
  const low = chosen?.setup_lakh ? chosen.setup_lakh[0] * 100000 : null;
  const short = low != null && low > budget ? low - budget : 0;
  const items = [
    { key: "qr", name: L("All-in-One QR", "ஆல்-இன்-ஒன் QR", "ऑल-इन-वन QR"), why: L("Take payments from the first sale.", "முதல் விற்பனையிலிருந்தே பணம் பெறுங்கள்.", "पहली बिक्री से भुगतान लें।") },
    { key: "soundbox", name: "Soundbox", why: L("Hear each payment land, hands full or not.", "ஒவ்வொரு பணமும் வந்ததைக் கேளுங்கள்.", "हर भुगतान की आवाज़ सुनें।") },
    { key: "card", name: L("Card machine", "கார்டு மெஷின்", "कार्ड मशीन"), why: L("For bigger bills paid by card.", "கார்டில் கட்டும் பெரிய பில்களுக்கு.", "कार्ड से बड़े बिल के लिए।") },
    { key: "loan", name: L("Merchant loan", "வணிகக் கடன்", "मर्चेंट लोन"), why: short ? `${L("About", "சுமார்", "लगभग")} ${lakh(short)} ${L("short of the rough low end to open. This is the product for that gap.", "குறைவு. அந்த இடைவெளிக்கானது இது.", "कम है। उस कमी के लिए यही है।")}`
      : L("Your money covers the rough low end. A loan would be for first stock.", "உங்கள் பணம் தொடங்கப் போதும். கடன் முதல் சரக்குக்கு.", "आपका पैसा शुरुआत के लिए काफ़ी है। लोन पहले माल के लिए।") },
  ];
  const flip = (k: string) => setKit(kit.includes(k) ? kit.filter((x) => x !== k) : [...kit, k]);
  return (
    <section className="card">
      <h2 className="card-title">{L("What you would start with", "தொடங்கத் தேவையானவை", "शुरुआत में क्या चाहिए")}</h2>
      <div className="kit">
        {items.map((it) => (
          <button key={it.key} className={`kit-item ${kit.includes(it.key) ? "on" : ""}`} onClick={() => flip(it.key)} aria-pressed={kit.includes(it.key)}>
            {ICON[it.key]}<span className="row-title">{it.name}</span><span className="row-detail">{it.why}</span>
          </button>
        ))}
      </div>
      <p className="fine">Paytm's merchant products, named for illustration. Nothing is ordered here, and whether a loan is offered is decided by Paytm's lending partners.</p>
    </section>
  );
}
