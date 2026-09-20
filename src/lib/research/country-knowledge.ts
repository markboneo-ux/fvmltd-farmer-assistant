/**
 * Retrieval hooks for verified country-specific agronomic sources.
 * Official regulators and ministries first; never borrow another country's register.
 */

import {
  localOfficialSources,
  researchTargetsForNeed,
  sourcesForCountry,
} from "./trusted-sources";
import type { CatalogTrustedSource, SourceCategory } from "./types";

export type CountryKnowledgeHook = {
  country: string | null;
  purpose:
    | "pesticide_registration"
    | "product_label"
    | "agronomic_guidance"
    | "extension"
    | "research";
  sources: Array<{
    id: string;
    name: string;
    url: string;
    country: string;
    category: SourceCategory;
    trustLevel: CatalogTrustedSource["trustLevel"];
  }>;
  crossCountryPesticideUseForbidden: true;
};

const PURPOSE_CATEGORY: Record<CountryKnowledgeHook["purpose"], SourceCategory> = {
  pesticide_registration: "pesticide_registration",
  product_label: "manufacturer_label",
  agronomic_guidance: "government_guidance",
  extension: "extension",
  research: "research",
};

export function countryKnowledgeHooks(options: {
  country: string | null;
  purpose?: CountryKnowledgeHook["purpose"];
  crop?: string | null;
  pestOrDisease?: string | null;
}): CountryKnowledgeHook {
  const purpose = options.purpose ?? "agronomic_guidance";
  const category = PURPOSE_CATEGORY[purpose];
  const need =
    purpose === "pesticide_registration" || purpose === "product_label"
      ? "pesticide_registration"
      : purpose === "research"
        ? "government_guidance"
        : purpose === "extension"
          ? "extension"
          : "government_guidance";

  const ranked = researchTargetsForNeed(options.country, category, need);
  const fallback =
    ranked.length > 0
      ? ranked
      : [
          ...localOfficialSources(options.country, category),
          ...sourcesForCountry(options.country).filter(
            (source) =>
              source.category === "research" ||
              source.category === "government_guidance" ||
              source.category === "extension",
          ),
        ];

  const seen = new Set<string>();
  const sources = fallback
    .filter((source) => {
      if (seen.has(source.id)) return false;
      if (
        (purpose === "pesticide_registration" || purpose === "product_label") &&
        source.category === "pesticide_registration" &&
        options.country?.trim() &&
        source.country !== "Caribbean" &&
        source.country !== "International" &&
        source.country.toLowerCase() !== options.country.trim().toLowerCase() &&
        !(
          options.country.toLowerCase().includes("trinidad") &&
          source.country === "Trinidad and Tobago"
        )
      ) {
        return false;
      }
      seen.add(source.id);
      return true;
    })
    .slice(0, 5)
    .map((source) => ({
      id: source.id,
      name: source.name,
      url: source.url,
      country: source.country,
      category: source.category,
      trustLevel: source.trustLevel,
    }));

  return {
    country: options.country,
    purpose,
    sources,
    crossCountryPesticideUseForbidden: true,
  };
}

export function countryKnowledgeNotesForPrompt(hook: CountryKnowledgeHook): string {
  if (hook.sources.length === 0) {
    return `COUNTRY KNOWLEDGE HOOKS: No verified ${hook.purpose.replace(/_/g, " ")} source is attached for ${hook.country || "this country"}. Do not invent registrations, labels, rates, PHIs or REIs.`;
  }
  const lines = [
    `COUNTRY KNOWLEDGE HOOKS for ${hook.country || "unknown country"} (${hook.purpose.replace(/_/g, " ")}):`,
    "Prefer these verified sources. A pesticide registered in one Caribbean country is not registered in another unless that country's own source says so.",
  ];
  for (const source of hook.sources) {
    lines.push(`- ${source.name} [${source.trustLevel}] ${source.url}`);
  }
  return lines.join("\n");
}
