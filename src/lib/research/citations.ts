/**
 * Farmer-facing source lines. Prefer source names over raw URLs.
 * Chat UI shows a collapsed Sources used list; do not dump names into the answer body.
 */

import type { SourceCategory, WebCitation, WebSourceCitation } from "./types";

export function farmerFacingCitations(citations: WebCitation[]): string {
  if (citations.length === 0) return "";
  const lines = citations.map((item) => `- ${item.sourceName} — ${citationHint(item)}`);
  return `Sources:\n${lines.join("\n")}`;
}

function citationHint(item: WebCitation): string {
  if (item.evidenceType === "product_listing") return "pesticide product listing";
  if (item.evidenceType === "official_register" || item.evidenceType === "official_register_pdf") {
    return "official pesticide register";
  }
  if (item.evidenceType === "approved_product_list") return "approved pesticide product list";
  if (item.evidenceType === "regulator_portal") return "official pesticide listing portal";
  if (item.sourceType === "market_data") return "market information";
  if (item.sourceType === "regulator") return "pesticide / chemical information";
  if (item.sourceType === "government") return "crop guidance";
  if (item.sourceType === "extension") return "extension guidance";
  if (item.sourceType === "university" || item.sourceType === "research_institute") {
    return "research / technical guidance";
  }
  return item.title || "public source";
}

export function citationToUiSource(item: WebCitation): WebSourceCitation {
  return {
    name: item.sourceName,
    url: item.url,
    organization: item.sourceName,
    publishedAt: item.publishedAt,
    checkedAt: item.retrievedAt,
    category:
      item.sourceType === "regulator"
        ? "pesticide_registration"
        : item.sourceType === "market_data"
          ? "market_prices"
          : item.sourceType === "research_institute" || item.sourceType === "university"
            ? "research"
            : item.sourceType === "extension"
              ? "extension"
              : "other",
    trustLevel: "official",
    supported: citationHint(item),
  };
}

export function formatFarmerSources(citations: WebSourceCitation[]): string {
  if (citations.length === 0) return "";
  return "";
}

export function dedupeCitations(citations: WebSourceCitation[]): WebSourceCitation[] {
  const seen = new Set<string>();
  const result: WebSourceCitation[] = [];
  for (const item of citations) {
    const key = (item.url || item.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      ...item,
      organization: item.organization || item.name,
    });
  }
  return result;
}

const SENSITIVE_CATEGORIES = new Set<SourceCategory>([
  "market_prices",
  "pesticide_registration",
  "manufacturer_label",
  "government_guidance",
  "regulatory",
  "pest_alerts",
  "financing",
]);

export function sourceVerificationLine(
  citations: WebSourceCitation[],
  country: string | null | undefined,
): string | null {
  if (citations.length === 0) return null;
  const sensitive = citations.some(
    (item) => item.category && SENSITIVE_CATEGORIES.has(item.category),
  );
  if (!sensitive) return null;
  const place = country?.trim();
  if (place) return `Checked against ${place} official sources.`;
  return "Checked against official sources.";
}

export function stripCitedSourceNames(
  text: string,
  citations: WebSourceCitation[],
): string {
  if (!text.trim() || citations.length === 0) return text;
  let next = text;
  for (const source of citations) {
    const names = [source.name, source.organization].filter(
      (value): value is string => Boolean(value && value.trim().length > 3),
    );
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const candidate = next
        .replace(new RegExp(`\\b${escaped}\\b`, "gi"), "")
        .replace(/\s{2,}/g, " ")
        .replace(/\s+([.,;:])/g, "$1")
        .trim();
      if (hasEmptyOrganizationSentence(candidate) && !hasEmptyOrganizationSentence(next)) {
        continue;
      }
      next = candidate;
    }
  }
  return repairEmptyOrganizationSentences(next);
}

const EMPTY_ORG_VERB =
  /\bthe\s+(maintains|provides|lists|publishes|issues|regulates|keeps)\b/gi;

export function repairEmptyOrganizationSentences(text: string): string {
  return text
    .replace(EMPTY_ORG_VERB, "the official regulator $1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function hasEmptyOrganizationSentence(text: string): boolean {
  return /\bthe\s+(maintains|provides|lists|publishes|issues|regulates|keeps)\b/i.test(
    text,
  );
}

const SUPPORT_LABEL: Record<SourceCategory, string> = {
  market_prices: "market prices",
  pesticide_registration: "pesticide registration",
  manufacturer_label: "product label",
  government_guidance: "government guidance",
  research: "agronomic research",
  extension: "extension guidance",
  weather: "weather",
  financing: "financing",
  pest_alerts: "pest alert",
  regulatory: "regulation",
  other: "background",
};

export function supportLabelForCategory(category?: SourceCategory | null): string | null {
  if (!category) return null;
  return SUPPORT_LABEL[category] ?? null;
}

export function enrichCitations(citations: WebSourceCitation[]): WebSourceCitation[] {
  return dedupeCitations(citations).map((item) => ({
    ...item,
    organization: item.organization || item.name,
    publishedAt: item.publishedAt ?? null,
    checkedAt: item.checkedAt ?? item.publishedAt ?? null,
    supported: item.supported ?? supportLabelForCategory(item.category),
  }));
}
