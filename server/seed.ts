// Seeds one illustrative shop: Sri Murugan Stores, West Tambaram.
// Every figure here is made up for the demo. Nothing is real merchant data.
import { db, migrate, today, addDays, run, get, nowIso } from "./db";
import { FESTIVALS } from "./forecast";

type ItemSeed = [sku: string, en: string, ta: string, hi: string, aliases: string, cat: string, unit: string,
  price: number, cost: number, stock: number, pack: number, supplier: number, perishable: 0 | 1, daily: number];

// supplier ids: 1 KPN Traders, 2 Aavin agent, 3 Sri Balaji Agencies, 4 Modern Bakery, 5 Ganesh Snacks (new)
const ITEMS: ItemSeed[] = [
  ["rice-ponni", "Ponni rice", "பொன்னி அரிசி", "पोन्नी चावल", "arisi,rice,chawal,ponni", "staples", "kg", 62, 54, 160, 25, 1, 0, 14],
  ["rice-idli", "Idli rice", "இட்லி அரிசி", "इडली चावल", "idli arisi,idly rice", "staples", "kg", 48, 42, 70, 25, 1, 0, 6],
  ["dal-toor", "Toor dal", "துவரம் பருப்பு", "अरहर दाल", "thuvaram paruppu,tur dal,arhar", "staples", "kg", 168, 150, 38, 10, 1, 0, 4],
  ["dal-urad", "Urad dal", "உளுந்து", "उड़द दाल", "ulundhu,ulunthu,urad", "staples", "kg", 152, 136, 26, 10, 1, 0, 2.5],
  ["sugar", "Sugar", "சர்க்கரை", "चीनी", "sakkarai,cheeni,sarkarai", "staples", "kg", 46, 41, 70, 25, 1, 0, 7],
  ["jaggery", "Jaggery", "வெல்லம்", "गुड़", "vellam,gud,gur", "staples", "kg", 78, 64, 9, 10, 1, 0, 2],
  ["atta", "Wheat flour", "கோதுமை மாவு", "आटा", "godhumai maavu,atta,wheat", "staples", "kg", 52, 46, 44, 10, 1, 0, 4],
  ["rava", "Rava", "ரவை", "सूजी", "ravai,sooji,suji", "staples", "kg", 50, 43, 22, 10, 1, 0, 2],
  ["aval", "Aval (poha)", "அவல்", "पोहा", "aval,poha,flattened rice", "staples", "kg", 64, 52, 4, 5, 1, 0, 1],
  ["pori", "Pori (puffed rice)", "பொரி", "मुरमुरा", "pori,murmura,puffed rice", "festival", "kg", 90, 68, 3, 5, 1, 0, 0.6],
  ["groundnut", "Groundnut", "நிலக்கடலை", "मूंगफली", "nilakadalai,verkadalai,peanut,moongphali", "staples", "kg", 140, 118, 7, 5, 1, 0, 1.2],
  ["oil-gingelly", "Gingelly oil", "நல்லெண்ணெய்", "तिल का तेल", "nallennai,gingelly,sesame oil,til tel", "oil", "litre", 310, 276, 16, 12, 1, 0, 2],
  ["oil-sunflower", "Sunflower oil", "சூரியகாந்தி எண்ணெய்", "सूरजमुखी तेल", "sunflower,ennai,cooking oil,tel", "oil", "litre", 148, 134, 60, 12, 1, 0, 6],
  ["oil-lamp", "Lamp oil", "விளக்கு எண்ணெய்", "दीये का तेल", "vilakku ennai,deepam oil,lamp oil", "festival", "litre", 120, 92, 6, 12, 1, 0, 1],
  ["ghee", "Ghee", "நெய்", "घी", "nei,ghee", "oil", "litre", 640, 580, 9, 6, 3, 0, 0.8],
  ["milk", "Milk packet", "பால்", "दूध", "paal,milk,doodh,aavin", "dairy", "packet", 30, 27.5, 18, 12, 2, 1, 96],
  ["curd", "Curd", "தயிர்", "दही", "thayir,curd,dahi", "dairy", "cup", 35, 30, 14, 12, 2, 1, 22],
  ["eggs", "Eggs", "முட்டை", "अंडे", "muttai,egg,anda", "dairy", "piece", 7, 5.8, 420, 30, 3, 1, 70],
  ["bread", "Bread", "பிரெட்", "ब्रेड", "bread,rotti", "bakery", "loaf", 45, 37, 21, 10, 4, 1, 9],
  ["tea", "Tea powder", "டீ தூள்", "चाय पत्ती", "tea thool,chai,tea", "beverage", "250 g", 135, 118, 34, 12, 3, 0, 3],
  ["coffee", "Coffee powder", "காபி தூள்", "कॉफ़ी", "kaapi thool,coffee", "beverage", "200 g", 160, 141, 22, 12, 3, 0, 2],
  ["salt", "Salt", "உப்பு", "नमक", "uppu,namak,salt", "staples", "kg", 24, 19, 48, 25, 3, 0, 4],
  ["tamarind", "Tamarind", "புளி", "इमली", "puli,imli,tamarind", "spices", "250 g", 55, 44, 22, 10, 1, 0, 2],
  ["chilli", "Chilli powder", "மிளகாய் தூள்", "मिर्च पाउडर", "milagai thool,mirchi,chilli", "spices", "100 g", 42, 34, 36, 20, 3, 0, 3],
  ["turmeric", "Turmeric powder", "மஞ்சள் தூள்", "हल्दी", "manjal thool,haldi", "spices", "100 g", 32, 25, 20, 20, 3, 0, 1.5],
  ["mustard", "Mustard seeds", "கடுகு", "राई", "kadugu,rai,mustard", "spices", "100 g", 22, 17, 24, 20, 3, 0, 1.5],
  ["coconut", "Coconut", "தேங்காய்", "नारियल", "thengai,nariyal,coconut", "produce", "piece", 38, 30, 34, 25, 1, 1, 9],
  ["onion", "Onion", "வெங்காயம்", "प्याज", "vengayam,pyaaz,onion", "produce", "kg", 44, 36, 90, 25, 1, 1, 11],
  ["potato", "Potato", "உருளைக்கிழங்கு", "आलू", "urulaikizhangu,aloo,potato", "produce", "kg", 40, 32, 52, 25, 1, 1, 6],
  ["tomato", "Tomato", "தக்காளி", "टमाटर", "thakkali,tamatar,tomato", "produce", "kg", 36, 28, 30, 10, 1, 1, 8],
  ["soap", "Bath soap", "சோப்பு", "साबुन", "soap,sabun", "personal", "piece", 38, 32.5, 48, 24, 3, 0, 5],
  ["detergent", "Detergent powder", "சலவை தூள்", "डिटर्जेंट", "salavai thool,surf,detergent", "personal", "kg", 118, 104, 22, 12, 3, 0, 2],
  ["shampoo", "Shampoo sachet", "ஷாம்பு", "शैम्पू", "shampoo,sachet", "personal", "sachet", 2, 1.5, 420, 120, 3, 0, 40],
  ["biscuit", "Biscuits", "பிஸ்கட்", "बिस्कुट", "biscuit,biskut", "snacks", "packet", 10, 8.4, 170, 48, 3, 0, 18],
  ["mixture", "Mixture snack", "மிக்சர்", "नमकीन", "mixture,namkeen,murukku", "snacks", "packet", 30, 23, 36, 24, 5, 0, 4],
  ["camphor", "Camphor", "கற்பூரம்", "कपूर", "karpooram,kapoor,camphor", "festival", "box", 25, 18, 10, 24, 3, 0, 2],
  ["agal", "Agal vilakku (clay lamp)", "அகல் விளக்கு", "दीया", "agal vilakku,vilakku,diya,clay lamp", "festival", "piece", 6, 3.5, 40, 100, 1, 0, 3],
  ["wick", "Cotton wicks", "திரி", "बत्ती", "thiri,batti,wick", "festival", "packet", 15, 9, 12, 24, 3, 0, 1.5],
  ["matchbox", "Matchbox", "தீப்பெட்டி", "माचिस", "theepetti,machis,match", "household", "box", 2, 1.4, 140, 100, 3, 0, 12],
];

const SUPPLIERS: [number, string, string, 0 | 1, number][] = [
  [1, "KPN Traders", "rice, dal, oil, produce", 1, 1],
  [2, "Aavin milk agent", "milk, curd", 1, 0],
  [3, "Sri Balaji Agencies", "branded goods", 1, 2],
  [4, "Modern Bakery", "bread", 1, 0],
  [5, "Ganesh Snacks", "snacks", 0, 2],
];

const CUSTOMERS: [number, string, string, string, [string, number][]][] = [
  [1, "Lakshmi", "98400 11201", "Gandhi Road", [["milk", 2], ["curd", 1], ["bread", 1], ["eggs", 6]]],
  [2, "Revathi", "98400 11202", "Kakkan Street", [["rice-ponni", 5], ["dal-toor", 1], ["oil-sunflower", 1]]],
  [3, "Karthik", "98400 11203", "Mudichur Road", [["milk", 1], ["biscuit", 2], ["tea", 1]]],
  [4, "Fathima", "98400 11204", "Shanmugam Road", [["milk", 2], ["onion", 1], ["tomato", 1], ["coconut", 1]]],
  [5, "Joseph", "98400 11205", "Rajaji Road", [["eggs", 12], ["bread", 2], ["coffee", 1]]],
  [6, "Meena", "98400 11206", "Gandhi Road", [["sugar", 1], ["tea", 1], ["milk", 1]]],
  [7, "Babu", "98400 11207", "Kakkan Street", [["rice-ponni", 2], ["soap", 2]]],
  [8, "Saraswathi", "98400 11208", "Velachery Road", [["jaggery", 1], ["pori", 1], ["agal", 12], ["oil-lamp", 1]]],
];

// Deterministic pseudo-random so the demo looks the same after every reset.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function seed(reset = false) {
  migrate();
  if (reset) {
    for (const t of ["calls", "outbox", "settings", "receipts", "activity", "pending", "loans", "rules", "due_payments", "dues", "bills", "supplier_orders",
      "standing_orders", "orders", "customers", "sales", "items", "suppliers", "shop"]) db.exec(`DELETE FROM ${t}`);
  } else if (get("SELECT id FROM shop WHERE id = 1")) return;

  const t = today();
  const tx = db.transaction(() => {
    run("INSERT INTO shop (id,name,owner,locality,lat,lon,cash,language) VALUES (1,?,?,?,?,?,?,?)",
      "Sri Murugan Stores", "Selvam", "West Tambaram", 12.928, 80.1086, 21500, "en-IN");

    for (const s of SUPPLIERS) run("INSERT INTO suppliers (id,name,supplies,trusted,lead_days) VALUES (?,?,?,?,?)", ...s);

    const skuId = new Map<string, number>();
    ITEMS.forEach((it, i) => {
      const [sku, en, ta, hi, aliases, cat, unit, price, cost, stock, pack, sup, perish] = it;
      run(`INSERT INTO items (id,sku,name_en,name_ta,name_hi,aliases,category,unit,price,cost,stock,pack,supplier_id,perishable)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, i + 1, sku, en, ta, hi, aliases, cat, unit, price, cost, stock, pack, sup, perish);
      skuId.set(sku, i + 1);
    });

    // 56 days of item-level sales: weekly rhythm, mild noise, and a Deepavali bump
    // so the forecast has a recent festival in its history.
    const rand = rng(20261114);
    const deepavali = FESTIVALS.find((f) => f.key === "deepavali")!.day;
    for (let d = 56; d >= 1; d--) {
      const day = addDays(t, -d);
      const dow = new Date(day + "T00:00:00Z").getUTCDay();
      const weekend = dow === 0 ? 1.25 : dow === 6 ? 1.12 : 1;
      const toFest = Math.abs((Date.parse(deepavali) - Date.parse(day)) / 86400000);
      for (const it of ITEMS) {
        const base = it[13];
        let f = weekend * (0.82 + rand() * 0.36);
        if (toFest <= 4 && ["sugar", "jaggery", "ghee", "oil-sunflower", "atta", "rava", "groundnut", "agal", "oil-lamp"].includes(it[0])) f *= 2.1;
        if (it[0] === "bread" && d <= 14) f *= 0.62; // bread has been slowing for two weeks
        const qty = Math.max(0, Math.round(base * f * 10) / 10);
        run("INSERT INTO sales (day,item_id,qty) VALUES (?,?,?)", day, skuId.get(it[0])!, qty);
      }
    }

    for (const [id, name, phone, street, usual] of CUSTOMERS)
      run("INSERT INTO customers (id,name,phone,street,usual) VALUES (?,?,?,?,?)", id, name, phone, street,
        JSON.stringify(usual.map(([sku, qty]) => ({ sku, qty }))));

    // Standing orders with suppliers.
    run("INSERT INTO standing_orders (supplier_id,item_id,qty,cadence,note) VALUES (2,?,96,'daily','Morning drop, 6 am')", skuId.get("milk")!);
    run("INSERT INTO standing_orders (supplier_id,item_id,qty,cadence,note) VALUES (2,?,24,'daily','')", skuId.get("curd")!);
    run("INSERT INTO standing_orders (supplier_id,item_id,qty,cadence,note) VALUES (4,?,70,'weekly','Split over Mon, Wed, Fri')", skuId.get("bread")!);

    // Supplier bills. The Balaji bill charges for more soap than was received.
    const bill = (sup: number, ref: string, lines: any[], due: string) => {
      const amount = Math.round(lines.reduce((s, l) => s + l.billed_qty * l.rate, 0));
      run("INSERT INTO bills (supplier_id,ref,lines,amount,due_day) VALUES (?,?,?,?,?)", sup, ref, JSON.stringify(lines), amount, due);
    };
    bill(2, "AAV-1114", [
      { sku: "milk", billed_qty: 96, received_qty: 96, rate: 27.5 },
      { sku: "curd", billed_qty: 2, received_qty: 2, rate: 30 },
    ], t);
    bill(1, "KPN-2207", [
      { sku: "rice-ponni", billed_qty: 150, received_qty: 150, rate: 54 },
      { sku: "dal-toor", billed_qty: 20, received_qty: 20, rate: 150 },
      { sku: "oil-sunflower", billed_qty: 24, received_qty: 24, rate: 134 },
    ], addDays(t, 1));
    bill(3, "SBA-0931", [
      { sku: "soap", billed_qty: 48, received_qty: 36, rate: 32.5 },
      { sku: "tea", billed_qty: 24, received_qty: 24, rate: 118 },
      { sku: "biscuit", billed_qty: 96, received_qty: 96, rate: 8.4 },
      { sku: "detergent", billed_qty: 12, received_qty: 12, rate: 104 },
    ], addDays(t, 2));
    bill(5, "GS-0042", [{ sku: "mixture", billed_qty: 72, received_qty: 72, rate: 23 }], addDays(t, 3));

    // A KPN delivery counted in yesterday evening, with no bill entered yet. The
    // sample bill photo (demo/bill-kpn.png) charges for 30 kg of jaggery; 25 arrived.
    run("INSERT INTO receipts (supplier_id,day,lines) VALUES (1,?,?)", addDays(t, -1),
      JSON.stringify([{ sku: "sugar", qty: 50 }, { sku: "jaggery", qty: 25 }, { sku: "groundnut", qty: 20 }]));

    // Udhaar: Rs 12,000 across six regulars.
    const due = (cid: number, amt: number, daysAgo: number) =>
      run("INSERT INTO dues (customer_id,amount,since_day) VALUES (?,?,?)", cid, amt, addDays(t, -daysAgo));
    due(2, 3200, 46); due(3, 2400, 31); due(5, 2100, 24); due(4, 1800, 19); due(6, 1500, 12); due(7, 1000, 8);

    // Rules the owner has already spoken and signed.
    const rule = (kind: string, params: any, spoken: string, daysAgo: number) =>
      run("INSERT INTO rules (kind,params,spoken,signed_at) VALUES (?,?,?,?)", kind, JSON.stringify(params), spoken,
        new Date(Date.now() - daysAgo * 86400000).toISOString());
    rule("pay_limit", { supplier_id: 2, max_amount: 3000 }, "Pay the milk supplier up to ₹3,000 without asking. Above that, ask me.", 21);
    rule("new_supplier", {}, "Never pay a new supplier without me.", 21);
    rule("order_limit", { supplier_id: null, max_amount: 8000 }, "Phone my suppliers and order up to ₹8,000 a call without asking. Above that, ask me.", 14);

    // Two orders already waiting this morning.
    const order = (cid: number, lines: [string, number][], status: string, minsAgo: number, said: string) => {
      const full = lines.map(([sku, qty]) => {
        const it = get("SELECT name_en,price,unit FROM items WHERE sku = ?", sku)!;
        return { sku, qty, name: it.name_en, unit: it.unit, price: it.price };
      });
      const total = Math.round(full.reduce((s, l) => s + l.qty * l.price, 0));
      run("INSERT INTO orders (customer_id,lines,total,status,said,created_at) VALUES (?,?,?,?,?,?)", cid, JSON.stringify(full), total,
        status, said, new Date(Date.now() - minsAgo * 60000).toISOString());
    };
    order(4, [["milk", 2], ["onion", 1], ["tomato", 1], ["coconut", 1]], "ready", 42, "வழக்கம் போல");
    order(5, [["eggs", 12], ["bread", 2], ["coffee", 1]], "new", 6, "The usual, I will come by at eight.");

    run("INSERT INTO activity (at,job,text,detail,by) VALUES (?,?,?,?,?)", new Date(Date.now() - 42 * 60000).toISOString(),
      "sell", "Took Fathima's usual order", "4 items, ₹178, pick-up", "thunai");
    run("INSERT INTO activity (at,job,text,detail,by) VALUES (?,?,?,?,?)", new Date(Date.now() - 6 * 60000).toISOString(),
      "sell", "Took Joseph's order by voice", "3 items, ₹334, pick-up at 8", "thunai");
  });
  tx();
  console.log(`[seed] shop ready for ${t}`);
}

if (import.meta.main) {
  seed(process.argv.includes("--reset"));
  console.log("[seed] done at", nowIso());
}
