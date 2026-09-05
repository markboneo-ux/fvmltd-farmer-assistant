/**
 * Trusted public sources by country.
 * Only include domains that have been checked. Empty slots stay unreviewed.
 */

import { RESEARCH_COUNTRIES, type ResearchCountry } from "./countries";
import type { ResearchTopic, SourceType, TrustedSource, TrustLevel } from "./types";

const REVIEWED = "2026-09-05";

function source(input: {
  id: string;
  country: string;
  sourceName: string;
  domain: string | null;
  homepageUrl: string | null;
  sourceType: SourceType;
  trustLevel: TrustLevel;
  active?: boolean;
  notes: string;
  lastReviewedAt?: string | null;
  preferredFor?: ResearchTopic[];
}): TrustedSource {
  return {
    active: input.active ?? Boolean(input.domain),
    lastReviewedAt: input.lastReviewedAt === undefined ? REVIEWED : input.lastReviewedAt,
    preferredFor: input.preferredFor ?? [],
    ...input,
  };
}

function unreviewedSlot(
  country: ResearchCountry,
  kind: "regulator" | "market_data" | "government",
): TrustedSource {
  const labels = {
    regulator: "Official pesticide / chemical regulator",
    market_data: "Official agricultural market information",
    government: "Ministry of agriculture / official extension",
  };
  return source({
    id: `${country.toLowerCase().replace(/[^a-z]+/g, "-")}-${kind}-slot`,
    country,
    sourceName: `${labels[kind]} — ${country}`,
    domain: null,
    homepageUrl: null,
    sourceType: kind === "market_data" ? "market_data" : kind === "regulator" ? "regulator" : "government",
    trustLevel: "unreviewed",
    active: false,
    lastReviewedAt: null,
    notes:
      "Authoritative public website not yet verified. Do not claim local registration, prices, or approvals until a reviewed official source is configured.",
    preferredFor:
      kind === "regulator"
        ? ["pesticide_registration", "chemical_approval", "product_label"]
        : kind === "market_data"
          ? ["market_prices"]
          : ["government_guidance", "government_program", "extension", "regulation"],
  });
}

/**
 * Trust ranking used when sources disagree.
 * Lower number wins. Random blogs never outrank official local sources.
 */
export function trustPriority(sourceType: SourceType, trustLevel: TrustLevel): number {
  if (trustLevel === "unreviewed" || trustLevel === "discovered") {
    return 80 + typePriority(sourceType);
  }
  return typePriority(sourceType);
}

function typePriority(sourceType: SourceType): number {
  switch (sourceType) {
    case "regulator":
      return 1;
    case "government":
      return 2;
    case "market_data":
      return 3;
    case "university":
    case "research_institute":
      return 4;
    case "manufacturer_label":
      return 5;
    case "extension":
      return 6;
    case "industry":
      return 7;
    default:
      return 9;
  }
}

export const TRUSTED_SOURCES: TrustedSource[] = [
  source({
    id: "tt-namdevco",
    country: "Trinidad and Tobago",
    sourceName: "NAMDEVCO",
    domain: "namdevco.com",
    homepageUrl: "https://www.namdevco.com/",
    sourceType: "market_data",
    trustLevel: "official",
    notes:
      "National Agricultural Marketing and Development Corporation. Wholesale market operator. Do not treat every NAMDEVCO figure as a farmgate price.",
    preferredFor: ["market_prices"],
  }),
  source({
    id: "tt-namis",
    country: "Trinidad and Tobago",
    sourceName: "NAMIS Trinidad and Tobago",
    domain: "namistt.com",
    homepageUrl: "https://www.namistt.com/",
    sourceType: "market_data",
    trustLevel: "official",
    notes:
      "NAMDEVCO National Agricultural Market Information System. Wholesale market reports. Label values as wholesale unless the page says otherwise.",
    preferredFor: ["market_prices"],
  }),
  source({
    id: "tt-malf",
    country: "Trinidad and Tobago",
    sourceName: "Ministry of Agriculture, Land and Fisheries",
    domain: "agriculture.gov.tt",
    homepageUrl: "https://agriculture.gov.tt/",
    sourceType: "government",
    trustLevel: "official",
    notes: "Official ministry site for crop guidance, incentives, and agricultural services.",
    preferredFor: ["government_guidance", "government_program", "extension", "disease_alert", "regulation"],
  }),
  source({
    id: "tt-cfdd",
    country: "Trinidad and Tobago",
    sourceName: "Chemistry, Food and Drugs Division (Pesticides and Toxic Chemicals)",
    domain: "health.gov.tt",
    homepageUrl: "https://health.gov.tt/cfdd/portal",
    sourceType: "regulator",
    trustLevel: "official",
    notes:
      "Official Ministry of Health CFDD pesticide portal. Confirm the specific product listing before treating a chemical as approved. Do not invent crop, rate, PHI, or REI if the page does not state them.",
    preferredFor: ["pesticide_registration", "chemical_approval", "product_label", "regulation"],
  }),
  source({
    id: "intl-fao",
    country: "regional",
    sourceName: "FAO plant production and protection",
    domain: "fao.org",
    homepageUrl: "https://www.fao.org/plant-production-protection/en",
    sourceType: "research_institute",
    trustLevel: "official",
    notes: "General agronomy only. Never proof of national pesticide registration.",
    preferredFor: ["government_guidance"],
  }),
  source({
    id: "regional-cardi",
    country: "regional",
    sourceName: "CARDI",
    domain: "cardi.org",
    homepageUrl: "https://www.cardi.org/",
    sourceType: "research_institute",
    trustLevel: "official",
    notes: "Caribbean Agricultural Research and Development Institute. Regional research — not a national pesticide register.",
    preferredFor: ["government_guidance", "extension"],
  }),
  source({
    id: "tt-uwi",
    country: "Trinidad and Tobago",
    sourceName: "The University of the West Indies, St. Augustine",
    domain: "sta.uwi.edu",
    homepageUrl: "https://sta.uwi.edu/",
    sourceType: "university",
    trustLevel: "official",
    notes: "UWI St. Augustine faculty and research pages. Not a pesticide register.",
    preferredFor: ["government_guidance"],
  }),
  source({
    id: "gy-ptccb",
    country: "Guyana",
    sourceName: "Pesticides and Toxic Chemicals Control Board",
    domain: "ptccb.org.gy",
    homepageUrl: "https://ptccb.org.gy/",
    sourceType: "regulator",
    trustLevel: "official",
    notes: "Guyana pesticide and toxic chemical regulator. Use for Guyana registration only.",
    preferredFor: ["pesticide_registration", "chemical_approval", "product_label", "regulation"],
  }),
  source({
    id: "gy-moa",
    country: "Guyana",
    sourceName: "Ministry of Agriculture (Guyana)",
    domain: "agriculture.gov.gy",
    homepageUrl: "https://agriculture.gov.gy/",
    sourceType: "government",
    trustLevel: "official",
    notes: "Official Guyana ministry site.",
    preferredFor: ["government_guidance", "government_program", "extension", "disease_alert"],
  }),
  source({
    id: "jm-moa",
    country: "Jamaica",
    sourceName: "Ministry of Agriculture, Fisheries and Mining",
    domain: "moa.gov.jm",
    homepageUrl: "https://www.moa.gov.jm/",
    sourceType: "government",
    trustLevel: "official",
    notes: "Official Jamaica ministry site.",
    preferredFor: ["government_guidance", "government_program", "regulation", "disease_alert"],
  }),
  source({
    id: "jm-rada",
    country: "Jamaica",
    sourceName: "Rural Agricultural Development Authority",
    domain: "rada.gov.jm",
    homepageUrl: "https://www.rada.gov.jm/",
    sourceType: "extension",
    trustLevel: "official",
    notes: "Jamaica official extension agency.",
    preferredFor: ["extension", "government_guidance"],
  }),
  source({
    id: "jm-pca",
    country: "Jamaica",
    sourceName: "Pesticides Control Authority (Jamaica)",
    domain: "caribpesticides.net",
    homepageUrl: "https://www.caribpesticides.net/",
    sourceType: "regulator",
    trustLevel: "official",
    notes: "Jamaica PCA public site. Use for Jamaica pesticide status only. Confirm the page is current before calling a product registered.",
    preferredFor: ["pesticide_registration", "chemical_approval", "product_label", "regulation"],
  }),
  source({
    id: "jm-jamis",
    country: "Jamaica",
    sourceName: "Jamaica Agricultural Marketing Information System",
    domain: "ja-mis.com",
    homepageUrl: "https://www.ja-mis.com/",
    sourceType: "market_data",
    trustLevel: "discovered",
    lastReviewedAt: null,
    notes:
      "Public JAMIS market reports. Domain found during source research; treat price type as unknown unless the page labels farmgate, wholesale, or retail.",
    preferredFor: ["market_prices"],
  }),
  source({
    id: "bb-moa",
    country: "Barbados",
    sourceName: "Ministry of Agriculture, Food and Nutritional Security",
    domain: "agriculture.gov.bb",
    homepageUrl: "https://agriculture.gov.bb/",
    sourceType: "government",
    trustLevel: "official",
    notes: "Includes the Pesticides Control Unit pages.",
    preferredFor: [
      "government_guidance",
      "government_program",
      "pesticide_registration",
      "chemical_approval",
      "regulation",
      "extension",
    ],
  }),
  source({
    id: "gd-moa",
    country: "Grenada",
    sourceName: "Ministry of Agriculture & Lands, Forestry, Marine Resources & Cooperatives",
    domain: "agriculture.weboffice.gd",
    homepageUrl: "https://agriculture.weboffice.gd/",
    sourceType: "government",
    trustLevel: "official",
    notes: "Official Grenada ministry site. Pesticide register URL not separately verified.",
    preferredFor: ["government_guidance", "extension", "government_program"],
  }),
  source({
    id: "lc-moa",
    country: "Saint Lucia",
    sourceName: "Ministry of Agriculture, Fisheries, Food Security and Rural Development",
    domain: "moaslu.govt.lc",
    homepageUrl: "https://moaslu.govt.lc/",
    sourceType: "government",
    trustLevel: "official",
    notes: "Official Saint Lucia ministry site.",
    preferredFor: ["government_guidance", "extension", "government_program"],
  }),
  source({
    id: "dm-moa",
    country: "Dominica",
    sourceName: "Ministry of Agriculture, Fisheries, Blue and Green Economy",
    domain: "agriculture.gov.dm",
    homepageUrl: "https://www.agriculture.gov.dm/",
    sourceType: "government",
    trustLevel: "official",
    notes: "Official Dominica ministry site.",
    preferredFor: ["government_guidance", "extension", "government_program"],
  }),
  source({
    id: "bz-moa",
    country: "Belize",
    sourceName: "Ministry of Agriculture, Food Security and New Growth Industries",
    domain: "agriculture.gov.bz",
    homepageUrl: "https://www.agriculture.gov.bz/",
    sourceType: "government",
    trustLevel: "official",
    notes: "Official Belize ministry site.",
    preferredFor: ["government_guidance", "extension", "government_program"],
  }),
  source({
    id: "sr-lvv",
    country: "Suriname",
    sourceName: "Ministry of Agriculture, Animal Husbandry and Fisheries",
    domain: "lvv.gov.sr",
    homepageUrl: "https://lvv.gov.sr/",
    sourceType: "government",
    trustLevel: "discovered",
    lastReviewedAt: null,
    notes: "Reported official Suriname ministry domain. Treat as discovered until staff review a live page.",
    preferredFor: ["government_guidance", "extension"],
  }),
  source({
    id: "vc-moa",
    country: "Saint Vincent and the Grenadines",
    sourceName: "Ministry of Agriculture, Forestry, Fisheries and Rural Transformation",
    domain: "agriculture.gov.vc",
    homepageUrl: "https://agriculture.gov.vc/agriculture/index.php",
    sourceType: "government",
    trustLevel: "official",
    notes: "Official SVG ministry site. Pesticide register URL not separately verified.",
    preferredFor: ["government_guidance", "extension", "government_program"],
  }),
  unreviewedSlot("Saint Vincent and the Grenadines", "regulator"),
  unreviewedSlot("Saint Vincent and the Grenadines", "market_data"),
  source({
    id: "ag-moa",
    country: "Antigua and Barbuda",
    sourceName: "Ministry of Agriculture, Lands, Fisheries and the Blue Economy",
    domain: "agriculture.gov.ag",
    homepageUrl: "https://agriculture.gov.ag/",
    sourceType: "government",
    trustLevel: "official",
    notes: "Official Antigua and Barbuda ministry site. Pesticide register URL not separately verified.",
    preferredFor: ["government_guidance", "extension", "government_program"],
  }),
  unreviewedSlot("Antigua and Barbuda", "regulator"),
  unreviewedSlot("Antigua and Barbuda", "market_data"),
  unreviewedSlot("Saint Kitts and Nevis", "government"),
  unreviewedSlot("Saint Kitts and Nevis", "regulator"),
  unreviewedSlot("Saint Kitts and Nevis", "market_data"),
  source({
    id: "bs-gov",
    country: "Bahamas",
    sourceName: "Government of The Bahamas — Agriculture and Marine Resources",
    domain: "bahamas.gov.bs",
    homepageUrl: "https://www.bahamas.gov.bs/agencies/agriculture-and-marine-resources",
    sourceType: "government",
    trustLevel: "official",
    notes:
      "National government portal page for the ministry. Not a pesticide register. Confirm the specific page before using it for prices or registrations.",
    preferredFor: ["government_guidance", "government_program"],
  }),
  unreviewedSlot("Bahamas", "regulator"),
  unreviewedSlot("Bahamas", "market_data"),
  unreviewedSlot("Anguilla", "government"),
  unreviewedSlot("Anguilla", "regulator"),
  unreviewedSlot("British Virgin Islands", "government"),
  unreviewedSlot("British Virgin Islands", "regulator"),
  unreviewedSlot("Grenada", "regulator"),
  unreviewedSlot("Grenada", "market_data"),
  unreviewedSlot("Saint Lucia", "regulator"),
  unreviewedSlot("Saint Lucia", "market_data"),
  unreviewedSlot("Dominica", "regulator"),
  unreviewedSlot("Dominica", "market_data"),
  unreviewedSlot("Belize", "regulator"),
  unreviewedSlot("Belize", "market_data"),
  unreviewedSlot("Suriname", "regulator"),
  unreviewedSlot("Suriname", "market_data"),
  unreviewedSlot("Guyana", "market_data"),
];

export function sourcesForCountry(country: string | null | undefined): TrustedSource[] {
  if (!country) return TRUSTED_SOURCES.filter((item) => item.country === "regional");
  const needle = country.trim().toLowerCase();
  return TRUSTED_SOURCES.filter(
    (item) =>
      item.country.toLowerCase() === needle || item.country === "regional",
  );
}

export function activeSourcesForCountry(country: string | null | undefined): TrustedSource[] {
  return sourcesForCountry(country).filter((item) => item.active && item.domain);
}

export function preferredSourcesFor(
  country: string | null | undefined,
  topic: ResearchTopic,
): TrustedSource[] {
  return activeSourcesForCountry(country)
    .filter((item) => item.preferredFor.includes(topic) || item.sourceType === "government")
    .sort(
      (a, b) =>
        trustPriority(a.sourceType, a.trustLevel) - trustPriority(b.sourceType, b.trustLevel),
    );
}

export function sourceByDomain(domain: string): TrustedSource | null {
  const needle = domain.replace(/^www\./, "").toLowerCase();
  return (
    TRUSTED_SOURCES.find((item) => item.domain && item.domain.toLowerCase() === needle) ?? null
  );
}

export function isTrustedDomainForCountry(
  domain: string,
  country: string | null | undefined,
): boolean {
  const source = sourceByDomain(domain);
  if (!source || !source.active) return false;
  if (source.country === "regional") return true;
  if (!country) return false;
  return source.country.toLowerCase() === country.trim().toLowerCase();
}

export function allowedDomainsFor(
  country: string | null | undefined,
  topic?: ResearchTopic,
): string[] {
  const list = topic ? preferredSourcesFor(country, topic) : activeSourcesForCountry(country);
  return [...new Set(list.map((item) => item.domain).filter((item): item is string => Boolean(item)))];
}

export function configuredCountries(): ResearchCountry[] {
  return [...RESEARCH_COUNTRIES];
}

export function countriesWithActiveSources(): string[] {
  return [
    ...new Set(
      TRUSTED_SOURCES.filter((item) => item.active && item.country !== "regional").map(
        (item) => item.country,
      ),
    ),
  ];
}
