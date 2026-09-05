export const SOURCE_CATEGORIES = [
  "market_prices",
  "pesticide_registration",
  "manufacturer_label",
  "government_guidance",
  "research",
  "extension",
  "weather",
  "financing",
  "pest_alerts",
  "regulatory",
  "other",
] as const;

export type SourceCategory = (typeof SOURCE_CATEGORIES)[number];

export const TRUST_LEVELS = [
  "official_government",
  "statutory_authority",
  "research_institution",
  "manufacturer",
  "recognized_extension",
  "other",
] as const;

export type TrustLevel = (typeof TRUST_LEVELS)[number];

export type TrustedSource = {
  id: string;
  name: string;
  country: string;
  url: string;
  domain: string;
  category: SourceCategory;
  trustLevel: TrustLevel;
  lastCheckedAt: string;
  notes?: string;
};

export type WebSourceCitation = {
  name: string;
  url: string | null;
  category?: SourceCategory;
  trustLevel?: TrustLevel;
};

export type ResearchNeed =
  | "none"
  | "market_prices"
  | "pesticide_registration"
  | "product_label"
  | "weather"
  | "government_guidance"
  | "financing"
  | "pest_alerts"
  | "regulatory";

export type PriceKind = "wholesale" | "retail" | "farmgate_estimate" | "farmer_selling";

export type MarketPriceQuote = {
  crop: string;
  country: string;
  priceKind: PriceKind;
  unit: string;
  amount: number | null;
  currency: string;
  marketName: string | null;
  asOf: string | null;
  stale: boolean;
  sourceName: string;
  sourceUrl: string | null;
  note: string | null;
};

export type ChemicalRecord = {
  country: string;
  crop: string | null;
  targetPestOrDisease: string | null;
  activeIngredient: string;
  tradeName: string | null;
  registrationStatus: "registered" | "expired" | "suspended" | "unverified";
  registrationSource: string | null;
  sourceUrl: string | null;
  lastVerifiedAt: string | null;
};

export type PesticideVerification = {
  country: string;
  activeIngredient: string | null;
  tradeName: string | null;
  verified: boolean;
  status: ChemicalRecord["registrationStatus"];
  localTradeNames: string[];
  sourceName: string | null;
  sourceUrl: string | null;
  lastVerifiedAt: string | null;
  farmerMessage: string;
};

export type ResearchDocument = {
  source: TrustedSource;
  url: string;
  title: string;
  excerpt: string;
  retrievedAt: string;
  ok: boolean;
  failureReason: string | null;
};

export type WebResearchResult = {
  needed: ResearchNeed;
  usedWeb: boolean;
  documents: ResearchDocument[];
  citations: WebSourceCitation[];
  marketQuotes: MarketPriceQuote[];
  pesticide: PesticideVerification | null;
  brief: string;
  failures: Array<{ sourceName: string; reason: string }>;
  outdatedSources: Array<{ sourceName: string; lastCheckedAt: string }>;
};

export const UNVERIFIED_REGISTRATION_TEMPLATE =
  "I cannot confirm that this product is registered in {country}. Check the local label or regulator before use.";

export function unverifiedRegistrationMessage(country: string): string {
  const name = country.trim() || "your country";
  return UNVERIFIED_REGISTRATION_TEMPLATE.replace("{country}", name);
}

export const STALE_SOURCE_DAYS = 90;
