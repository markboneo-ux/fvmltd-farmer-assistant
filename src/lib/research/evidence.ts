/**
 * Regulatory evidence quality. A ministry or regulator homepage is not enough
 * to claim a product is registered, approved, or legal for a crop.
 */

import type { SourceType } from "./types";

export const EVIDENCE_TYPES = [
  "ministry_homepage",
  "regulator_homepage",
  "regulator_portal",
  "official_publication_index",
  "official_register",
  "official_register_pdf",
  "approved_product_list",
  "product_listing",
  "crop_label",
  "regulatory_notice",
  "regional_research",
  "international_agronomy",
  "manufacturer_label",
  "other",
] as const;

export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const REGULATORY_CONFIDENCE = [
  "verified_country_register",
  "supporting_official",
  "insufficient",
  "none",
] as const;

export type RegulatoryConfidence = (typeof REGULATORY_CONFIDENCE)[number];

export type RegulatoryEvidence = {
  country: string | null;
  organization: string;
  sourceTitle: string;
  sourceUrl: string;
  publicationDate: string | null;
  retrievedDate: string;
  evidenceType: EvidenceType;
  regulatoryConfidence: RegulatoryConfidence;
  sufficientForRegisterLocation: boolean;
  sufficientForProductClaim: boolean;
};

const PRODUCT_DATA =
  /\b(ttpr\d|registration number|status\s*registered|active ingredients?|product name|trade name)\b/i;

const REGISTER_SIGNAL =
  /\b(pesticide register|register of (pesticides|chemicals)|list of pesticide products|approved pesticide|registered pesticide products?)\b/i;

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return "/";
  }
}

export function isHomepagePath(url: string): boolean {
  const path = pathnameOf(url).toLowerCase();
  return (
    path === "/" ||
    path === "" ||
    path === "/index" ||
    path === "/home" ||
    path === "/en" ||
    path === "/en/home"
  );
}

export function hasPesticideRegisterData(options: {
  url: string;
  title: string;
  text: string;
}): boolean {
  const blob = `${options.title} ${options.text}`.toLowerCase();
  const url = options.url.toLowerCase();
  if (/\/cfdd\/pesticides\/search\/\d+/.test(url) && PRODUCT_DATA.test(blob)) return true;
  if (/\.pdf(\?|$)/i.test(url) && REGISTER_SIGNAL.test(blob) && PRODUCT_DATA.test(blob)) {
    return true;
  }
  return PRODUCT_DATA.test(blob) && /\b(registered|approved|on the register)\b/i.test(blob);
}

export function classifyEvidenceType(options: {
  url: string;
  title: string;
  text: string;
  sourceType?: SourceType | null;
  sourceCountry?: string | null;
}): EvidenceType {
  const url = options.url.toLowerCase();
  const blob = `${options.title} ${options.text}`.toLowerCase();
  const sourceType = options.sourceType ?? "other";
  const path = pathnameOf(options.url).toLowerCase();

  if (sourceType === "research_institute" || sourceType === "university") {
    return options.sourceCountry === "regional" ? "regional_research" : "international_agronomy";
  }
  if (sourceType === "manufacturer_label") return "manufacturer_label";

  if (hasPesticideRegisterData(options)) {
    if (/\/cfdd\/pesticides\/search\/\d+/.test(url) || /pesticide - /i.test(options.title)) {
      return "product_listing";
    }
    if (/\.pdf(\?|$)/i.test(url)) return "official_register_pdf";
    return "official_register";
  }

  if (
    hasPesticideRegisterData(options) &&
    (/\/cfdd\/pesticides\/search\/\d+/.test(url) || /pesticide - /i.test(options.title))
  ) {
    return "product_listing";
  }
  if (/\.pdf(\?|$)/i.test(url) && REGISTER_SIGNAL.test(blob)) {
    return "official_register_pdf";
  }
  if (REGISTER_SIGNAL.test(blob) && PRODUCT_DATA.test(blob) && !isHomepagePath(options.url)) {
    return blob.includes("list of pesticide") ? "approved_product_list" : "official_register";
  }
  if (/crop.?label|specimen label|product label/i.test(blob) && PRODUCT_DATA.test(blob)) {
    return "crop_label";
  }
  if (/public notice|gazette|registration of pesticides/i.test(blob) && /pesticide/i.test(blob)) {
    return "regulatory_notice";
  }
  if (/\/cfdd\/portal\/?$/.test(path) || /cfdd portal/i.test(blob)) {
    return "regulator_portal";
  }
  if (
    /chemistry, food and drugs|list of pesticide products for publication|registration of pesticides/i.test(
      blob,
    ) &&
    /pesticide/i.test(blob)
  ) {
    return "official_publication_index";
  }
  if (isHomepagePath(options.url)) {
    if (sourceType === "regulator") return "regulator_homepage";
    if (sourceType === "government" || sourceType === "extension") return "ministry_homepage";
  }
  if (sourceType === "regulator") return "regulator_homepage";
  if (sourceType === "government") return "ministry_homepage";
  return "other";
}

export function regulatoryConfidenceFor(evidenceType: EvidenceType): RegulatoryConfidence {
  switch (evidenceType) {
    case "official_register":
    case "official_register_pdf":
    case "approved_product_list":
    case "product_listing":
    case "crop_label":
      return "verified_country_register";
    case "regulator_portal":
    case "official_publication_index":
    case "regulatory_notice":
      return "supporting_official";
    case "ministry_homepage":
    case "regulator_homepage":
    case "regional_research":
    case "international_agronomy":
    case "manufacturer_label":
    case "other":
      return "insufficient";
    default:
      return "none";
  }
}

export function evidenceSupportsRegisterLocation(evidenceType: EvidenceType): boolean {
  return (
    evidenceType === "official_register" ||
    evidenceType === "official_register_pdf" ||
    evidenceType === "approved_product_list" ||
    evidenceType === "product_listing"
  );
}

export function evidenceSupportsProductClaim(evidenceType: EvidenceType): boolean {
  return (
    evidenceType === "official_register" ||
    evidenceType === "official_register_pdf" ||
    evidenceType === "approved_product_list" ||
    evidenceType === "product_listing" ||
    evidenceType === "crop_label"
  );
}

export function classifyRegulatoryEvidence(options: {
  url: string;
  title: string;
  text: string;
  country?: string | null;
  organization?: string | null;
  sourceType?: SourceType | null;
  sourceCountry?: string | null;
  retrievedAt?: string | null;
  publishedAt?: string | null;
}): RegulatoryEvidence {
  const evidenceType = classifyEvidenceType(options);
  const confidence = regulatoryConfidenceFor(evidenceType);
  return {
    country: options.country ?? options.sourceCountry ?? null,
    organization: options.organization || options.title || "unknown source",
    sourceTitle: options.title,
    sourceUrl: options.url,
    publicationDate: options.publishedAt ?? null,
    retrievedDate: options.retrievedAt || new Date().toISOString(),
    evidenceType,
    regulatoryConfidence: confidence,
    sufficientForRegisterLocation: evidenceSupportsRegisterLocation(evidenceType),
    sufficientForProductClaim: evidenceSupportsProductClaim(evidenceType) && hasPesticideRegisterData(options),
  };
}

export function isHomepageOnlyEvidence(evidence: RegulatoryEvidence): boolean {
  return (
    evidence.evidenceType === "ministry_homepage" ||
    evidence.evidenceType === "regulator_homepage"
  );
}
