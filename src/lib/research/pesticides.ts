/**
 * Country-specific pesticide verification.
 * Never call a product registered unless an authoritative local source says so.
 */

import { canonicalizeCountry } from "./countries";
import { sourceByDomain, trustPriority } from "./sources";
import {
  unverifiedRegistrationMessage,
  type ChemicalRecord,
  type PesticideCheck,
  type PesticideVerification,
  type SearchHit,
} from "./types";
import {
  findCountry,
  getCatalogueStore,
  getVerifiedRegionalInputs,
} from "@/lib/regional-inputs/catalogue";

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
    tradeName: extractTradeNameFromText(options.farmerText),
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

function extractTradeNameFromText(text: string): string | null {
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

const CHEMICAL_SEED: ChemicalRecord[] = [
  {
    country: "Trinidad and Tobago",
    crop: "tomato",
    targetPestOrDisease: "whiteflies",
    activeIngredient: "imidacloprid",
    tradeName: null,
    registrationStatus: "registered",
    registrationSource: "Trinidad input catalogue",
    sourceUrl: null,
    lastVerifiedAt: "2026-08-01T00:00:00.000Z",
  },
];

let extraChemicals: ChemicalRecord[] = [];

export function setChemicalRecordsForTests(rows: ChemicalRecord[] | null) {
  extraChemicals = rows ? [...rows] : [];
}

export function extractActiveIngredient(text: string): string | null {
  const lower = text.toLowerCase();
  const known = [
    "imidacloprid",
    "thiamethoxam",
    "acetamiprid",
    "spirotetramat",
    "abamectin",
    "mancozeb",
    "chlorothalonil",
    "copper hydroxide",
    "azoxystrobin",
    "glyphosate",
    "paraquat",
    "malathion",
    "lambda-cyhalothrin",
    "cypermethrin",
    "beauveria bassiana",
  ];
  for (const name of known) {
    if (lower.includes(name)) return name;
  }
  const labeled = text.match(
    /\b(?:active ingredient|a\.?i\.?)\s*[:\-]\s*([A-Za-z][A-Za-z0-9\- ]{2,40})/i,
  );
  return labeled?.[1]?.trim().toLowerCase() ?? null;
}

export function extractTradeName(text: string): string | null {
  const match = text.match(
    /\b(?:brand|trade name|product)\s*[:\-]\s*([A-Za-z][A-Za-z0-9\- ]{2,40})/i,
  );
  return match?.[1]?.trim() ?? null;
}

function recordsForCountry(country: string): ChemicalRecord[] {
  const needle = country.trim().toLowerCase();
  return [...CHEMICAL_SEED, ...extraChemicals].filter((row) => {
    const name = row.country.toLowerCase();
    return (
      name === needle ||
      (needle.includes("trinidad") && name.includes("trinidad")) ||
      (needle.includes("tobago") && name.includes("trinidad"))
    );
  });
}

/**
 * Country-specific pesticide verification.
 * Never copies Trinidad registration to Guyana, Barbados, Jamaica, etc.
 */
export function verifyPesticideForCountry(options: {
  country: string | null | undefined;
  crop?: string | null;
  issue?: string | null;
  activeIngredient?: string | null;
  tradeName?: string | null;
  message?: string;
}): PesticideVerification {
  const country = options.country?.trim() || "Trinidad and Tobago";
  const activeIngredient =
    options.activeIngredient?.trim().toLowerCase() ||
    extractActiveIngredient(options.message ?? "") ||
    null;
  const tradeName = options.tradeName ?? extractTradeName(options.message ?? "");

  const catalogue = getVerifiedRegionalInputs({
    country,
    crop: (options.crop || "tomato").toLowerCase(),
    issue: options.issue || activeIngredient || "general crop problem",
    forFarmerDisplay: true,
  });

  const store = getCatalogueStore();
  const countryRow = findCountry(store, country);
  const matchingOptions = catalogue.options.filter((option) => {
    if (!activeIngredient) return option.registrationStatus === "registered";
    return option.activeIngredientOrNutrient.toLowerCase().includes(activeIngredient);
  });

  const registered = matchingOptions.filter((option) => option.registrationStatus === "registered");
  const fromTable = activeIngredient
    ? recordsForCountry(country).filter(
        (row) =>
          row.activeIngredient.toLowerCase() === activeIngredient &&
          row.registrationStatus === "registered",
      )
    : [];

  const localTradeNames = [
    ...registered.flatMap((option) => option.verifiedBrands.map((brand) => brand.brandName)),
    ...fromTable.map((row) => row.tradeName).filter((name): name is string => Boolean(name)),
  ];

  const verified = registered.length > 0 || fromTable.length > 0;
  const top = registered[0];
  const tableRow = fromTable[0];

  if (!countryRow && catalogue.options.length === 0 && fromTable.length === 0) {
    return {
      country,
      activeIngredient,
      tradeName,
      verified: false,
      status: "unverified",
      localTradeNames: [],
      sourceName: null,
      sourceUrl: null,
      lastVerifiedAt: null,
      farmerMessage: unverifiedRegistrationMessage(country),
    };
  }

  if (!verified) {
    return {
      country,
      activeIngredient,
      tradeName,
      verified: false,
      status: "unverified",
      localTradeNames: [],
      sourceName: null,
      sourceUrl: null,
      lastVerifiedAt: null,
      farmerMessage: unverifiedRegistrationMessage(country),
    };
  }

  const ingredientLabel = activeIngredient || top?.activeIngredientOrNutrient || "this active ingredient";
  const names =
    localTradeNames.length > 0
      ? ` Local trade names on file: ${[...new Set(localTradeNames)].join(", ")}.`
      : " I can name the active ingredient, but a local trade name still needs a label check.";

  return {
    country,
    activeIngredient,
    tradeName,
    verified: true,
    status: "registered",
    localTradeNames: [...new Set(localTradeNames)],
    sourceName: top?.officialSource || tableRow?.registrationSource || "local registration catalogue",
    sourceUrl: top?.officialSource || tableRow?.sourceUrl || null,
    lastVerifiedAt: top?.lastVerifiedAt || tableRow?.lastVerifiedAt || null,
    farmerMessage: `${ingredientLabel} is listed as registered in ${country}.${names} Always read the local label before use.`,
  };
}

const APPROVAL_CLAIM =
  /\b(is|are|was|were)?\s*(registered|approved|legal|authorised|authorized)\s+(in|for)\s+([A-Za-z][A-Za-z\s]+)/gi;

/**
 * Strip invented country-approval claims when verification failed.
 */
export function sanitizeUnverifiedPesticideClaims(
  text: string,
  verification: PesticideVerification | null,
): string {
  if (!text.trim()) return text;
  if (verification?.verified) return text;

  let next = text;
  const country = verification?.country;
  if (country) {
    const escaped = country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(
      new RegExp(
        `\\b(registered|approved|legal)\\s+(in|for)\\s+${escaped}\\b`,
        "gi",
      ),
      "not confirmed as registered in " + country,
    );
  }
  next = next.replace(APPROVAL_CLAIM, (_match, _verb, _status, _in, place: string) => {
    const named = place.trim();
    if (verification && named && !countryMatches(named, verification.country) && verification.verified) {
      return `not confirmed as registered in ${named.trim()}`;
    }
    if (!verification?.verified) {
      return `not confirmed as registered in ${named.trim()}`;
    }
    return _match;
  });

  if (!verification?.verified && /\b(registered|approved)\b/i.test(text)) {
    const warning = verification?.farmerMessage ?? unverifiedRegistrationMessage(country || "your country");
    if (!next.includes("I cannot confirm")) {
      next = `${next.trim()} ${warning}`.trim();
    }
  }
  return next;
}

function countryMatches(left: string, right: string): boolean {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}
