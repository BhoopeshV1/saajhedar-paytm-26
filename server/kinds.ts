// The kinds of neighbourhood business the area view counts, and how Overture
// Maps categories map onto them. Shared by the data prep script and the server.
export type Kind = { key: string; label: string; ta: string; hi: string; color: string; openable: boolean };

// `openable` marks kinds a first-time owner could realistically start; the gap
// finder only suggests those. Colours are tuned to sit on the pale map.
export const KINDS: Kind[] = [
  { key: "grocery", label: "Grocery and provisions", ta: "மளிகைக் கடை", hi: "किराना", color: "#00A3D9", openable: true },
  { key: "produce", label: "Vegetables, fruit, meat and fish", ta: "காய்கறி, பழம், இறைச்சி", hi: "सब्ज़ी, फल, मांस", color: "#2E9E5B", openable: true },
  { key: "bakery", label: "Bakery and sweets", ta: "பேக்கரி, இனிப்பு", hi: "बेकरी, मिठाई", color: "#E08A00", openable: true },
  { key: "eatery", label: "Restaurants and messes", ta: "உணவகம், மெஸ்", hi: "भोजनालय", color: "#D9482B", openable: true },
  { key: "cafe", label: "Tea, coffee and juice", ta: "டீ, காபி, ஜூஸ்", hi: "चाय, कॉफ़ी, जूस", color: "#8A5A2B", openable: true },
  { key: "pharmacy", label: "Pharmacy", ta: "மருந்தகம்", hi: "दवा दुकान", color: "#0E8F86", openable: true },
  { key: "clinic", label: "Clinics and labs", ta: "கிளினிக், லேப்", hi: "क्लिनिक, लैब", color: "#3B6FD4", openable: false },
  { key: "salon", label: "Salon and beauty", ta: "சலூன், அழகு நிலையம்", hi: "सैलून, ब्यूटी", color: "#C2438F", openable: true },
  { key: "clothing", label: "Clothing and tailoring", ta: "துணி, தையல்", hi: "कपड़े, दर्ज़ी", color: "#7A4FD0", openable: true },
  { key: "jewellery", label: "Jewellery", ta: "நகைக் கடை", hi: "ज्वेलरी", color: "#B58A00", openable: false },
  { key: "optician", label: "Opticians", ta: "கண்ணாடிக் கடை", hi: "चश्मे की दुकान", color: "#4E7A8C", openable: true },
  { key: "mobile", label: "Mobile and electronics", ta: "மொபைல், எலக்ட்ரானிக்ஸ்", hi: "मोबाइल, इलेक्ट्रॉनिक्स", color: "#1F5FBF", openable: true },
  { key: "hardware", label: "Hardware and building supplies", ta: "ஹார்டுவேர்", hi: "हार्डवेयर", color: "#6B7280", openable: true },
  { key: "stationery", label: "Stationery, books and xerox", ta: "ஸ்டேஷனரி, ஜெராக்ஸ்", hi: "स्टेशनरी, ज़ेरॉक्स", color: "#B4551E", openable: true },
  { key: "auto", label: "Vehicle service and parts", ta: "வாகன சர்வீஸ், உதிரி பாகம்", hi: "गाड़ी सर्विस, पार्ट्स", color: "#44506A", openable: true },
  { key: "fitness", label: "Gym and fitness", ta: "ஜிம்", hi: "जिम", color: "#C0392B", openable: true },
  { key: "tuition", label: "Tuition and classes", ta: "டியூஷன், வகுப்புகள்", hi: "ट्यूशन, क्लास", color: "#5B6ED6", openable: true },
  { key: "laundry", label: "Laundry", ta: "சலவை", hi: "लॉन्ड्री", color: "#2A9DB5", openable: true },
  { key: "pets", label: "Pet shop and care", ta: "செல்லப்பிராணி கடை", hi: "पेट शॉप", color: "#9A7B4F", openable: true },
  { key: "gifts", label: "Flowers, gifts and toys", ta: "பூ, பரிசு, பொம்மை", hi: "फूल, गिफ़्ट, खिलौने", color: "#D4577A", openable: true },
  { key: "lodging", label: "Hotels and hostels", ta: "விடுதி, ஹாஸ்டல்", hi: "होटल, हॉस्टल", color: "#5F6B7F", openable: false },
  { key: "finance", label: "Banks and ATMs", ta: "வங்கி, ஏடிஎம்", hi: "बैंक, एटीएम", color: "#0B3A7A", openable: false },
  { key: "other", label: "Other shops and services", ta: "பிற கடைகள், சேவைகள்", hi: "अन्य दुकानें, सेवाएँ", color: "#A9B4C4", openable: false },
];

const has = (s: string, ...words: string[]) => words.some((w) => s.includes(w));

export function kindOf(basic: string | null, category: string | null, hierarchy: string | null): string | null {
  const b = basic ?? "", c = category ?? "", h = hierarchy ?? "";
  const top = h.split(">")[0];
  if (anchorOf(basic, category, hierarchy)) return null;
  if (has(c, "pharmacy", "drug_store", "medical_supply") || b === "pharmacy_and_drug_store") return "pharmacy";
  if (has(c, "eyewear", "optician", "optical", "optometrist") || b === "vision_or_eye_care_clinic") return "optician";
  if (has(c, "jewelry", "jewellery", "gold_buyer")) return "jewellery";
  if (has(c, "butcher", "seafood_market", "meat", "fish_market", "produce", "fruit", "vegetable", "farmers_market", "poultry") && top !== "food_and_drink") return "produce";
  if (has(c, "bakery", "dessert", "candy", "sweet", "ice_cream", "confection", "cake", "donut", "chocolat")) return "bakery";
  if (has(c, "grocery", "supermarket", "convenience_store", "warehouse_club", "department_store", "discount_store", "superstore", "organic", "health_food", "dairy") ||
      b === "food_and_beverage_store" || b === "convenience_store") return "grocery";
  if (b === "cafe" || b === "coffee_shop" || has(c, "cafe", "coffee", "tea_", "juice", "smoothie", "bubble_tea", "milk") || b === "non_alcoholic_beverage_venue" || b === "smoothie_juice_bar") return "cafe";
  if (top === "food_and_drink" && !has(b, "bar", "lounge", "brewery", "winery", "distillery", "alcoholic")) return "eatery";
  if (b === "personal_or_beauty_service" || has(c, "salon", "barber", "beauty", "spa", "nail", "tattoo", "makeup") || b === "personal_care_and_beauty_store") return "salon";
  if (b === "fashion_and_apparel_store" || has(c, "clothing", "tailor", "boutique", "saree", "sari", "shoe", "fabric", "textile", "bridal")) return "clothing";
  if (b === "electronics_store" || has(c, "mobile_phone", "electronics", "computer_store", "telecommunications", "appliance") || b === "telecommunications_service") return "mobile";
  if (b === "hardware_home_and_garden_store" || has(c, "hardware", "building_supply", "paint_store", "plumbing_supply", "electrical_supply", "tile", "lumber")) return "hardware";
  if (has(c, "stationery", "book", "office_supply", "printing", "copy", "photocopy", "art_supply", "craft") || b === "printing_service" || b === "books_music_and_video_store" ||
      b === "office_supply_store" || b === "arts_crafts_and_hobby_store") return "stationery";
  if (b === "automotive_service" || b === "vehicle_parts_store" || b === "vehicle_service" || has(c, "auto_repair", "automotive_repair", "motorcycle_repair", "tire", "car_wash", "auto_parts", "bike_repair")) return "auto";
  if (b === "gym" || b === "fitness_studio" || has(c, "gym", "yoga", "fitness", "pilates", "martial_arts")) return "fitness";
  if (b === "tutoring_service" || b === "specialty_school" || b === "preschool" || b === "educational_service" || has(c, "tutoring", "coaching", "dance_school", "music_school", "art_school", "language_school", "driving_school")) return "tuition";
  if (b === "laundry_service" || has(c, "laundry", "dry_clean")) return "laundry";
  if (b === "animal_and_pet_store" || b === "animal_or_pet_service" || has(c, "pet_", "veterinar")) return "pets";
  if (b === "flowers_and_gifts_store" || b === "toys_and_games_store" || has(c, "florist", "gift", "toy", "party_supply")) return "gifts";
  if (top === "lodging") return "lodging";
  if (has(b, "bank", "atm", "credit_union") || has(c, "bank", "atm")) return "finance";
  if (top === "health_care" && !has(b, "hospital")) return "clinic";
  if (top === "shopping" || top === "services_and_business" || top === "lifestyle_services" || top === "arts_and_entertainment" || top === "sports_and_recreation" || !top) return "other";
  return null;
}

// Places that bring people into an area rather than compete for them.
export function anchorOf(basic: string | null, category: string | null, hierarchy: string | null): string | null {
  const b = basic ?? "", c = category ?? "", h = hierarchy ?? "";
  if (has(b, "place_of_worship", "religious_organization")) return "worship";
  if (b === "college_university" || has(c, "college", "university")) return "college";
  if (["place_of_learning", "high_school", "elementary_school", "middle_school", "education"].includes(b) && !has(c, "tutoring", "coaching")) return "school";
  if (b === "hospital" || has(c, "hospital")) return "hospital";
  if (b === "train_station" || has(c, "train_station", "metro_station", "bus_station") || b === "public_transit_facility_or_service") return "transit";
  if (b === "corporate_or_business_office" || has(c, "information_technology_company", "software_development", "corporate_office")) return "office";
  if (b === "shopping_mall") return "mall";
  if (b === "movie_theater") return "cinema";
  if (b === "park") return "park";
  if (h.startsWith("cultural_and_historic") || h.startsWith("geographic_entities") || h.startsWith("community_and_government")) return "worship" === b ? "worship" : null;
  return null;
}

// Rough cost of opening a small shop of each kind in a Chennai suburb, in lakh
// rupees (low, high): deposit, fit-out and first stock. Illustrative figures for
// the prototype, not researched estimates; a real product would use lender data.
export const SETUP_LAKH: Record<string, [number, number]> = {
  grocery: [3, 10], produce: [0.5, 2], bakery: [5, 15], eatery: [5, 20], cafe: [1.5, 5], pharmacy: [5, 15], salon: [2, 8], clothing: [3, 12],
  optician: [5, 15], mobile: [3, 10], hardware: [5, 20], stationery: [1.5, 5], auto: [2, 8], fitness: [10, 30], tuition: [0.5, 3], laundry: [1, 5], pets: [3, 10], gifts: [1, 4],
};
