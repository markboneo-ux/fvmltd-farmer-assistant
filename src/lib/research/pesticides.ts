/**
 * Country-specific pesticide verification.
 * Never call a product registered unless an authoritative local source says so.
 */

import { canonicalizeCountry } from "./countries";
import { sourceByDomain, trustPriority } from "./sources";
import type { PesticideCheck, SearchHit } from "./types";

export const UNVERIFIED_CHEMICAL_TEMPLATE = (country: string) =>
  `I cannot confirm that this active ingredient/product is registered for this crop in ${country}. Check the current local label or regulator before applying it.`;

const INGREDIENT_HINTS: Array<{ name: string; pattern: RegExp }> = [
  { name: "imidacloprid", pattern: /\bimidacloprid\b/i },
  { name: "acetamiprid", pattern: /\bacetamiprid\b/i },
  { name: "thiamethoxam", pattern: /\bthiamethoxam\b/i },
  { name: "lambda-cyhalothrin", pattern: /\blambda[-\s]?cyhalothrin\b/i },
  { name: "cypermethrin", pattern: /\bcypermethrin\b/i },
  { name: "mancozeb", pattern: /\bmancozeb\b/i },
  { name: "chlorothalonil", pattern: /\bchlorothalonil\b/i },
  { name: "copper hydroxide", pattern: /\bcopper hydroxide\b/i },
  { name: "glyphosate", pattern: /\bglyphosate\b/i },
  { name: "abamectin", pattern: /\babamectin\b/i },
  { name: "spinosad", pattern: /\bspinosad\b/i },
  { name: "azadirachtin", pattern: /\b(azadirachtin|neem)\b/i },
  { name: "malathion", pattern: /\bmalathion\b/i },
];

const RATE_PATTERN =
  /\b(\d+(?:\.\d+)?\s*(?:ml|g|kg|l|oz)\s*(?:\/|per)\s*(?:l|litre|liter|ha|acre|gal))\b/i;
const PHI_PATTERN = /\b(?:PHI|pre-?harvest interval)\s*(?:of|:)?\s*(\d+\s*days?)\b/i;
const REI_PATTERN = /\b(?:REI|re-?entry)\s*(?:of|:)?\s*(\d+\s*hours?|\d+\s*days?)\b/i;

export function extractPossibleIngredient(text: string): string | null {
  for (const item of INGREDIENT_HINTS) {
    if (item.pattern.test(text)) return item.name;
  }
  const generic = text.match(
    /\b(active ingredient|a\.?i\.?)\s*(?:is|:)?\s*([A-Za-z][A-Za-z-]{3,})\b/i,
  );
  return generic?.[2]?.toLowerCase() ?? null;
}

export function pesticideCheckFromEvidence(options: {
  crop: string | null;
  pestOrDisease: string | null;
  country: string | null;
  farmerText: string;
  hits: SearchHit[];
}): PesticideCheck {
  const country = canonicalizeCountry(options.country);
  const ingredient =
    extractPossibleIngredient(options.farmerText) ||
    extractPossibleIngredient(options.hits.map((hit) => `${hit.title} ${hit.snippet}`).join(" "));

  const verifiedHit = country
    ? options.hits.find((hit) => hitSupportsRegistration(hit, country, ingredient))
    : undefined;

  const verified = Boolean(verifiedHit);
  const source = verifiedHit ? sourceByDomain(verifiedHit.domain) : null;

  const farmerNote = country
    ? verified
      ? `Country status is verified from ${source?.sourceName ?? verifiedHit?.title ?? "an official source"} for ${country}. Still read the current local label before applying anything.`
      : UNVERIFIED_CHEMICAL_TEMPLATE(country)
    : "I need the country before I can check whether a product is registered.";

  return {
    crop: options.crop,
    pestOrDisease: options.pestOrDisease,
    country,
    activeIngredient: ingredient,
    tradeName: extractTradeName(options.farmerText),
    verified,
    countryStatus: verified ? "verified" : "not_verified",
    sourceName: source?.sourceName ?? null,
    sourceUrl: verifiedHit?.url ?? null,
    use: options.pestOrDisease,
    rate: verified ? extractRate(verifiedHit?.snippet ?? "") : null,
    phi: verified ? extractPhi(verifiedHit?.snippet ?? "") : null,
    rei: verified ? extractRei(verifiedHit?.snippet ?? "") : null,
    farmerNote,
  };
}

function hitSupportsRegistration(
  hit: SearchHit,
  country: string,
  ingredient: string | null,
): boolean {
  const source = sourceByDomain(hit.domain);
  if (!source || !source.active) return false;
  if (source.country !== "regional" && source.country.toLowerCase() !== country.toLowerCase()) {
    return false;
  }
  if (source.sourceType !== "regulator" && source.sourceType !== "government") {
    return false;
  }
  if (trustPriority(source.sourceType, source.trustLevel) > 2) return false;
  const blob = `${hit.title} ${hit.snippet}`.toLowerCase();
  if (!ingredient) return false;
  if (!blob.includes(ingredient.toLowerCase())) return false;
  return /\b(registered|approved|on the register|registration number)\b/i.test(blob);
}

function extractTradeName(text: string): string | null {
  const match = text.match(/\b(?:brand|trade name|product)\s+([A-Z][A-Za-z0-9-]+)\b/);
  return match?.[1] ?? null;
}

function extractRate(text: string): string | null {
  return text.match(RATE_PATTERN)?.[1] ?? null;
}

function extractPhi(text: string): string | null {
  return text.match(PHI_PATTERN)?.[1] ?? null;
}

function extractRei(text: string): string | null {
  return text.match(REI_PATTERN)?.[1] ?? null;
}

export function formatPesticideBlock(check: PesticideCheck): string {
  const country = check.country || "the country you are farming in";
  return [
    `Possible active ingredient: ${check.activeIngredient || "not identified yet"}`,
    `Use: ${check.use || "the pest or disease you asked about"}`,
    `Country status: ${check.verified ? "Verified" : "not verified"}`,
    `Source: ${check.sourceName || "no official local source confirmed"}`,
    check.farmerNote,
    check.verified && check.rate
      ? `Rate from official source: ${check.rate}`
      : "Do not invent a spray rate, PHI, or re-entry interval.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function trinidadCannotProveGuyana(options: {
  questionCountry: string | null;
  sourceCountry: string | null;
}): boolean {
  const question = canonicalizeCountry(options.questionCountry);
  const source = canonicalizeCountry(options.sourceCountry);
  if (!question || !source) return false;
  return question === "Guyana" && source === "Trinidad and Tobago";
}
