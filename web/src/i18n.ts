// Interface text in English, Tamil and Hindi. The Tamil and Hindi lines were
// written for this prototype and need a native speaker's review before launch.
import type { Lang } from "./api";

type Entry = [en: string, ta: string, hi: string];

const S = {
  hello: ["Vanakkam", "வணக்கம்", "नमस्ते"],
  tapToTalk: ["Tap and speak. Ask what needs you today.", "தொட்டுப் பேசுங்கள். இன்று என்ன வேலை என்று கேளுங்கள்.", "दबाकर बोलिए। पूछिए आज क्या ज़रूरी है।"],
  listening: ["Listening", "கேட்கிறேன்", "सुन रहा हूँ"],
  hearing: ["Go on", "சொல்லுங்கள்", "बोलिए"],
  thinking: ["Working on it", "பார்க்கிறேன்", "देख रहा हूँ"],
  speaking: ["Speaking", "சொல்கிறேன்", "बता रहा हूँ"],
  typeInstead: ["Type instead", "தட்டச்சு செய்ய", "लिखकर बताएँ"],
  typePlaceholder: ["Type what you would say", "சொல்ல நினைப்பதை எழுதுங்கள்", "जो कहना है लिखिए"],
  send: ["Send", "அனுப்பு", "भेजें"],
  home: ["Home", "முகப்பு", "होम"],
  sell: ["Sell", "விற்பனை", "बिक्री"],
  stock: ["Stock", "சரக்கு", "स्टॉक"],
  pay: ["Pay", "செலுத்து", "भुगतान"],
  collect: ["Collect", "வசூல்", "वसूली"],
  rules: ["Your rules", "உங்கள் விதிகள்", "आपके नियम"],
  area: ["Area view", "பகுதி பார்வை", "इलाक़ा"],
  needsYou: ["Needs you", "உங்கள் கவனத்திற்கு", "आपके लिए"],
  allClear: ["Nothing is waiting for you.", "உங்களுக்காக எதுவும் காத்திருக்கவில்லை.", "आपके लिए कुछ बाकी नहीं है।"],
  didToday: ["What Saajhedar did", "சாஜேதார் செய்தவை", "साझेदार ने क्या किया"],
  ordersWaiting: ["orders waiting", "ஆர்டர்கள் காத்திருக்கின்றன", "ऑर्डर बाकी"],
  orderWaiting: ["order waiting", "ஆர்டர் காத்திருக்கிறது", "ऑर्डर बाकी"],
  runOutSoon: ["items run out within two days", "பொருட்கள் இரண்டு நாளில் தீரும்", "चीज़ें दो दिन में ख़त्म"],
  billsOpen: ["bills to pay", "பில்கள் நிலுவை", "बिल बाकी"],
  udhaarWith: ["udhaar with", "கடன் நிலுவை,", "उधार,"],
  people: ["people", "பேர்", "लोग"],
  cashOnHand: ["Cash on hand", "கையிருப்பு", "हाथ में पैसा"],
  // Sell
  newOrders: ["New", "புதியவை", "नए"],
  packing: ["Packing", "பேக் செய்கிறோம்", "पैक हो रहा"],
  ready: ["Ready for pick-up", "எடுக்கத் தயார்", "तैयार"],
  startPacking: ["Start packing", "பேக் செய்யத் தொடங்கு", "पैक शुरू करें"],
  bagReady: ["Bag is ready", "பை தயார்", "थैला तैयार"],
  handedOver: ["Handed over", "கொடுத்துவிட்டேன்", "दे दिया"],
  pickup: ["Pick-up", "நேரில் எடுப்பு", "ख़ुद लेंगे"],
  parcel: ["Bike parcel", "பைக் பார்சல்", "बाइक पार्सल"],
  noOrders: ["No orders yet. They appear here when a regular calls in.", "இன்னும் ஆர்டர் இல்லை. வாடிக்கையாளர் அழைத்ததும் இங்கே வரும்.", "अभी कोई ऑर्डर नहीं। ग्राहक के बोलते ही यहाँ आएगा।"],
  said: ["said", "சொன்னது", "कहा"],
  // Stock
  orderFirst: ["Order first", "முதலில் வாங்க வேண்டியவை", "पहले मँगवाएँ"],
  laterThisWeek: ["Later this week", "இந்த வாரம்", "इस हफ़्ते"],
  daysLeft: ["days left", "நாள் இருப்பு", "दिन का स्टॉक"],
  orderThese: ["Order these", "இவற்றை ஆர்டர் செய்", "ये मँगवाएँ"],
  standingOrders: ["Standing orders", "நிலையான ஆர்டர்கள்", "नियमित ऑर्डर"],
  sellsPerDay: ["sells a day", "ஒரு நாள் விற்பனை", "रोज़ की बिक्री"],
  wasting: ["going unsold each week", "வாரம் விற்காமல் போகிறது", "हर हफ़्ते बिना बिके"],
  pause: ["Pause", "நிறுத்தி வை", "रोकें"],
  resume: ["Resume", "மீண்டும் தொடங்கு", "फिर शुरू"],
  cutTo: ["Cut to", "குறை:", "घटाएँ:"],
  cancel: ["Cancel", "ரத்து செய்", "रद्द करें"],
  paused: ["Paused", "நிறுத்தி வைக்கப்பட்டது", "रुका हुआ"],
  ordered: ["Ordered", "ஆர்டர் செய்யப்பட்டது", "ऑर्डर हो गया"],
  // Pay
  billsToPay: ["Bills", "பில்கள்", "बिल"],
  matchesDelivery: ["Matches the delivery", "டெலிவரியுடன் பொருந்துகிறது", "डिलीवरी से मेल खाता है"],
  billedNotReceived: ["Billed but not received", "பில் போட்டது, வரவில்லை", "बिल में है, माल नहीं आया"],
  payAmount: ["Pay", "செலுத்து", "भुगतान करें"],
  insideLimit: ["Inside your limit", "உங்கள் வரம்புக்குள்", "आपकी सीमा के अंदर"],
  needsPin: ["Needs your PIN", "உங்கள் PIN தேவை", "आपका PIN चाहिए"],
  cashShort: ["Cash does not cover this", "கையிருப்பு போதாது", "पैसा कम पड़ रहा है"],
  paid: ["Paid", "செலுத்தப்பட்டது", "भुगतान हो गया"],
  dueToday: ["Due today", "இன்று செலுத்த வேண்டும்", "आज देना है"],
  dueIn: ["Due in", "செலுத்த வேண்டியது:", "देना है:"],
  days: ["days", "நாள்", "दिन"],
  newSupplier: ["New supplier", "புதிய சப்ளையர்", "नया सप्लायर"],
  stockLoan: ["Stock loan", "சரக்குக் கடன்", "स्टॉक लोन"],
  shortBy: ["This week is short by", "இந்த வாரம் பற்றாக்குறை", "इस हफ़्ते कमी"],
  takeLoan: ["Take the loan", "கடன் பெறு", "लोन लें"],
  // Collect
  udhaarOut: ["Udhaar outstanding", "நிலுவையில் உள்ள கடன்", "बाकी उधार"],
  remindAll: ["Remind everyone politely", "எல்லோருக்கும் நினைவூட்டு", "सबको विनम्र याद दिलाएँ"],
  remind: ["Remind", "நினைவூட்டு", "याद दिलाएँ"],
  reminded: ["Reminded", "நினைவூட்டப்பட்டது", "याद दिलाया"],
  daysOld: ["days", "நாட்கள்", "दिन"],
  noDues: ["Nobody owes the shop anything.", "யாரும் கடன் வைக்கவில்லை.", "किसी का उधार बाकी नहीं।"],
  // Rules
  rulesLead: ["Spoken by you, signed with your PIN. Saajhedar cannot change them.", "நீங்கள் சொன்னவை, உங்கள் PIN-ஆல் உறுதி செய்யப்பட்டவை. சாஜேதாரால் மாற்ற முடியாது.", "आपने कहे, आपके PIN से पक्के। साझेदार इन्हें बदल नहीं सकता।"],
  sayARule: ["Say a rule to add one. For example:", "புதிய விதி சேர்க்க சொல்லுங்கள். உதாரணம்:", "नया नियम बोलकर जोड़ें। जैसे:"],
  remove: ["Remove", "நீக்கு", "हटाएँ"],
  // PIN
  enterPin: ["Enter your PIN to approve", "அனுமதிக்க உங்கள் PIN-ஐ உள்ளிடுங்கள்", "मंज़ूरी के लिए PIN डालें"],
  decline: ["Not now", "இப்போது வேண்டாம்", "अभी नहीं"],
  wrongPin: ["Wrong PIN. Try again.", "தவறான PIN. மீண்டும் முயலுங்கள்.", "PIN ग़लत है। फिर कोशिश करें।"],
  // Area
  areaLead: ["What an area has, street by street, and what it is thin on.", "ஒரு பகுதியில் என்ன இருக்கிறது, எது குறைவு.", "इलाक़े में क्या है और क्या कम है।"],
  searchArea: ["Search a locality or street in Chennai", "சென்னையில் பகுதி அல்லது தெருவைத் தேடுங்கள்", "चेन्नई में इलाक़ा या सड़क खोजें"],
  thinHere: ["Thin here", "இங்கே குறைவு", "यहाँ कम"],
  crowdedHere: ["Already crowded", "ஏற்கனவே நிறைய", "पहले से ज़्यादा"],
  byStreet: ["By street", "தெரு வாரியாக", "सड़क के हिसाब से"],
  whatsHere: ["What is here", "இங்கே என்ன உள்ளது", "यहाँ क्या है"],
  bringsPeople: ["What brings people here", "மக்களை இங்கே கொண்டு வருவது", "लोग यहाँ क्यों आते हैं"],
  listed: ["listed businesses", "பட்டியலில் உள்ள கடைகள்", "दर्ज दुकानें"],
  within: ["within", "சுற்றளவில்", "के दायरे में"],
  here: ["here", "இங்கே", "यहाँ"],
  similarAreas: ["similar areas", "ஒத்த பகுதிகள்", "मिलते-जुलते इलाक़े"],
  nearestIs: ["nearest is", "அருகிலுள்ளது", "सबसे पास"],
  away: ["away", "தொலைவில்", "दूर"],
  noGaps: ["Nothing stands out as missing for an area this size.", "இந்த அளவு பகுதிக்குக் குறைவாக எதுவும் தெரியவில்லை.", "इस आकार के इलाक़े में कुछ ख़ास कमी नहीं दिखती।"],
  myShop: ["My shop", "என் கடை", "मेरी दुकान"],
  // misc
  prototype: ["Hackathon prototype", "ஹேக்கத்தான் மாதிரி", "हैकाथॉन प्रोटोटाइप"],
  language: ["Language", "மொழி", "भाषा"],
  resetDemo: ["Reset the demo", "டெமோவை மீட்டமை", "डेमो रीसेट करें"],
  customerView: ["Open the customer's phone", "வாடிக்கையாளர் திரையைத் திற", "ग्राहक का फ़ोन खोलें"],
  byRule: ["by your rule", "உங்கள் விதிப்படி", "आपके नियम से"],
  byYou: ["by you", "நீங்கள்", "आपने"],
  byCustomer: ["by the customer", "வாடிக்கையாளர்", "ग्राहक ने"],
  newOrderFrom: ["New order from", "புதிய ஆர்டர்:", "नया ऑर्डर:"],
} satisfies Record<string, Entry>;

export type Key = keyof typeof S;
const IDX: Record<Lang, number> = { "en-IN": 0, "ta-IN": 1, "hi-IN": 2 };
export const t = (key: Key, lang: Lang) => S[key][IDX[lang]] || S[key][0];
export const nameOf = (o: { name_en?: string; name?: string; name_ta?: string; name_hi?: string }, lang: Lang) =>
  (lang === "ta-IN" ? o.name_ta : lang === "hi-IN" ? o.name_hi : undefined) || o.name_en || o.name || "";
export const LANG_NAMES: Record<Lang, string> = { "ta-IN": "தமிழ்", "hi-IN": "हिन्दी", "en-IN": "English" };

// What the Soundbox says when an order arrives.
export const orderAnnouncement = (customer: string, total: number, lang: Lang) =>
  lang === "ta-IN" ? `புதிய ஆர்டர். ${customer}, ${total} ரூபாய்.` : lang === "hi-IN" ? `नया ऑर्डर। ${customer}, ${total} रुपये।` : `New order. ${customer}, ${total} rupees.`;

export function ago(iso: string, lang: Lang) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (m < 1) return lang === "ta-IN" ? "இப்போது" : lang === "hi-IN" ? "अभी" : "just now";
  if (m < 60) return lang === "ta-IN" ? `${m} நிமி முன்` : lang === "hi-IN" ? `${m} मिनट पहले` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return lang === "ta-IN" ? `${h} மணி முன்` : lang === "hi-IN" ? `${h} घंटे पहले` : `${h} h ago`;
  const d = Math.round(h / 24);
  return lang === "ta-IN" ? `${d} நாள் முன்` : lang === "hi-IN" ? `${d} दिन पहले` : `${d} d ago`;
}

// Why an item is on the restock list, in the owner's language.
export function reasonText(r: { code: string; text: string; value?: number; days?: number }, lang: Lang, festival?: string) {
  if (lang === "en-IN" || r.value == null) return r.text;
  const ta = lang === "ta-IN";
  switch (r.code) {
    case "trend_up": return ta ? `இரண்டு வாரத்திற்கு முன்பை விட ${r.value}% வேகமாக விற்கிறது` : `दो हफ़्ते पहले से ${r.value}% तेज़ बिक रहा है`;
    case "trend_down": return ta ? `இரண்டு வாரத்திற்கு முன்பை விட ${r.value}% மெதுவாக விற்கிறது` : `दो हफ़्ते पहले से ${r.value}% धीमा बिक रहा है`;
    case "festival": return ta ? `${festival ?? "பண்டிகை"} ${r.days} நாட்களில்: அப்போது சுமார் ${r.value} மடங்கு விற்கும்` : `${festival ?? "त्योहार"} ${r.days} दिन में: तब लगभग ${r.value} गुना बिकता है`;
    case "weather": return ta ? `வானிலை காரணமாக சுமார் ${r.value}% அதிகம் விற்கும்` : `मौसम की वजह से लगभग ${r.value}% ज़्यादा बिकेगा`;
    default: return r.text;
  }
}
