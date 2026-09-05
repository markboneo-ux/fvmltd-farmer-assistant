/**
 * Lightweight farmer context learned gradually from conversation.
 * Inferred values are never treated as certain unless confirmed.
 */

import { COUNTRY_OPTIONS } from "@/data/countries";
import type { UserLevel } from "@/lib/beta/identity";
import { extractLastCrop } from "./crops";
import {
  isBusinessIntent,
  isCalculationIntent,
  type IntentCategory,
} from "./intents";

export const FARMER_LEVELS = [
  "HOME_GARDENER",
  "SMALL_FARMER",
  "COMMERCIAL_FARMER",
  "TECHNICAL_USER",
  "AGRONOMIST",
] as const;

export type FarmerLevel = (typeof FARMER_LEVELS)[number];

export type ContextConfidence = "inferred" | "confirmed";

export type FarmerContextValue<T> = {
  value: T | null;
  confidence: ContextConfidence | null;
};

export type FarmerContext = {
  country: FarmerContextValue<string>;
  region: FarmerContextValue<string>;
  farmerLevel: FarmerContextValue<FarmerLevel>;
  mainCrops: string[];
  farmScale: FarmerContextValue<string>;
  productionSystem: FarmerContextValue<string>;
  knownVarieties: Record<string, string>;
  irrigationType: FarmerContextValue<string>;
  protectedOrOpen: FarmerContextValue<"protected" | "open_field">;
  commonRecurringIssues: string[];
};

export const ASK_COUNTRY_QUESTION = "What country are you farming in?";

const COUNTRY_ALIASES: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\b(trinidad\s*(and|&)?\s*tobago|tobago|t&t)\b/i, name: "Trinidad and Tobago" },
  { pattern: /\bguyana\b/i, name: "Guyana" },
  { pattern: /\bgrenada\b/i, name: "Grenada" },
  { pattern: /\b(saint|st\.?)\s+lucia\b/i, name: "Saint Lucia" },
  { pattern: /\bsuriname\b/i, name: "Suriname" },
  { pattern: /\b(the\s+)?bahamas\b/i, name: "The Bahamas" },
  { pattern: /\bbarbados\b/i, name: "Barbados" },
  { pattern: /\bjamaica\b/i, name: "Jamaica" },
  { pattern: /\bantigua(\s+and\s+barbuda)?\b/i, name: "Antigua and Barbuda" },
  { pattern: /\b(saint|st\.?)\s+kitts(\s+and\s+nevis)?\b/i, name: "Saint Kitts and Nevis" },
  { pattern: /\bbelize\b/i, name: "Belize" },
  { pattern: /\b(saint|st\.?)\s+vincent(\s+and\s+the\s+grenadines)?\b/i, name: "Saint Vincent and the Grenadines" },
  { pattern: /\bdominica\b/i, name: "Dominica" },
  { pattern: /\bhaiti\b/i, name: "Haiti" },
  { pattern: /\bmontserrat\b/i, name: "Montserrat" },
  { pattern: /\banguilla\b/i, name: "Anguilla" },
  { pattern: /\b(british\s+virgin\s+islands|bvi)\b/i, name: "British Virgin Islands" },
  { pattern: /\bcayman\s+islands\b/i, name: "Cayman Islands" },
  { pattern: /\bturks\s+and\s+caicos\b/i, name: "Turks and Caicos Islands" },
  { pattern: /\bbermuda\b/i, name: "Bermuda" },
  { pattern: /\baruba\b/i, name: "Aruba" },
  { pattern: /\bcura(ç|c)ao\b/i, name: "Curaçao" },
  { pattern: /\bsint\s+maarten\b/i, name: "Sint Maarten" },
  { pattern: /\bdominican\s+republic\b/i, name: "Dominican Republic" },
  { pattern: /\bpuerto\s+rico\b/i, name: "Puerto Rico" },
];

/** Districts/regions unique enough to imply a country. */
const REGION_TO_COUNTRY: Array<{ pattern: RegExp; region: string; country: string }> = [
  { pattern: /\b(central|north|south|east|west)\s+trinidad\b/i, region: "Central Trinidad", country: "Trinidad and Tobago" },
  { pattern: /\bcouva\b/i, region: "Couva", country: "Trinidad and Tobago" },
  { pattern: /\bchaguanas\b/i, region: "Chaguanas", country: "Trinidad and Tobago" },
  { pattern: /\barima\b/i, region: "Arima", country: "Trinidad and Tobago" },
  { pattern: /\bsan\s+fernando\b/i, region: "San Fernando", country: "Trinidad and Tobago" },
  { pattern: /\bport\s+of\s+spain\b/i, region: "Port of Spain", country: "Trinidad and Tobago" },
  { pattern: /\bsangre\s+grande\b/i, region: "Sangre Grande", country: "Trinidad and Tobago" },
  { pattern: /\bpoint\s+fortin\b/i, region: "Point Fortin", country: "Trinidad and Tobago" },
  { pattern: /\btunapuna\b/i, region: "Tunapuna", country: "Trinidad and Tobago" },
  { pattern: /\bpenal\b/i, region: "Penal", country: "Trinidad and Tobago" },
  { pattern: /\bdebe\b/i, region: "Debe", country: "Trinidad and Tobago" },
  { pattern: /\bprinces\s+town\b/i, region: "Princes Town", country: "Trinidad and Tobago" },
  { pattern: /\brio\s+claro\b/i, region: "Rio Claro", country: "Trinidad and Tobago" },
  { pattern: /\bmayaro\b/i, region: "Mayaro", country: "Trinidad and Tobago" },
  { pattern: /\bsiparia\b/i, region: "Siparia", country: "Trinidad and Tobago" },
  { pattern: /\bdiego\s+martin\b/i, region: "Diego Martin", country: "Trinidad and Tobago" },
  { pattern: /\btoco\b/i, region: "Toco", country: "Trinidad and Tobago" },
  { pattern: /\bcedros\b/i, region: "Cedros", country: "Trinidad and Tobago" },
  { pattern: /\bberbice\b/i, region: "Berbice", country: "Guyana" },
  { pattern: /\bessequibo\b/i, region: "Essequibo", country: "Guyana" },
  { pattern: /\bdemerara\b/i, region: "Demerara", country: "Guyana" },
  { pattern: /\bgeorgetown\b/i, region: "Georgetown", country: "Guyana" },
  { pattern: /\blinden\b/i, region: "Linden", country: "Guyana" },
  { pattern: /\bst\.?\s*george.?s?,?\s+grenada\b/i, region: "St George", country: "Grenada" },
  { pattern: /\b(st\.?\s*george|saint\s+george),?\s+grenada\b/i, region: "St George", country: "Grenada" },
  { pattern: /\bcarriacou\b/i, region: "Carriacou", country: "Grenada" },
  { pattern: /\bmontego\s+bay\b/i, region: "Montego Bay", country: "Jamaica" },
  { pattern: /\bkingston\b/i, region: "Kingston", country: "Jamaica" },
  { pattern: /\bst\.?\s*catherine\b/i, region: "St Catherine", country: "Jamaica" },
  { pattern: /\bclarendon\b/i, region: "Clarendon", country: "Jamaica" },
  { pattern: /\bcastries\b/i, region: "Castries", country: "Saint Lucia" },
  { pattern: /\bvieux\s+fort\b/i, region: "Vieux Fort", country: "Saint Lucia" },
  { pattern: /\bbridgetown\b/i, region: "Bridgetown", country: "Barbados" },
];

const TECHNICAL_VOCAB =
  /\b(frac|irac|hrac|phi\b|r\.?e\.?i\.?|pre-?harvest interval|re-?entry|epidemiolog|differential diagnosis|active ingredient|a\.i\.|electrical conductivity|\bec\b|ds\/m|ppm|meq|cation exchange|nutrient interaction|vascular wilt|conidia|sporangia|systemic acquired|tank-mix compatibility|label rate)\b/i;

const AGRONOMIST_ROLE =
  /\b(agronomist|plant patholog|crop (advisor|consultant|scientist)|extension (officer|agent|specialist))\b/i;

const COMMERCIAL_CUES =
  /\b(commercial\s+(farmer|grower|farm|production|field|greenhouse)|packing\s*house|export|boom\s*sprayer|fertigation|spray\s+programme|spray\s+program)\b/i;

const HOME_CUES =
  /\b(home|backyard|kitchen)\s+(garden|gardener|grower|plants?|crop)|pots?\s+on\s+(the\s+)?(porch|balcony)|container\s+garden|balcony\s+plants?\b/i;

const SMALL_FARM_CUES =
  /\b(smallholder|small\s+(farm|farmer|plot|holder)|market\s+garden|beds?\s+of)\b/i;

function valued<T>(value: T | null, confidence: ContextConfidence | null): FarmerContextValue<T> {
  return { value, confidence: value ? confidence : null };
}

export function emptyFarmerContext(): FarmerContext {
  return {
    country: { value: null, confidence: null },
    region: { value: null, confidence: null },
    farmerLevel: { value: null, confidence: null },
    mainCrops: [],
    farmScale: { value: null, confidence: null },
    productionSystem: { value: null, confidence: null },
    knownVarieties: {},
    irrigationType: { value: null, confidence: null },
    protectedOrOpen: { value: null, confidence: null },
    commonRecurringIssues: [],
  };
}

export function titleCaseRegion(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function extractCountryName(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const alias of COUNTRY_ALIASES) {
    if (alias.pattern.test(trimmed)) return alias.name;
  }
  for (const option of COUNTRY_OPTIONS) {
    if (option.startsWith("Other")) continue;
    if (new RegExp(`\\b${option.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(trimmed)) {
      return option;
    }
  }
  return null;
}

export function extractRegionAndCountry(text: string): {
  region: string | null;
  country: string | null;
  countryFromRegion: boolean;
} {
  const country = extractCountryName(text);
  for (const row of REGION_TO_COUNTRY) {
    const match = text.match(row.pattern);
    if (!match) continue;
    let region = row.region;
    if (/central|north|south|east|west/i.test(match[0]) && /trinidad/i.test(match[0])) {
      region = titleCaseRegion(match[0]);
    }
    return {
      region,
      country: country ?? row.country,
      countryFromRegion: !country,
    };
  }
  return { region: null, country, countryFromRegion: false };
}

export function inferFarmerLevel(text: string): {
  level: FarmerLevel | null;
  confidence: ContextConfidence | null;
} {
  const lower = text.toLowerCase();

  if (AGRONOMIST_ROLE.test(lower)) {
    if (/\bagronomist|plant patholog|crop (advisor|consultant|scientist)\b/i.test(lower)) {
      return { level: "AGRONOMIST", confidence: "confirmed" };
    }
    return { level: "TECHNICAL_USER", confidence: "confirmed" };
  }

  if (TECHNICAL_VOCAB.test(lower)) {
    return { level: "TECHNICAL_USER", confidence: "inferred" };
  }

  const areaMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(acres?|hectares?|ha)\b/);
  const plantCount = lower.match(/\b(\d+)\s*(plants?|pots?|trees?)\b/);

  if (COMMERCIAL_CUES.test(lower) || (areaMatch && Number(areaMatch[1]) >= 1)) {
    return { level: "COMMERCIAL_FARMER", confidence: COMMERCIAL_CUES.test(lower) ? "confirmed" : "inferred" };
  }

  if (HOME_CUES.test(lower) || (plantCount && Number(plantCount[1]) > 0 && Number(plantCount[1]) <= 40)) {
    return { level: "HOME_GARDENER", confidence: HOME_CUES.test(lower) ? "confirmed" : "inferred" };
  }

  if (SMALL_FARM_CUES.test(lower)) {
    return { level: "SMALL_FARMER", confidence: "confirmed" };
  }

  if (/\b(farmer|farm)\b/.test(lower) && !HOME_CUES.test(lower)) {
    return { level: "SMALL_FARMER", confidence: "inferred" };
  }

  return { level: null, confidence: null };
}

export function farmerLevelToUserLevel(level: FarmerLevel | null): UserLevel | null {
  switch (level) {
    case "HOME_GARDENER":
      return "home_gardener";
    case "SMALL_FARMER":
      return "small_farmer";
    case "COMMERCIAL_FARMER":
      return "commercial_grower";
    case "TECHNICAL_USER":
      return "technical_user";
    case "AGRONOMIST":
      return "agronomist";
    default:
      return null;
  }
}

export function userLevelToFarmerLevel(level: UserLevel | string | null | undefined): FarmerLevel | null {
  switch (level) {
    case "home_gardener":
      return "HOME_GARDENER";
    case "small_farmer":
    case "farmer":
      return "SMALL_FARMER";
    case "commercial_grower":
      return "COMMERCIAL_FARMER";
    case "technical_user":
    case "extension_officer":
      return "TECHNICAL_USER";
    case "agronomist":
      return "AGRONOMIST";
    default:
      return null;
  }
}

export function inferIrrigation(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\bdrip\b/.test(lower)) return "drip";
  if (/\bsprinkler\b/.test(lower)) return "sprinkler";
  if (/\bflood\b/.test(lower)) return "flood";
  if (/\b(hose|hand[\s-]?water)/.test(lower)) return "hand watering";
  return null;
}

export function inferProductionSystem(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\bgreenhouse\b/.test(lower)) return "greenhouse";
  if (/\bshade\s*house\b/.test(lower)) return "shade_house";
  if (/\bhydroponic\b/.test(lower)) return "hydroponic";
  if (/\bopen\s+field\b/.test(lower)) return "open_field";
  return null;
}

export function inferProtectedOrOpen(
  productionSystem: string | null,
): "protected" | "open_field" | null {
  if (!productionSystem) return null;
  if (productionSystem === "open_field") return "open_field";
  if (
    productionSystem === "greenhouse" ||
    productionSystem === "shade_house" ||
    productionSystem === "hydroponic"
  ) {
    return "protected";
  }
  return null;
}

export function inferFarmScale(text: string, level: FarmerLevel | null): string | null {
  const lower = text.toLowerCase();
  const area = lower.match(/\b(\d+(?:\.\d+)?)\s*(acres?|hectares?|ha)\b/);
  if (area) return `${area[1]} ${area[2]}`;
  const plants = lower.match(/\b(\d+)\s*(plants?|pots?|trees?)\b/);
  if (plants) return `${plants[1]} ${plants[2]}`;
  if (level === "HOME_GARDENER") return "home garden";
  if (level === "COMMERCIAL_FARMER") return "commercial";
  if (level === "SMALL_FARMER") return "small farm";
  return null;
}

export function localSpecificityMatters(options: {
  intent?: IntentCategory | null;
  asksForProducts?: boolean;
  asksAboutWeather?: boolean;
  researchNeed?: string | null;
}): boolean {
  const intent = options.intent ?? null;
  if (options.asksForProducts) return true;
  if (options.researchNeed && options.researchNeed !== "none") return true;
  if (intent === "pricing" || intent === "weather") return true;
  if (options.asksAboutWeather) return true;
  return false;
}

export function shouldAskCountry(options: {
  country: string | null | undefined;
  intent?: IntentCategory | null;
  asksForProducts?: boolean;
  asksAboutWeather?: boolean;
  researchNeed?: string | null;
}): boolean {
  if (options.country?.trim()) return false;
  const intent = options.intent ?? null;
  if (intent && (isCalculationIntent(intent) || isBusinessIntent(intent) && intent !== "pricing")) {
    return intent === "pricing";
  }
  return localSpecificityMatters(options);
}

export function mergeFarmerContext(
  current: FarmerContext,
  incoming: Partial<FarmerContext>,
): FarmerContext {
  const pick = <T,>(
    a: FarmerContextValue<T>,
    b: FarmerContextValue<T> | undefined,
  ): FarmerContextValue<T> => {
    if (!b?.value) return a;
    if (!a.value) return b;
    if (b.confidence === "confirmed" && a.confidence !== "confirmed") return b;
    if (a.confidence === "confirmed" && b.confidence !== "confirmed") return a;
    return b;
  };

  return {
    country: pick(current.country, incoming.country),
    region: pick(current.region, incoming.region),
    farmerLevel: pick(current.farmerLevel, incoming.farmerLevel),
    mainCrops: [...new Set([...(incoming.mainCrops ?? current.mainCrops)])].filter(Boolean),
    farmScale: pick(current.farmScale, incoming.farmScale),
    productionSystem: pick(current.productionSystem, incoming.productionSystem),
    knownVarieties: { ...current.knownVarieties, ...(incoming.knownVarieties ?? {}) },
    irrigationType: pick(current.irrigationType, incoming.irrigationType),
    protectedOrOpen: pick(current.protectedOrOpen, incoming.protectedOrOpen),
    commonRecurringIssues: [
      ...new Set([
        ...current.commonRecurringIssues,
        ...(incoming.commonRecurringIssues ?? []),
      ]),
    ],
  };
}

export function farmerContextFromText(
  text: string,
  profile?: { country?: string | null; district?: string | null } | null,
): FarmerContext {
  const located = extractRegionAndCountry(text);
  const level = inferFarmerLevel(text);
  const productionSystem = inferProductionSystem(text);
  const crop = extractLastCrop(text);
  const varietyMatch = text.match(/\b(?:variety|cultivar)\s+([A-Za-z][A-Za-z0-9-]+)\b/i);
  const knownVarieties: Record<string, string> = {};
  if (crop && varietyMatch?.[1]) knownVarieties[crop] = varietyMatch[1];

  const country =
    located.country ||
    profile?.country?.trim() ||
    null;
  const region = located.region || profile?.district?.trim() || null;

  return {
    country: valued(country, country ? (located.country && !located.countryFromRegion ? "confirmed" : "inferred") : null),
    region: valued(region, region ? "inferred" : null),
    farmerLevel: valued(level.level, level.confidence),
    mainCrops: crop ? [crop] : [],
    farmScale: valued(inferFarmScale(text, level.level), level.level ? "inferred" : null),
    productionSystem: valued(productionSystem, productionSystem ? "inferred" : null),
    knownVarieties,
    irrigationType: valued(inferIrrigation(text), inferIrrigation(text) ? "inferred" : null),
    protectedOrOpen: valued(inferProtectedOrOpen(productionSystem), productionSystem ? "inferred" : null),
    commonRecurringIssues: [],
  };
}

export function farmerContextSummary(context: FarmerContext): string {
  const lines: string[] = ["FARMER CONTEXT (inferred values are not certain):"];
  const push = (label: string, field: FarmerContextValue<string | FarmerLevel>) => {
    if (!field.value) return;
    lines.push(`- ${label}: ${field.value} (${field.confidence ?? "inferred"})`);
  };
  push("country", context.country);
  push("region", context.region);
  push("farmer_level", context.farmerLevel);
  if (context.mainCrops.length) lines.push(`- main crops: ${context.mainCrops.join(", ")}`);
  push("farm_scale", context.farmScale);
  push("production_system", context.productionSystem);
  push("irrigation", context.irrigationType);
  push("protected_or_open", context.protectedOrOpen);
  const varieties = Object.entries(context.knownVarieties);
  if (varieties.length) {
    lines.push(
      `- varieties: ${varieties.map(([crop, variety]) => `${crop} ${variety}`).join("; ")}`,
    );
  }
  if (context.commonRecurringIssues.length) {
    lines.push(`- recurring issues: ${context.commonRecurringIssues.join("; ")}`);
  }
  if (lines.length === 1) lines.push("- none extracted yet");
  return lines.join("\n");
}

export function depthInstructionForLevel(level: FarmerLevel | null): string {
  switch (level) {
    case "HOME_GARDENER":
      return `FARMER LEVEL: HOME_GARDENER (use very simple language, lower-risk actions, almost no jargon. Explain any technical word in the same sentence.)`;
    case "SMALL_FARMER":
      return `FARMER LEVEL: SMALL_FARMER (practical field checks, simple treatment options, cost awareness. Keep language clear.)`;
    case "COMMERCIAL_FARMER":
      return `FARMER LEVEL: COMMERCIAL_FARMER (precise management, economics, production risk, resistance management, spray timing. Rates/intervals only when verified from a current label.)`;
    case "TECHNICAL_USER":
      return `FARMER LEVEL: TECHNICAL_USER (deeper physiology, disease differential, active ingredients, FRAC/IRAC where appropriate, nutrient interactions, pH/EC, epidemiology. Do not oversimplify.)`;
    case "AGRONOMIST":
      return `FARMER LEVEL: AGRONOMIST (full technical depth. Include differentials, active ingredients, FRAC/IRAC, nutrient interactions, pH/EC, epidemiology, and source-backed regulatory notes. Never dumb this down.)`;
    default:
      return `FARMER LEVEL: unknown — write clearly for a practical Caribbean farmer. Increase technical depth if their wording is technical.`;
  }
}

export function responseTokenBudget(options: {
  intent?: IntentCategory | null;
  farmerLevel?: FarmerLevel | null;
  diagnostic?: boolean;
}): number {
  const intent = options.intent ?? "general_agriculture";
  if (intent === "simple_math" || intent === "unit_conversion") return 700;
  if (intent === "cashflow" || intent === "farm_business" || intent === "costing") return 2800;
  const technical =
    options.farmerLevel === "TECHNICAL_USER" || options.farmerLevel === "AGRONOMIST";
  if (options.diagnostic && technical) return 4200;
  if (options.diagnostic) return 3200;
  if (technical) return 2800;
  return 1800;
}
