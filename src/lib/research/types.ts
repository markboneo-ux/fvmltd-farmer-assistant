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

export const TRUST_LEVELS = [
  "official",
  "reviewed",
  "discovered",
  "unreviewed",
] as const;

export type TrustLevel = (typeof TRUST_LEVELS)[number];

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
