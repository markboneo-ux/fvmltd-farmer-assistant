import {
  findCountry,
  getCatalogueStore,
  getVerifiedRegionalInputs,
} from "@/lib/regional-inputs/catalogue";
import { unverifiedRegistrationMessage, type ChemicalRecord, type PesticideVerification } from "./types";

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
  const country = options.country?.trim() || "";
  if (!country) {
    return {
      country: "",
      activeIngredient:
        options.activeIngredient?.trim().toLowerCase() ||
        extractActiveIngredient(options.message ?? "") ||
        null,
      tradeName: options.tradeName ?? extractTradeName(options.message ?? ""),
      verified: false,
      status: "unverified",
      localTradeNames: [],
      sourceName: null,
      sourceUrl: null,
      lastVerifiedAt: null,
      farmerMessage: "I need the country you are farming in before I can check local pesticide registration.",
    };
  }
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
      farmerMessage: unverifiedRegistrationMessage(country, options.crop),
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
      farmerMessage: unverifiedRegistrationMessage(country, options.crop),
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

  let next = text.replace(/\btherefore you can use it\.?/gi, "").replace(/\s{2,}/g, " ").trim();
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
    const warning =
      verification?.farmerMessage ?? unverifiedRegistrationMessage(country || "your country");
    if (!next.toLowerCase().includes("haven't verified registration") && !next.includes("I cannot confirm")) {
      next = `${next.trim()} ${warning}`.trim();
    }
  }
  next = stripOtherCountryRegistration(next, verification);
  return next;
}

function stripOtherCountryRegistration(
  text: string,
  verification: PesticideVerification | null,
): string {
  if (!verification?.country) return text;
  const here = verification.country.toLowerCase();
  return text.replace(
    /\b(registered|approved|legal)\s+in\s+(Trinidad(?:\s+and\s+Tobago)?|Tobago|Guyana|Jamaica|Barbados|Grenada|Saint Lucia)[^.]*therefore you can use it/gi,
    `not verified as registered in ${verification.country}`,
  ).replace(
    new RegExp(
      `\\b(registered|approved)\\s+in\\s+(?!${verification.country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})([A-Z][A-Za-z\\s]{2,30})\\b`,
      "gi",
    ),
    (_match, _status, other: string) => {
      if (other.trim().toLowerCase() === here) return _match;
      return `not a substitute for registration in ${verification.country}`;
    },
  );
}

function countryMatches(left: string, right: string): boolean {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}
