/**
 * Known official pesticide-register endpoints by country.
 * Only include URLs that have been checked. Empty means no public register located.
 *
 * Research order:
 * 1. official pesticide regulator / government registry
 * 2. official Ministry of Agriculture
 * 3. official published pesticide register / PDF / database
 * 4. recognized regional institution (not legal proof)
 * 5. official manufacturer label for that country
 * 6. reputable international agricultural source for general agronomy only
 */

import type { SourceType } from "./types";

export type RegisterEndpointPriority =
  | "regulator"
  | "ministry"
  | "published_register"
  | "regional"
  | "manufacturer_label"
  | "international_agronomy";

export type RegisterEndpoint = {
  country: string;
  organization: string;
  title: string;
  url: string;
  domain: string;
  sourceType: SourceType;
  priority: RegisterEndpointPriority;
  /** True only when this URL itself is a register, listing, or product database — not a homepage. */
  isRegisterDocument: boolean;
  notes: string;
};

const TT_CFDD =
  "Chemistry, Food and Drugs Division (Pesticides and Toxic Chemicals)";

export const PESTICIDE_REGISTER_ENDPOINTS: RegisterEndpoint[] = [
  {
    country: "Trinidad and Tobago",
    organization: TT_CFDD,
    title: "CFDD pesticide product listings",
    url: "https://health.gov.tt/cfdd/portal",
    domain: "health.gov.tt",
    sourceType: "regulator",
    priority: "regulator",
    isRegisterDocument: false,
    notes:
      "Official Ministry of Health CFDD portal for Trinidad and Tobago pesticide registration status. Individual registered products are listed under /cfdd/pesticides/search/{id}. The portal landing page is not the full product dump.",
  },
  {
    country: "Trinidad and Tobago",
    organization: TT_CFDD,
    title: "CFDD Chemistry, Food and Drugs Division pesticide publications",
    url: "https://health.gov.tt/services/chemistry-food-and-drugs-division",
    domain: "health.gov.tt",
    sourceType: "regulator",
    priority: "published_register",
    isRegisterDocument: false,
    notes:
      "Official CFDD publications index, including pesticide registration notices and published pesticide product lists. Confirm the linked notice or listing before treating a product as currently registered.",
  },
  {
    country: "Trinidad and Tobago",
    organization: TT_CFDD,
    title: "Public notice: Pesticides and Toxic Chemicals Control Board registration of pesticides",
    url: "https://health.gov.tt/public-notice-pesticides-and-toxic-chemicals-control-board-registration-of-pesticides-0",
    domain: "health.gov.tt",
    sourceType: "regulator",
    priority: "published_register",
    isRegisterDocument: true,
    notes:
      "Official public notice of pesticide registration. Use as a regulatory notice, not as a complete current catalogue of every approved product.",
  },
  {
    country: "Trinidad and Tobago",
    organization: "Ministry of Agriculture, Land and Fisheries",
    title: "Ministry of Agriculture, Land and Fisheries",
    url: "https://agriculture.gov.tt/",
    domain: "agriculture.gov.tt",
    sourceType: "government",
    priority: "ministry",
    isRegisterDocument: false,
    notes: "Official ministry site. Not the pesticide product register.",
  },
  {
    country: "Guyana",
    organization: "Pesticides and Toxic Chemicals Control Board",
    title: "PTCCB register of chemicals",
    url: "https://ptccb.org.gy/",
    domain: "ptccb.org.gy",
    sourceType: "regulator",
    priority: "regulator",
    isRegisterDocument: true,
    notes: "Guyana pesticide and toxic chemical regulator. Use for Guyana only.",
  },
  {
    country: "Jamaica",
    organization: "Pesticides Control Authority (Jamaica)",
    title: "Jamaica PCA public pesticide site",
    url: "https://www.caribpesticides.net/",
    domain: "caribpesticides.net",
    sourceType: "regulator",
    priority: "regulator",
    isRegisterDocument: true,
    notes: "Jamaica pesticide status only. Confirm the page is current before calling a product registered.",
  },
  {
    country: "Grenada",
    organization: "Ministry of Agriculture & Lands, Forestry, Marine Resources & Cooperatives",
    title: "Grenada Ministry of Agriculture",
    url: "https://agriculture.weboffice.gd/",
    domain: "agriculture.weboffice.gd",
    sourceType: "government",
    priority: "ministry",
    isRegisterDocument: false,
    notes:
      "Official Grenada ministry site. A current public pesticide register URL has not been verified.",
  },
  {
    country: "regional",
    organization: "CARDI",
    title: "Caribbean Agricultural Research and Development Institute",
    url: "https://www.cardi.org/",
    domain: "cardi.org",
    sourceType: "research_institute",
    priority: "regional",
    isRegisterDocument: false,
    notes: "Regional research — never national pesticide registration proof.",
  },
  {
    country: "international",
    organization: "FAO",
    title: "FAO plant production and protection",
    url: "https://www.fao.org/plant-production-protection/en",
    domain: "fao.org",
    sourceType: "research_institute",
    priority: "international_agronomy",
    isRegisterDocument: false,
    notes: "General agronomy only. Never proof of national pesticide registration.",
  },
];

const PRIORITY_RANK: Record<RegisterEndpointPriority, number> = {
  regulator: 1,
  ministry: 2,
  published_register: 3,
  regional: 4,
  manufacturer_label: 5,
  international_agronomy: 6,
};

export function registerEndpointsForCountry(country: string | null | undefined): RegisterEndpoint[] {
  if (!country?.trim()) return [];
  const needle = country.trim().toLowerCase();
  const local = PESTICIDE_REGISTER_ENDPOINTS.filter(
    (item) => item.country.toLowerCase() === needle,
  ).sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  const regional = PESTICIDE_REGISTER_ENDPOINTS.filter((item) => item.country === "regional");
  const international = PESTICIDE_REGISTER_ENDPOINTS.filter(
    (item) => item.country === "international",
  );
  return [...local, ...regional, ...international];
}

export function officialRegisterEndpointsForCountry(
  country: string | null | undefined,
): RegisterEndpoint[] {
  return registerEndpointsForCountry(country).filter(
    (item) =>
      item.country !== "regional" &&
      item.country !== "international" &&
      (item.priority === "regulator" || item.priority === "published_register"),
  );
}

export function countryHasKnownPublicRegister(country: string | null | undefined): boolean {
  return officialRegisterEndpointsForCountry(country).some((item) => item.isRegisterDocument);
}
