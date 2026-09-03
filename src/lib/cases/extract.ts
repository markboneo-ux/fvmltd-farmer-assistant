import type { UserLevel } from "@/lib/beta/identity";
import type { HomeOrCommercial, StructuredCaseFacts } from "./types";

const TT_DISTRICTS = [
  "couva",
  "chaguanas",
  "arima",
  "san fernando",
  "port of spain",
  "sangre grande",
  "point fortin",
  "tunapuna",
  "penal",
  "debe",
  "princes town",
  "rio claro",
  "mayaro",
  "siparia",
  "diego martin",
  "toco",
  "cedros",
];

const CROPS: Array<{ match: RegExp; name: string }> = [
  { match: /\btomato(es)?\b/, name: "tomato" },
  { match: /\bpepper(s)?\b/, name: "pepper" },
  { match: /\bcucumber(s)?\b/, name: "cucumber" },
  { match: /\bcelery\b/, name: "celery" },
  { match: /\blettuce\b/, name: "lettuce" },
  { match: /\bcabbage\b/, name: "cabbage" },
  { match: /\bokra\b/, name: "okra" },
  { match: /\bcassava\b/, name: "cassava" },
  { match: /\bbanana(s)?\b/, name: "banana" },
  { match: /\bhot\s+pepper(s)?\b/, name: "pepper" },
];

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function inferUserLevel(text: string): UserLevel | null {
  const lower = text.toLowerCase();
  if (/\b(agronomist|plant patholog|crop advisor)\b/.test(lower)) return "agronomist";
  if (/\b(extension officer|extension agent|ministry of agriculture)\b/.test(lower)) {
    return "extension_officer";
  }
  if (
    /\b(commercial grower|commercial farm|commercial production|greenhouse business)\b/.test(lower) ||
    /\b\d+(\.\d+)?\s*(acres?|hectares?|ha)\b/.test(lower)
  ) {
    return "commercial_grower";
  }
  if (/\b(home garden|backyard|kitchen garden|pots? on (the )?porch)\b/.test(lower)) {
    return "home_gardener";
  }
  if (/\b(farmer|farm)\b/.test(lower)) return "farmer";
  return null;
}

export function inferHomeOrCommercial(text: string, level: UserLevel | null): HomeOrCommercial {
  if (level === "home_gardener") return "home";
  if (level === "commercial_grower" || level === "agronomist" || level === "extension_officer") {
    return "commercial";
  }
  const lower = text.toLowerCase();
  if (/\b(home|backyard|kitchen)\s+garden/.test(lower)) return "home";
  if (/\bcommercial\b/.test(lower) || /\b\d+(\.\d+)?\s*(acres?|hectares?|ha)\b/.test(lower)) {
    return "commercial";
  }
  return "unknown";
}

export function inferProblemCategory(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\bwhite\s*fl/.test(lower)) return "whitefly";
  if (/\b(cercospora|leaf\s+spot)\b/.test(lower)) return "leaf_spot";
  if (/\b(blight|late blight|early blight)\b/.test(lower)) return "blight";
  if (/\bwilt/.test(lower)) return "wilting";
  if (/\bstunt/.test(lower)) return "stunting";
  if (/\b(yellow|chloros)/.test(lower)) return "yellowing";
  if (/\b(nutrient|fertilizer|fertiliser|deficiency)\b/.test(lower)) return "nutrient";
  if (/\b(aphid|thrips|mite|worm|caterpillar|insect|pest)\b/.test(lower)) return "pest";
  if (/\b(fungal|mould|mold|mildew|rot)\b/.test(lower)) return "disease";
  if (/\bholes?\b/.test(lower)) return "leaf_damage";
  return null;
}

export function extractVariety(text: string, crop: string | null): string | null {
  const ruby = text.match(/\b(ruby)\b/i);
  if (ruby && (crop === "tomato" || /tomato/i.test(text))) return "Ruby";
  const named = text.match(
    /\b(?:variety|cultivar)\s+([A-Za-z][A-Za-z0-9-]+)\b/i,
  );
  if (named?.[1]) return named[1];
  const beforeCrop = text.match(
    /\b([A-Z][a-z]+)\s+tomato(es)?\b/,
  );
  if (beforeCrop?.[1] && !/my|the|our|some/i.test(beforeCrop[1])) {
    return beforeCrop[1];
  }
  return null;
}

export function extractDistrict(text: string): string | null {
  const lower = text.toLowerCase();
  for (const district of TT_DISTRICTS) {
    if (lower.includes(district)) return titleCase(district);
  }
  return null;
}

export function extractSymptoms(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/\bwilt/, "wilting"],
    [/\bstunt/, "stunting"],
    [/\byellow/, "yellowing"],
    [/\bwhite\s*fl/, "whiteflies"],
    [/\bleaf\s+spot/, "leaf spot"],
    [/\bholes?\b/, "leaf holes"],
    [/\bsticky/, "honeydew"],
    [/\bsooty/, "sooty mould"],
    [/\bcurl/, "leaf curl"],
  ];
  for (const [pattern, label] of checks) {
    if (pattern.test(lower)) found.push(label);
  }
  return found;
}

export function extractStructuredFacts(
  text: string,
  profile?: { country?: string | null; district?: string | null } | null,
): StructuredCaseFacts {
  const lower = text.toLowerCase();
  let crop: string | null = null;
  for (const item of CROPS) {
    if (item.match.test(lower)) {
      crop = item.name;
      break;
    }
  }

  const userLevel = inferUserLevel(text);
  const district = extractDistrict(text) || profile?.district?.trim() || null;
  let country = profile?.country?.trim() || null;
  if (!country) {
    if (/\btrinidad\b/.test(lower) || /\btobago\b/.test(lower) || district) {
      country = "Trinidad and Tobago";
    } else if (/\bjamaica\b/.test(lower)) country = "Jamaica";
    else if (/\bbarbados\b/.test(lower)) country = "Barbados";
    else if (/\bguyana\b/.test(lower)) country = "Guyana";
  }

  const areaMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*(acres?|hectares?|ha)\b/);
  const ageMatch =
    lower.match(/\b(\d+)\s*(weeks?|months?|days?)\s+old\b/) ||
    lower.match(/\bplants?\s+are\s+(\d+)\s*(weeks?|months?|days?)\b/);

  let fieldDistribution: string | null = null;
  if (/\b(whole|entire|most of the|across)\b/.test(lower) && /\b(field|acres?|crop|plants?)\b/.test(lower)) {
    fieldDistribution = "broad";
  } else if (/\bpatches?\b/.test(lower)) {
    fieldDistribution = "patches";
  } else if (/\bfew plants?\b/.test(lower)) {
    fieldDistribution = "few plants";
  }

  let productionSystem: string | null = null;
  if (/\bgreenhouse\b/.test(lower)) productionSystem = "greenhouse";
  else if (/\bshade\s*house\b/.test(lower)) productionSystem = "shade_house";
  else if (/\bhydroponic\b/.test(lower)) productionSystem = "hydroponic";
  else if (/\bopen\s+field\b/.test(lower)) productionSystem = "open_field";

  return {
    crop,
    variety: extractVariety(text, crop),
    plantAge: ageMatch ? `${ageMatch[1]} ${ageMatch[2]}` : null,
    productionSystem,
    homeOrCommercial: inferHomeOrCommercial(text, userLevel),
    userLevel,
    country,
    district,
    farm: null,
    area: areaMatch ? `${areaMatch[1]} ${areaMatch[2]}` : null,
    farmerProblemText: text.trim(),
    problemCategory: inferProblemCategory(text),
    symptoms: extractSymptoms(text),
    fieldDistribution,
    soilOrMedium: /\b(coco\s*peat|soil|compost| potting)\b/.test(lower)
      ? (lower.match(/\b(coco\s*peat|potting mix|clay|sandy soil|loam)\b/)?.[1] ?? "soil")
      : null,
    irrigation: /\b(drip|sprinkler|flood|hose|hand water)/.test(lower)
      ? (lower.match(/\b(drip|sprinkler|flood irrigation|hose|hand water(?:ing)?)\b/)?.[1] ?? null)
      : null,
    drainage: /\b(poor drainage|waterlog|stays wet|well drained)\b/.test(lower)
      ? (lower.match(/\b(poor drainage|waterlogged|stays wet|well drained)\b/)?.[1] ?? null)
      : null,
    fertilizerHistory: /\b(fertilizer|fertiliser|npk|urea)\b/.test(lower)
      ? "mentioned"
      : null,
    chemicalHistory: /\b(spray|sprayed|insecticide|fungicide|pesticide)\b/.test(lower)
      ? "mentioned"
      : null,
    recentWeather: /\b(heavy rain|humid|hot|dry spell|rainfall)\b/.test(lower)
      ? (lower.match(/\b(heavy rain|humid|hot|dry spell|rainfall)\b/)?.[1] ?? null)
      : null,
    weatherRisk: null,
    possibleCauses: [],
    confidence: "unknown",
    severity: /\b(dying|collapse|whole field|all plants)\b/.test(lower) ? "high" : "unknown",
    recommendedActions: [],
    productsRequested:
      /\b(what can i (spray|use)|what chemical|what fungicide|what fertilizer|what is available|what can i use)\b/.test(
        lower,
      ),
    verifiedProductsShown: [],
    humanEscalation: false,
  };
}

export function mergeCaseFacts(
  current: StructuredCaseFacts,
  incoming: StructuredCaseFacts,
): StructuredCaseFacts {
  const pick = <T,>(a: T, b: T): T => {
    if (b == null || b === "" || b === "unknown") return a;
    if (Array.isArray(b) && b.length === 0) return a;
    return b;
  };

  return {
    crop: pick(current.crop, incoming.crop),
    variety: pick(current.variety, incoming.variety),
    plantAge: pick(current.plantAge, incoming.plantAge),
    productionSystem: pick(current.productionSystem, incoming.productionSystem),
    homeOrCommercial:
      incoming.homeOrCommercial !== "unknown"
        ? incoming.homeOrCommercial
        : current.homeOrCommercial,
    userLevel: pick(current.userLevel, incoming.userLevel),
    country: pick(current.country, incoming.country),
    district: pick(current.district, incoming.district),
    farm: pick(current.farm, incoming.farm),
    area: pick(current.area, incoming.area),
    farmerProblemText: incoming.farmerProblemText || current.farmerProblemText,
    problemCategory: pick(current.problemCategory, incoming.problemCategory),
    symptoms: [...new Set([...current.symptoms, ...incoming.symptoms])],
    fieldDistribution: pick(current.fieldDistribution, incoming.fieldDistribution),
    soilOrMedium: pick(current.soilOrMedium, incoming.soilOrMedium),
    irrigation: pick(current.irrigation, incoming.irrigation),
    drainage: pick(current.drainage, incoming.drainage),
    fertilizerHistory: pick(current.fertilizerHistory, incoming.fertilizerHistory),
    chemicalHistory: pick(current.chemicalHistory, incoming.chemicalHistory),
    recentWeather: pick(current.recentWeather, incoming.recentWeather),
    weatherRisk: pick(current.weatherRisk, incoming.weatherRisk),
    possibleCauses:
      incoming.possibleCauses.length > 0 ? incoming.possibleCauses : current.possibleCauses,
    confidence: incoming.confidence !== "unknown" ? incoming.confidence : current.confidence,
    severity: incoming.severity !== "unknown" ? incoming.severity : current.severity,
    recommendedActions:
      incoming.recommendedActions.length > 0
        ? incoming.recommendedActions
        : current.recommendedActions,
    productsRequested: current.productsRequested || incoming.productsRequested,
    verifiedProductsShown: [
      ...new Set([...current.verifiedProductsShown, ...incoming.verifiedProductsShown]),
    ],
    humanEscalation: current.humanEscalation || incoming.humanEscalation,
  };
}

export const ASK_GROWER_TYPE_ONCE =
  "Are you growing at home or commercially?";
