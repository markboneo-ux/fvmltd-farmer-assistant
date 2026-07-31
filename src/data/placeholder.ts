export const farmer = {
  id: "FMR-1042",
  name: "Amina Okello",
  phone: "+255 712 555 014",
  village: "Mtwara Rural",
  region: "Mtwara, Tanzania",
  farmSize: "1.8 hectares",
  primaryCrops: ["Cassava", "Maize", "Tomato"],
  memberSince: "March 2026",
};

export const recentChecks = [
  {
    id: "CHK-8821",
    crop: "Cassava",
    date: "28 Jul 2026",
    status: "Needs attention",
    severity: "moderate" as const,
    summary: "Leaf spotting consistent with early mosaic stress.",
  },
  {
    id: "CHK-8790",
    crop: "Tomato",
    date: "21 Jul 2026",
    status: "Healthy",
    severity: "low" as const,
    summary: "Canopy looks vigorous; continue current watering.",
  },
  {
    id: "CHK-8712",
    crop: "Maize",
    date: "12 Jul 2026",
    status: "Monitor",
    severity: "mild" as const,
    summary: "Slight yellowing on lower leaves after dry spell.",
  },
];

export const cropOptions = [
  { id: "cassava", name: "Cassava", stage: "Vegetative" },
  { id: "maize", name: "Maize", stage: "Tasseling" },
  { id: "tomato", name: "Tomato", stage: "Fruiting" },
  { id: "banana", name: "Banana", stage: "Flowering" },
  { id: "beans", name: "Beans", stage: "Flowering" },
  { id: "other", name: "Other crop", stage: "Unspecified" },
];

export const chatMessages = [
  {
    id: "m1",
    role: "assistant" as const,
    text: "Habari Amina. I can help check crop health from photos and field notes. What are you seeing on your farm today?",
    time: "09:12",
  },
  {
    id: "m2",
    role: "farmer" as const,
    text: "My cassava leaves have yellow patches and some curling.",
    time: "09:13",
  },
  {
    id: "m3",
    role: "assistant" as const,
    text: "Thanks. That can relate to nutrient stress or viral mosaic. Upload 2–3 clear leaf photos and tell me when you first noticed it.",
    time: "09:13",
  },
  {
    id: "m4",
    role: "farmer" as const,
    text: "Started about one week ago after heavy rain.",
    time: "09:14",
  },
];

export const uploadSlots = [
  { id: "u1", label: "Whole plant", hint: "Stand back and capture the full plant", status: "ready" as const },
  { id: "u2", label: "Affected leaves", hint: "Close-up of the damaged leaves", status: "uploaded" as const },
  { id: "u3", label: "Stem / soil base", hint: "Optional photo near the stem base", status: "empty" as const },
];

export const assessment = {
  id: "ASM-4410",
  crop: "Cassava",
  confidence: 78,
  likelyIssue: "Early cassava mosaic-like symptoms",
  severity: "Moderate",
  summary:
    "Leaf mottling and curling patterns suggest early mosaic stress. Weather notes after heavy rain support monitoring for spread.",
  recommendations: [
    "Remove and destroy the most affected leaves away from the field.",
    "Wash tools before moving between plots.",
    "Check neighboring plants over the next 7 days.",
    "Share photos with FVMLTD staff if new shoots show the same pattern.",
  ],
  nextStep: "Staff agronomist review recommended within 48 hours.",
};

export const staffQueue = [
  {
    id: "REV-301",
    farmer: "Amina Okello",
    crop: "Cassava",
    submitted: "Today, 09:18",
    priority: "High",
    aiFlag: "Mosaic-like symptoms",
    village: "Mtwara Rural",
  },
  {
    id: "REV-298",
    farmer: "Joseph Mwangi",
    crop: "Tomato",
    submitted: "Today, 08:41",
    priority: "Medium",
    aiFlag: "Possible early blight",
    village: "Kilwa Masoko",
  },
  {
    id: "REV-290",
    farmer: "Grace Ndlovu",
    crop: "Maize",
    submitted: "Yesterday",
    priority: "Low",
    aiFlag: "Nutrient yellowing",
    village: "Lindi Urban",
  },
  {
    id: "REV-284",
    farmer: "Samuel Kiptoo",
    crop: "Banana",
    submitted: "Yesterday",
    priority: "Medium",
    aiFlag: "Leaf edge necrosis",
    village: "Newala",
  },
];

export const staffStats = [
  { label: "Open reviews", value: "12" },
  { label: "Resolved today", value: "7" },
  { label: "Avg. response", value: "4.2h" },
];
