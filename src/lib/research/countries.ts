/**
 * Canonical Caribbean country names and aliases.
 * Never default an unknown country to Trinidad and Tobago.
 */

export const RESEARCH_COUNTRIES = [
  "Trinidad and Tobago",
  "Guyana",
  "Jamaica",
  "Barbados",
  "Grenada",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Antigua and Barbuda",
  "Dominica",
  "Saint Kitts and Nevis",
  "Belize",
  "Bahamas",
  "Suriname",
  "Anguilla",
  "British Virgin Islands",
] as const;

export type ResearchCountry = (typeof RESEARCH_COUNTRIES)[number];

const ALIASES: Array<{ name: ResearchCountry; pattern: RegExp }> = [
  { name: "Trinidad and Tobago", pattern: /\b(trinidad(?:\s+and\s+tobago)?|tobago|trinbago|t&t)\b/i },
  { name: "Guyana", pattern: /\bguyana\b/i },
  { name: "Jamaica", pattern: /\bjamaica\b/i },
  { name: "Barbados", pattern: /\bbarbados\b/i },
  { name: "Grenada", pattern: /\bgrenada\b/i },
  { name: "Saint Lucia", pattern: /\b(saint\s+lucia|st\.?\s*lucia)\b/i },
  {
    name: "Saint Vincent and the Grenadines",
    pattern: /\b(saint\s+vincent(?:\s+and\s+the\s+grenadines)?|st\.?\s*vincent|svg)\b/i,
  },
  { name: "Antigua and Barbuda", pattern: /\b(antigua(?:\s+and\s+barbuda)?|barbuda)\b/i },
  { name: "Dominica", pattern: /\bdominica\b/i },
  {
    name: "Saint Kitts and Nevis",
    pattern: /\b(saint\s+kitts(?:\s+and\s+nevis)?|st\.?\s*kitts|nevis)\b/i,
  },
  { name: "Belize", pattern: /\bbelize\b/i },
  { name: "Bahamas", pattern: /\b(bahamas|the\s+bahamas)\b/i },
  { name: "Suriname", pattern: /\bsuriname\b/i },
  { name: "Anguilla", pattern: /\banguilla\b/i },
  { name: "British Virgin Islands", pattern: /\b(british\s+virgin\s+islands|bvi)\b/i },
];

/** Districts that uniquely imply Trinidad and Tobago. */
const TT_ONLY_DISTRICTS =
  /\b(couva|chaguanas|arima|san\s+fernando|port\s+of\s+spain|sangre\s+grande|point\s+fortin|tunapuna|penal|debe|princes\s+town|rio\s+claro|mayaro|siparia|diego\s+martin|toco|cedros|macoya)\b/i;

export const ASK_COUNTRY_QUESTION = "What country are you farming in?";

export function isResearchCountry(value: string | null | undefined): value is ResearchCountry {
  if (!value) return false;
  return (RESEARCH_COUNTRIES as readonly string[]).includes(value);
}

export function canonicalizeCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isResearchCountry(trimmed)) return trimmed;
  const extracted = extractCountryFromText(trimmed);
  return extracted ?? trimmed;
}

export function extractCountryFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const item of ALIASES) {
    if (item.pattern.test(trimmed)) return item.name;
  }
  if (TT_ONLY_DISTRICTS.test(trimmed)) return "Trinidad and Tobago";
  return null;
}

export function countriesShareIdentity(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return canonicalizeCountry(a)?.toLowerCase() === canonicalizeCountry(b)?.toLowerCase();
}
