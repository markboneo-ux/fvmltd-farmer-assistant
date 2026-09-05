/**
 * Country-specific web research contracts.
 * Local registration, prices, and regulations are never invented.
 */

export const SOURCE_TYPES = [
  "government",
  "regulator",
  "extension",
  "university",
  "research_institute",
  "market_data",
  "manufacturer_label",
  "industry",
  "other",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

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
  "official",
  "reviewed",
  "discovered",
  "unreviewed",
] as const;

export type TrustLevel = (typeof TRUST_LEVELS)[number];

export const REGISTRY_TRUST_LEVELS = [
  "official_government",
  "statutory_authority",
  "research_institution",
  "manufacturer",
  "recognized_extension",
  "other",
] as const;

export type RegistryTrustLevel = (typeof REGISTRY_TRUST_LEVELS)[number];

export const RESEARCH_TOPICS = [
  "pesticide_registration",
  "product_label",
  "chemical_approval",
  "market_prices",
  "government_program",
  "disease_alert",
  "weather",
  "government_guidance",
  "extension",
  "regulation",
  "input_availability",
] as const;

export type ResearchTopic = (typeof RESEARCH_TOPICS)[number];

export const PRICE_TYPES = ["wholesale", "retail", "farmgate", "unknown"] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

export type TrustedSource = {
  id: string;
  country: string;
  sourceName: string;
  domain: string | null;
  homepageUrl: string | null;
  sourceType: SourceType;
  trustLevel: TrustLevel;
  active: boolean;
  notes: string;
  lastReviewedAt: string | null;
  preferredFor: ResearchTopic[];
};

export type CatalogTrustedSource = {
  id: string;
  name: string;
  country: string;
  url: string;
  domain: string;
  category: SourceCategory;
  trustLevel: RegistryTrustLevel;
  lastCheckedAt: string;
  notes?: string;
};

export type SearchHit = {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  retrievedAt: string;
  publishedAt: string | null;
};

export type FetchedPage = {
  url: string;
  title: string;
  text: string;
  retrievedAt: string;
  publishedAt: string | null;
  status: number;
};

export type WebCitation = {
  url: string;
  retrievedAt: string;
  title: string;
  sourceName: string;
  country: string | null;
  sourceType: SourceType;
  publishedAt: string | null;
  stale: boolean;
};

export type WebSourceCitation = {
  name: string;
  url: string | null;
  organization?: string | null;
  publishedAt?: string | null;
  category?: SourceCategory;
  trustLevel?: TrustLevel | RegistryTrustLevel;
  supported?: string | null;
  checkedAt?: string | null;
};

export type PesticideCheck = {
  crop: string | null;
  pestOrDisease: string | null;
  country: string | null;
  activeIngredient: string | null;
  tradeName: string | null;
  verified: boolean;
  countryStatus: "verified" | "not_verified";
  sourceName: string | null;
  sourceUrl: string | null;
  use: string | null;
  rate: string | null;
  phi: string | null;
  rei: string | null;
  farmerNote: string;
};

export type MarketPriceNote = {
  commodity: string | null;
  country: string;
  priceText: string | null;
  priceType: PriceType;
  sourceName: string;
  sourceUrl: string | null;
  retrievedAt: string;
  publishedAt: string | null;
  stale: boolean;
};

export type ResearchFailure = {
  stage: "policy" | "search" | "fetch" | "verify" | "parse";
  errorType: string;
  message: string;
};

export type ResearchResult = {
  used: boolean;
  topics: ResearchTopic[];
  country: string | null;
  countryRequired: boolean;
  countryMissing: boolean;
  citations: WebCitation[];
  pesticideChecks: PesticideCheck[];
  marketNotes: MarketPriceNote[];
  generalNotes: string[];
  staleWarnings: string[];
  failure: ResearchFailure | null;
  farmerFallback: string | null;
};

export type SearchProvider = {
  name: string;
  search(
    query: string,
    options?: { country?: string | null; allowedDomains?: string[] },
  ): Promise<SearchHit[]>;
};

export type PageFetcher = (url: string) => Promise<FetchedPage | null>;

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
  source: CatalogTrustedSource;
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
  "I can explain the active ingredients normally used against this problem, but I haven't verified registration{crop} in {country}.";

export function unverifiedRegistrationMessage(
  country: string,
  crop?: string | null,
): string {
  const name = country.trim() || "your country";
  const cropBit = crop?.trim() ? ` for ${crop.trim()}` : "";
  return UNVERIFIED_REGISTRATION_TEMPLATE.replace("{crop}", cropBit).replace("{country}", name);
}

export const STALE_SOURCE_DAYS = 90;
