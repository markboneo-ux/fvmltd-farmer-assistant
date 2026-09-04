import { STALE_SOURCE_DAYS, type SourceCategory, type TrustedSource } from "./types";

/** Seed last-checked date for bundled registry rows (updated when research runs). */
const SEED_CHECKED = "2026-09-01T00:00:00.000Z";

/**
 * Country-specific trusted source registry.
 * Random blogs are never listed here and must not rank equal to these sources.
 */
export const TRUSTED_SOURCES: TrustedSource[] = [
  {
    id: "tt-namis",
    name: "NAMDEVCO NAMIS market data",
    country: "Trinidad and Tobago",
    url: "https://namistt.com/",
    domain: "namistt.com",
    category: "market_prices",
    trustLevel: "statutory_authority",
    lastCheckedAt: SEED_CHECKED,
    notes: "Wholesale prices and volumes for Trinidad & Tobago.",
  },
  {
    id: "tt-namis-prices",
    name: "NAMDEVCO prices and volumes",
    country: "Trinidad and Tobago",
    url: "https://www.namistt.com/PricesVolumes.php",
    domain: "namistt.com",
    category: "market_prices",
    trustLevel: "statutory_authority",
    lastCheckedAt: SEED_CHECKED,
  },
  {
    id: "tt-namdevco",
    name: "NAMDEVCO",
    country: "Trinidad and Tobago",
    url: "https://www.namdevco.com/market-information",
    domain: "namdevco.com",
    category: "market_prices",
    trustLevel: "statutory_authority",
    lastCheckedAt: SEED_CHECKED,
  },
  {
    id: "tt-malaf",
    name: "Ministry of Agriculture, Land and Fisheries",
    country: "Trinidad and Tobago",
    url: "https://agriculture.gov.tt/",
    domain: "agriculture.gov.tt",
    category: "government_guidance",
    trustLevel: "official_government",
    lastCheckedAt: SEED_CHECKED,
  },
  {
    id: "tt-ptccb",
    name: "Pesticides and Toxic Chemicals Inspectorate",
    country: "Trinidad and Tobago",
    url: "https://agriculture.gov.tt/",
    domain: "agriculture.gov.tt",
    category: "pesticide_registration",
    trustLevel: "official_government",
    lastCheckedAt: SEED_CHECKED,
    notes: "Confirm local labels; do not assume other CARICOM registrations.",
  },
  {
    id: "cardi",
    name: "CARDI",
    country: "Caribbean",
    url: "https://www.cardi.org/",
    domain: "cardi.org",
    category: "research",
    trustLevel: "research_institution",
    lastCheckedAt: SEED_CHECKED,
  },
  {
    id: "uwi-sta",
    name: "The University of the West Indies",
    country: "Caribbean",
    url: "https://sta.uwi.edu/",
    domain: "uwi.edu",
    category: "research",
    trustLevel: "research_institution",
    lastCheckedAt: SEED_CHECKED,
  },
  {
    id: "gy-ptccb",
    name: "Guyana Pesticides and Toxic Chemicals Control Board",
    country: "Guyana",
    url: "https://ptccb.org.gy/",
    domain: "ptccb.org.gy",
    category: "pesticide_registration",
    trustLevel: "official_government",
    lastCheckedAt: SEED_CHECKED,
  },
  {
    id: "gy-moa",
    name: "Guyana Ministry of Agriculture",
    country: "Guyana",
    url: "https://agriculture.gov.gy/",
    domain: "agriculture.gov.gy",
    category: "government_guidance",
    trustLevel: "official_government",
    lastCheckedAt: SEED_CHECKED,
  },
  {
    id: "jm-pca",
    name: "Jamaica Pesticides Control Authority",
    country: "Jamaica",
    url: "https://www.moa.gov.jm/",
    domain: "moa.gov.jm",
    category: "pesticide_registration",
    trustLevel: "official_government",
    lastCheckedAt: SEED_CHECKED,
  },
  {
    id: "jm-moa",
    name: "Jamaica Ministry of Agriculture",
    country: "Jamaica",
    url: "https://www.moa.gov.jm/",
    domain: "moa.gov.jm",
    category: "government_guidance",
    trustLevel: "official_government",
    lastCheckedAt: SEED_CHECKED,
  },
  {
    id: "bb-moa",
    name: "Barbados Ministry of Agriculture",
    country: "Barbados",
    url: "https://www.agriculture.gov.bb/",
    domain: "agriculture.gov.bb",
    category: "government_guidance",
    trustLevel: "official_government",
    lastCheckedAt: SEED_CHECKED,
  },
  {
    id: "gd-moa",
    name: "Grenada Ministry of Agriculture",
    country: "Grenada",
    url: "https://agriculture.gov.gd/",
    domain: "agriculture.gov.gd",
    category: "government_guidance",
    trustLevel: "official_government",
    lastCheckedAt: SEED_CHECKED,
  },
  {
    id: "lc-moa",
    name: "Saint Lucia Ministry of Agriculture",
    country: "Saint Lucia",
    url: "https://www.govt.lc/",
    domain: "govt.lc",
    category: "government_guidance",
    trustLevel: "official_government",
    lastCheckedAt: SEED_CHECKED,
  },
];

const TRUST_RANK: Record<TrustedSource["trustLevel"], number> = {
  official_government: 100,
  statutory_authority: 90,
  research_institution: 75,
  manufacturer: 55,
  recognized_extension: 50,
  other: 10,
};

export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0]?.toLowerCase() ?? "";
  }
}

export function sourcesForCountry(country: string | null | undefined): TrustedSource[] {
  const needle = (country ?? "").trim().toLowerCase();
  return TRUSTED_SOURCES.filter((source) => {
    if (source.country === "Caribbean") return true;
    if (!needle) return source.country === "Trinidad and Tobago" || source.country === "Caribbean";
    return (
      source.country.toLowerCase() === needle ||
      (needle.includes("trinidad") && source.country === "Trinidad and Tobago") ||
      (needle.includes("tobago") && source.country === "Trinidad and Tobago")
    );
  });
}

export function sourcesByCategory(
  country: string | null | undefined,
  category: SourceCategory,
): TrustedSource[] {
  return sourcesForCountry(country)
    .filter((source) => source.category === category)
    .sort((a, b) => TRUST_RANK[b.trustLevel] - TRUST_RANK[a.trustLevel]);
}

export function rankSources(sources: TrustedSource[]): TrustedSource[] {
  return [...sources].sort((a, b) => {
    const trust = TRUST_RANK[b.trustLevel] - TRUST_RANK[a.trustLevel];
    if (trust !== 0) return trust;
    return a.name.localeCompare(b.name);
  });
}

export function isTrustedDomain(url: string, country?: string | null): boolean {
  const domain = domainFromUrl(url);
  if (!domain) return false;
  return sourcesForCountry(country).some(
    (source) => domain === source.domain || domain.endsWith(`.${source.domain}`),
  );
}

export function isSourceStale(source: Pick<TrustedSource, "lastCheckedAt">, now = Date.now()): boolean {
  const checked = Date.parse(source.lastCheckedAt);
  if (!Number.isFinite(checked)) return true;
  return now - checked > STALE_SOURCE_DAYS * 24 * 60 * 60 * 1000;
}

export function trustRank(level: TrustedSource["trustLevel"]): number {
  return TRUST_RANK[level];
}
