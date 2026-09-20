/**
 * Crop-specific differentials. Generic root/nutrient/foliar cards are last resort.
 * Weather changes scores; it must not invent an unrelated crop disease.
 */

import type { FarmerLevel } from "@/lib/assistant/farmer-context";
import type { RankedCause, CauseCategory } from "./causes";
import type { ObservedEvidence } from "./evidence-hierarchy";
import type { KnownFarmerFacts } from "./tomato-protocol";
import { describeObservedSpots, extractSymptomAttributes } from "./symptom-consistency";
import { NARROW_SPRAY_TARGET } from "./chemical-guidance";
import {
  hasLesionEvidence,
  HOLD_FERTILIZER,
  isLesionSpecificDisease,
  UNDERSIDE_INSECT_QUESTION,
} from "./evidence-gated-causes";

export type CropPlaybook = {
  id: string;
  likelyCauses: string[];
  why: string;
  checks: string[];
  actionsToday: string[];
  avoid: string[];
  whatWouldChange: string[];
  monitor: string;
  oneQuestion: string;
  photoHelpful: boolean;
};

type CauseSeed = {
  category: CauseCategory;
  label: string;
  why: string;
  increasesIf: string;
  decreasesIf: string;
  base: number;
  wetBoost?: number;
  dryBoost?: number;
  heatBoost?: number;
  crops: string[];
  match: (text: string, evidence: ObservedEvidence) => boolean;
};

const ALL_CROPS = ["*"];

function cropKey(crop: string | null | undefined): string {
  return (crop ?? "").trim().toLowerCase();
}

function allowsCrop(seed: CauseSeed, crop: string): boolean {
  if (seed.crops.includes("*")) return true;
  return seed.crops.includes(crop);
}

const SEEDS: CauseSeed[] = [
  {
    crops: ["tomato"],
    category: "fungal disease",
    label: "Septoria leaf spot",
    why: "Yellow or brown spots starting on older, lower tomato leaves after wet weather often fit Septoria.",
    increasesIf: "Many small spots on lower leaves, maybe tiny dark centres, after several wet days.",
    decreasesIf: "Only leaf tips burn, or new leaves are worse than old ones with no spots.",
    base: 6,
    wetBoost: 5,
    match: (text, evidence) =>
      evidence.symptoms.includes("spots") || /\b(yellow|brown).{0,20}spots?\b/.test(text),
  },
  {
    crops: ["tomato"],
    category: "fungal disease",
    label: "Early blight",
    why: "Early blight makes target-like spots on older tomato leaves in warm, wet spells.",
    increasesIf: "Spots have rings, and lower leaves yellow and drop after humid weather.",
    decreasesIf: "Spots are tiny specks only, or damage is only at the leaf edge with no rings.",
    base: 5,
    wetBoost: 4,
    heatBoost: 1,
    match: (text, evidence) =>
      evidence.symptoms.includes("spots") || /\bblight\b/.test(text),
  },
  {
    crops: ["tomato"],
    category: "bacterial disease",
    label: "Bacterial spot or speck",
    why: "Bacterial spot/speck can look like yellow or dark specks, especially after rain splash.",
    increasesIf: "Spots look water-soaked or greasy, or fruit also has specks.",
    decreasesIf: "There is obvious mould, rings, or only even yellowing with no lesions.",
    base: 4,
    wetBoost: 3,
    match: (text, evidence) => evidence.symptoms.includes("spots"),
  },
  {
    crops: ["tomato"],
    category: "fungal disease",
    label: "Leaf mould (if plants stay humid or covered)",
    why: "Leaf mould shows as pale upper spots with olive mould underneath in still, humid air.",
    increasesIf: "The planting is covered or crowded and the underside has a velvety mould.",
    decreasesIf: "The crop is open and windy with no mould on the underside.",
    base: 2,
    wetBoost: 2,
    match: (text, evidence) =>
      evidence.symptoms.includes("spots") &&
      (/\b(greenhouse|shade|covered|tunnel|protected)\b/.test(text) || evidence.wetFromFarmer),
  },
  {
    crops: ["pepper"],
    category: "fungal disease",
    label: "Cercospora / frogeye leaf spot",
    why: "Pepper leaf spots after wet weather often fit Cercospora-type spots rather than a generic nutrient problem.",
    increasesIf: "Round spots with a pale centre on older leaves after humid or rainy days.",
    decreasesIf: "Only the leaf edges burn, or you can see insects and sticky residue instead of spots.",
    base: 6,
    wetBoost: 4,
    match: (text, evidence) =>
      evidence.symptoms.includes("spots") &&
      /\b(spots?|lesions?|leaf[- ]spot)\b/.test(text) &&
      hasLesionEvidence({ evidence }),
  },
  {
    crops: ["pepper"],
    category: "bacterial disease",
    label: "Bacterial leaf spot",
    why: "Bacterial spot on pepper is splash-spread and more likely after rain.",
    increasesIf: "Water-soaked or greasy spots, maybe on fruit, after rain.",
    decreasesIf: "A clean margin burn with no discrete spots.",
    base: 5,
    wetBoost: 4,
    match: (text, evidence) =>
      evidence.symptoms.includes("spots") &&
      /\b(spots?|lesions?|leaf[- ]spot)\b/.test(text) &&
      hasLesionEvidence({ evidence }),
  },
  {
    crops: ["pepper", "tomato"],
    category: "bacterial disease",
    label: "Bacterial wilt",
    why: "Sudden wilt with green leaves can be bacterial wilt, but root rot and waterlogging can look the same until you check stem and roots.",
    increasesIf: "Plants wilt fast, often overnight, and a cut stem streams milky threads in water.",
    decreasesIf: "Only the soil is puddled and plants pick up when it dries, or roots are obviously rotten.",
    base: 8,
    wetBoost: 2,
    match: (text) => /\bwilt/.test(text),
  },
  {
    crops: ["pepper", "tomato", "cucumber", "celery"],
    category: "root health",
    label: "Root or stem-base rot",
    why: "Roots or the stem base can rot in wet soil and wilt the plant without a leaf-spot pattern.",
    increasesIf: "Stem base is brown, roots are mushy, or plants sit in wet spots.",
    decreasesIf: "Roots are white and the stem inside is clean.",
    base: 6,
    wetBoost: 3,
    match: (text) => /\b(wilt|root|stem)\b/.test(text),
  },
  {
    crops: ["pepper", "tomato", "celery", "lettuce", "cabbage"],
    category: "drainage",
    label: "Waterlogging",
    why: "Saturated soil suffocates roots and can wilt or yellow plants after heavy rain.",
    increasesIf: "The worst plants sit in puddles or low beds.",
    decreasesIf: "Beds drain quickly and only scattered plants are affected on higher ground.",
    base: 5,
    wetBoost: 3,
    match: (text, evidence) => {
      if (evidence.symptoms.includes("spots") && !/\bwilt/.test(text)) return false;
      return (
        /\b(wilt|waterlog|drain|puddle|flood|soggy)\b/.test(text) ||
        evidence.wetFromFarmer
      );
    },
  },
  {
    crops: ["lettuce", "celery"],
    category: "nutrition",
    label: "Tip or edge burn from water, salt, or calcium/potassium stress",
    why: "Brown tips or edges without separate spots usually start as watering, salt, or nutrient transport, not a leaf-spot disease.",
    increasesIf: "Browning starts at the tip or edge and older leaves are worse.",
    decreasesIf: "You see separate spots, rings, or mould rather than a clean margin burn.",
    base: 8,
    dryBoost: 2,
    heatBoost: 1,
    match: (text) => /\b(burn|burning|burnt|brown (tips?|edges?)|scorch|crispy)\b/.test(text),
  },
  {
    crops: ["lettuce", "celery"],
    category: "herbicide injury",
    label: "Spray or fertilizer injury",
    why: "A recent spray or strong feed can burn leaf edges.",
    increasesIf: "You sprayed or fertigated in the last week, or the burn follows spray swaths.",
    decreasesIf: "No spray or feed was applied and spots are discrete with a halo.",
    base: 5,
    match: (text) => /\b(burn|burning|burnt|brown (tips?|edges?)|spray|fertiliz)\b/.test(text),
  },
  {
    crops: ["cucumber"],
    category: "fungal disease",
    label: "Downy mildew or angular leaf spot",
    why: "Cucumber leaf spots in wet or humid weather often fit downy mildew or angular leaf spot.",
    increasesIf: "Spots are angular, yellow then brown, and the underside looks dusty or water-soaked.",
    decreasesIf: "Only the leaf edge is burnt and there are no spots.",
    base: 7,
    wetBoost: 4,
    match: (text, evidence) => evidence.symptoms.includes("spots") || /\bmildew\b/.test(text),
  },
  {
    crops: ["banana", "plantain"],
    category: "fungal disease",
    label: "Black or yellow Sigatoka leaf streak",
    why: "Black streaks spreading on banana leaves in wet weather often fit Sigatoka-type leaf spot.",
    increasesIf: "Streaks run along the leaf and wet humid weather has continued.",
    decreasesIf: "Only the leaf edge is dry-burnt and new leaves are clean.",
    base: 8,
    wetBoost: 5,
    match: (text) => /\b(streak|spot|black|sigatoka|leaf)\b/.test(text),
  },
  {
    crops: ["cassava"],
    category: "nutrition",
    label: "Nutrient shortage or water stress",
    why: "Even yellowing on cassava without spots is often nutrition or water, not a tomato-style blight.",
    increasesIf: "Yellowing is even and there are no insects or mosaic patterns.",
    decreasesIf: "Leaves are mosaic, twisted, or covered in mites.",
    base: 6,
    dryBoost: 3,
    match: (text, evidence) =>
      evidence.symptoms.includes("yellowing") && !evidence.symptoms.includes("spots"),
  },
  {
    crops: ["cassava"],
    category: "viral disease",
    label: "Mosaic or virus pattern",
    why: "Patchy yellow mosaic on cassava can be a virus, not a fertilizer miss.",
    increasesIf: "Leaves are mottled, twisted, or plants are stunted in patches.",
    decreasesIf: "Yellowing is even from the oldest leaves only.",
    base: 5,
    match: (text) => /\b(yellow|mosaic|mottle|curl|stunt)\b/.test(text),
  },
  {
    crops: ["cabbage"],
    category: "insects",
    label: "Caterpillars or sucking insects",
    why: "Holes or clusters on cabbage are often insects first.",
    increasesIf: "You see worms, frass, or aphids on the underside.",
    decreasesIf: "Leaves yellow evenly with no holes or insects.",
    base: 7,
    match: (text) => /\b(hole|worm|caterpillar|aphid|insect|chew)\b/.test(text),
  },
  {
    crops: ALL_CROPS,
    category: "insects",
    label: "Whiteflies (observed)",
    why: "The farmer already reported whiteflies. Treat that as an observed pest, not a guess.",
    increasesIf: "Whiteflies, sticky honeydew, or sooty mould are on the underside of leaves.",
    decreasesIf: "Undersides are clean and no insects are found after a careful check.",
    base: 12,
    match: (_text, evidence) => evidence.observedPest === "whiteflies",
  },
  {
    crops: ["pepper", "tomato"],
    category: "insects",
    label: "Aphids or other sucking insects",
    why: "Curled or yellowing new leaves on pepper often start with aphids, whiteflies, or mites under the leaves.",
    increasesIf: "You find insects, cast skins, or sticky residue under curled new leaves.",
    decreasesIf: "Undersides are clean after a careful check of several plants.",
    base: 7,
    match: (text, evidence) =>
      (evidence.symptoms.includes("leaf curl") || /\bcurl/.test(text)) &&
      !evidence.symptoms.includes("spots"),
  },
  {
    crops: ["pepper", "tomato"],
    category: "nutrition",
    label: "Nutrient shortage or uneven feeding",
    why: "Even yellowing, especially on older leaves, can be nutrition or watering rather than a virus or a leaf spot.",
    increasesIf: "Yellowing is worse on older leaves and new growth is otherwise normal.",
    decreasesIf: "Only new leaves are cupped, mottled, or twisted.",
    base: 6,
    match: (text, evidence) =>
      evidence.symptoms.includes("yellowing") &&
      !evidence.symptoms.includes("spots") &&
      !evidence.observedPest,
  },
  {
    crops: ["pepper", "tomato"],
    category: "viral disease",
    label: "Virus risk if new leaves stay curled",
    why: "Persistent curling, mosaic, or stunting on new pepper growth can be a virus, often after sucking insects, but a photo or one plant does not prove it.",
    increasesIf: "New leaves stay cupped or mottled and affected plants are scattered.",
    decreasesIf: "Only older leaves yellow evenly and new growth is normal.",
    base: 5,
    match: (text, evidence) =>
      (evidence.symptoms.includes("leaf curl") || /\bcurl/.test(text)) &&
      !evidence.symptoms.includes("spots") &&
      evidence.observedPest !== "whiteflies",
  },
  {
    crops: ["pepper", "tomato"],
    category: "viral disease",
    label: "Whitefly-transmitted virus risk",
    why: "Whiteflies can spread viruses. Virus is a follow-on risk, not a replacement for the observed whiteflies.",
    increasesIf: "New leaves are curled, mottled, or plants are stunted as well as infested.",
    decreasesIf: "Growth is normal and only adults are on older leaves.",
    base: 4,
    match: (text, evidence) =>
      evidence.observedPest === "whiteflies" && /\b(curl|mosaic|stunt|yellow)\b/.test(text),
  },
];

function scoreSeed(
  seed: CauseSeed,
  evidence: ObservedEvidence,
): number {
  let score = seed.base;
  const signals = evidence.weatherSignals;
  if (signals.includes("prolonged_wetness") || signals.includes("disease_pressure")) {
    score += seed.wetBoost ?? 0;
  }
  if (signals.includes("dry_conditions")) score += seed.dryBoost ?? 0;
  if (signals.includes("heat_stress")) score += seed.heatBoost ?? 0;
  return score;
}

export function rankCropCauses(options: {
  text: string;
  crop?: string | null;
  evidence: ObservedEvidence;
  limit?: number;
}): RankedCause[] {
  const crop = cropKey(options.crop);
  const text = options.text.toLowerCase();
  const scored: Array<RankedCause & { score: number }> = [];

  const lesion = hasLesionEvidence({ evidence: options.evidence });
  for (const seed of SEEDS) {
    if (crop && !allowsCrop(seed, crop) && !seed.crops.includes("*")) continue;
    if (!crop && !seed.crops.includes("*") && seed.category !== "insects") continue;
    if (isLesionSpecificDisease(seed.label) && !lesion) continue;
    if (!seed.match(text, options.evidence)) continue;
    const score = scoreSeed(seed, options.evidence);
    if (score <= 0) continue;
    scored.push({
      category: seed.category,
      label: seed.label,
      rank: 0,
      why: seed.why,
      increasesIf: seed.increasesIf,
      decreasesIf: seed.decreasesIf,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const unique: Array<RankedCause & { score: number }> = [];
  for (const item of scored) {
    if (unique.some((existing) => existing.label === item.label)) continue;
    unique.push(item);
  }
  return unique.slice(0, options.limit ?? 5).map((item, index) => ({
    category: item.category,
    label: item.label,
    rank: index + 1,
    why: item.why,
    increasesIf: item.increasesIf,
    decreasesIf: item.decreasesIf,
  }));
}

function levelTone(
  level: FarmerLevel | null,
  variants: Partial<Record<FarmerLevel, Partial<CropPlaybook>>> & { base: CropPlaybook },
): CropPlaybook {
  const extra = level ? variants[level] : undefined;
  if (!extra) return variants.base;
  return { ...variants.base, ...extra, id: extra.id ?? variants.base.id };
}

export function cropPlaybookFor(options: {
  crop: string | null;
  facts: KnownFarmerFacts;
  evidence: ObservedEvidence;
  farmerLevel: FarmerLevel | null;
  ranked?: RankedCause[];
}): CropPlaybook | null {
  const crop = cropKey(options.crop);
  const text = options.facts.rawText.toLowerCase();
  const ranked = options.ranked ?? rankCropCauses({ text: options.facts.rawText, crop, evidence: options.evidence });
  const labels = ranked.slice(0, 3).map((item) => item.label);

  if (options.evidence.observedPest === "whiteflies" && !options.evidence.secondUnexplainedSymptom) {
    return whiteflyPlaybook(options.facts.crop ?? "the crop", options.farmerLevel);
  }

  if (crop === "tomato" && (options.evidence.symptoms.includes("spots") || /\b(yellow|spot|blight)\b/.test(text))) {
    return tomatoSpotPlaybook(labels, options.evidence, options.farmerLevel, options.facts);
  }

  if (
    crop === "pepper" &&
    hasLesionEvidence({ evidence: options.evidence, facts: options.facts }) &&
    options.evidence.symptoms.includes("spots")
  ) {
    return pepperSpotPlaybook(labels, options.evidence, options.farmerLevel, options.facts);
  }

  if (
    crop === "pepper" &&
    (options.evidence.symptoms.includes("leaf curl") ||
      (options.evidence.symptoms.includes("yellowing") && !options.evidence.symptoms.includes("spots")))
  ) {
    return pepperCurlYellowPlaybook(labels, options.farmerLevel, options.facts);
  }

  if ((crop === "lettuce" || crop === "celery") && /\b(burn|burning|burnt|brown (tips?|edges?)|scorch)\b/.test(text)) {
    if (crop === "celery") return null;
    return lettuceEdgePlaybook(options.farmerLevel);
  }

  if (/\bwilt/.test(text) && (crop === "pepper" || crop === "tomato" || crop === "cucumber")) {
    return wiltPlaybook(options.facts.crop ?? "the crop", options.farmerLevel);
  }

  if (labels.length >= 2) {
    return {
      id: `${crop || "crop"}_specific`,
      likelyCauses: labels,
      why: ranked[0]?.why ?? "Several crop-specific problems can look like this. Rank the ones that fit the crop, the symptom, and the weather.",
      checks: [
        "Look at a few plants, not just the worst one",
        "Note whether older or newer leaves are worse",
        "Check whether the soil is soggy, dry, or uneven",
      ],
      actionsToday: [
        "Hold extra fertilizer and extra pesticide until the pattern is clearer",
        "Improve obvious drainage or dry spots if you can",
      ],
      avoid: [
        "Do not pull a whole bed from one symptom",
        "Do not add another spray until we know the cause",
      ],
      whatWouldChange: ranked.slice(0, 2).map((item) => item.increasesIf),
      monitor: "Watch whether new growth stays clean over the next 2–3 days.",
      oneQuestion: ranked[0]?.increasesIf
        ? `If you look closely: ${ranked[0].increasesIf.replace(/\.$/, "")}?`
        : "Are a few plants, patches, or most of the crop affected?",
      photoHelpful: true,
    };
  }

  return null;
}

function tomatoSpotPlaybook(
  labels: string[],
  evidence: ObservedEvidence,
  farmerLevel: FarmerLevel | null,
  facts: KnownFarmerFacts,
): CropPlaybook {
  const causes =
    labels.length >= 2
      ? labels
      : ["Septoria leaf spot", "Early blight", "Bacterial spot or speck"];
  const attrs = extractSymptomAttributes({
    facts,
    text: facts.rawText,
    weatherSignals: evidence.weatherSignals,
  });
  const observed = describeObservedSpots(attrs);
  const wetFromFarmer = evidence.wetFromFarmer;
  const weatherWet = evidence.weatherSignals.includes("prolonged_wetness");
  const wetWhy = wetFromFarmer
    ? `On tomato, ${observed} after a wet week make a foliar disease — especially Septoria or early blight — more likely than a generic nutrient or root problem. Bacterial spot still belongs on the list if spots look water-soaked. Nutrient or root stress would rise only if the colouring is even, with no true spots.`
    : weatherWet
      ? `On tomato, ${observed} fit a foliar disease — especially Septoria or early blight — more than a generic nutrient or root problem. Recent conditions have been wet, which can raise that disease pressure. Bacterial spot still belongs on the list if spots look water-soaked. Nutrient or root stress would rise only if the colouring is even, with no true spots.`
      : `On tomato, ${observed}. Separate true leaf spots from even colouring. Septoria, early blight, and bacterial spot/speck are the crop-relevant possibilities. Nutrient or root stress is lower unless the pattern is even colouring without lesions.`;
  const wetHome = wetFromFarmer
    ? `${observed.charAt(0).toUpperCase()}${observed.slice(1)} after rain usually mean a leaf disease, not hungry plants. We still need a close look at the spots before naming one disease or spraying.`
    : weatherWet
      ? `${observed.charAt(0).toUpperCase()}${observed.slice(1)} on tomato usually mean a leaf disease, not hungry plants. Recent conditions have been wet, which can raise disease pressure. We still need a close look at the spots before naming one disease or spraying.`
      : `${observed.charAt(0).toUpperCase()}${observed.slice(1)} on tomato usually mean a leaf disease, not hungry plants. We still need a close look at the spots before naming one disease or spraying.`;
  const base: CropPlaybook = {
    id: "tomato_foliar",
    likelyCauses: causes,
    why: wetWhy,
    checks: [
      "Are the spots separate lesions, or is the colouring even from the leaf edge?",
      "Do spots have rings, tiny dark centres, or a greasy water-soaked look?",
      "Are older lower leaves worse than new growth?",
      "Is the soil staying wet around the roots, or only the leaves wet from rain or dew?",
    ],
    actionsToday: [
      "Keep people and tools from moving through wet plants more than needed",
      "Avoid overhead watering if you can, so leaves dry faster",
      `Hold extra fertilizer. ${NARROW_SPRAY_TARGET}`,
    ],
    avoid: [
      "Do not strip leaves just because they have a few spots",
      "Do not assume one product will cover fungal and bacterial spots",
    ],
    whatWouldChange: [
      "Tiny dark-centred spots on lower leaves would raise Septoria",
      "Target-like rings would raise early blight",
      "Greasy or water-soaked specks, especially on fruit, would raise bacterial spot",
    ],
    monitor: "Watch whether new leaves stay clean as the weather dries or stays wet.",
    oneQuestion: "Do the spots have rings, tiny dark centres, or a greasy water-soaked look?",
    photoHelpful: true,
  };
  return levelTone(farmerLevel, {
    base,
    HOME_GARDENER: {
      id: "tomato_foliar_home",
      why: wetHome,
      actionsToday: [
        "Do not add fertilizer today",
        "Water the soil, not the leaves, if the plants need water",
        "A close photo of the spots would help",
      ],
    },
    SMALL_FARMER: {
      id: "tomato_foliar_small",
      why: wetFromFarmer
        ? `On a tomato planting, ${observed} after a wet week is a foliar-disease problem first. Walk the beds and see which spots you have before changing the spray programme.`
        : weatherWet
          ? `On a tomato planting, ${observed} are a foliar-disease problem first. Recent conditions have been wet. Walk the beds and see which spots you have before changing the spray programme.`
          : `On a tomato planting, ${observed} are a foliar-disease problem first. Walk the beds and see which spots you have before changing the spray programme.`,
    },
    COMMERCIAL_FARMER: {
      id: "tomato_foliar_commercial",
      why: wetFromFarmer || weatherWet
        ? `On a commercial tomato planting, ${observed}${wetFromFarmer ? " after prolonged wetness" : ""} raise Septoria/early blight pressure and can cut marketable canopy. ${weatherWet && !wetFromFarmer ? "Recent conditions have been wet. " : ""}Bacterial spot remains in the differential if lesions are greasy. Do not treat this as a backyard nutrient tip.`
        : `On a commercial tomato planting, ${observed} raise Septoria/early blight as the first foliar differential. Bacterial spot remains if lesions are greasy. Do not treat this as a backyard nutrient tip.`,
    },
    TECHNICAL_USER: {
      id: "tomato_foliar_technical",
      why: `Tomato ${observed}${wetFromFarmer || weatherWet ? " with prolonged leaf wetness" : ""} shifts prior toward Septoria lycopersici or Alternaria early blight; bacterial spot/speck remains if lesions are water-soaked.${weatherWet && !wetFromFarmer ? " Recent conditions have been wet." : ""} Abiotic nutrient/root stress is not the leading hypothesis while discrete spots are present.`,
    },
    AGRONOMIST: {
      id: "tomato_foliar_agronomist",
      why: `Epidemiological prior: tomato + ${observed}${wetFromFarmer || weatherWet ? " + prolonged wetness" : ""}. Rank Septoria and early blight above abiotic scorch. Confirm lesion architecture (pycnidia vs concentric rings vs water-soaking) before a FRAC programme. Do not start QoI/DMI from a generic nutrient card.`,
      checks: [
        "Lesion architecture: pycnidia, concentric rings, or water-soaking/halo",
        "Spatial pattern: lower canopy vs new growth; rain-splash gradient",
        "Recent leaf wetness duration and irrigation method",
      ],
    },
  });
}

function pepperSpotPlaybook(
  labels: string[],
  evidence: ObservedEvidence,
  farmerLevel: FarmerLevel | null,
  facts: KnownFarmerFacts,
): CropPlaybook {
  const causes =
    labels.length >= 2
      ? labels
      : ["Cercospora / frogeye leaf spot", "Bacterial leaf spot"];
  const wetFromFarmer = evidence.wetFromFarmer;
  const weatherWet = evidence.weatherSignals.includes("prolonged_wetness");
  return levelTone(farmerLevel, {
    base: {
      id: "pepper_foliar",
      likelyCauses: causes,
      why: wetFromFarmer || weatherWet
        ? `On sweet or hot pepper, leaf spots${wetFromFarmer ? " after wet weather" : ""} are more likely Cercospora-type or bacterial spot than a generic nutrient problem.${weatherWet && !wetFromFarmer ? " Recent conditions have been wet." : ""} We still need the spot type before choosing a spray.`
        : "On pepper, separate fungal Cercospora-type spots from bacterial spot before choosing a product. Nutrient burn is lower unless the damage is only at the leaf edge.",
      checks: [
        "Are spots round with a pale centre, or greasy and water-soaked?",
        "Are older leaves worse, and is fruit also spotted?",
        "Has rain been splashing soil onto the leaves?",
      ],
      actionsToday: [
        "Avoid working the crop while leaves are wet",
        "Improve airflow if plants are crowded",
        NARROW_SPRAY_TARGET,
      ],
      avoid: [
        "Do not borrow a Trinidad-registered product as proof it is legal in this country",
        "Do not strip a lot of leaves from an uncertain diagnosis",
      ],
      whatWouldChange: [
        "Pale-centred spots would raise Cercospora",
        "Greasy specks or fruit spots would raise bacterial spot",
      ],
      monitor: "Check whether new leaves stay clean over the next 2–3 days.",
      oneQuestion: "Are the spots round with a pale centre, or greasy and water-soaked?",
      photoHelpful: true,
    },
    HOME_GARDENER: {
      id: "pepper_foliar_home",
      why: wetFromFarmer
        ? "Leaf spots on pepper after wet weather usually mean a leaf disease. We should tell fungal spots from bacterial spots before you buy a spray."
        : weatherWet
          ? "Leaf spots on pepper usually mean a leaf disease. Recent conditions have been wet. We should tell fungal spots from bacterial spots before you buy a spray."
          : "Leaf spots on pepper usually mean a leaf disease. We should tell fungal spots from bacterial spots before you buy a spray.",
    },
  });
}

function pepperCurlYellowPlaybook(
  labels: string[],
  farmerLevel: FarmerLevel | null,
  facts: KnownFarmerFacts,
): CropPlaybook {
  const causes =
    labels.length >= 2
      ? labels.filter((label) => !/\b(cercospora|bacterial leaf spot|frogeye|virus)\b/i.test(label)).slice(0, 3)
      : [
          "Aphids or other sucking insects",
          "Nutrient shortage or uneven feeding",
        ];
  void facts;
  return levelTone(farmerLevel, {
    base: {
      id: "pepper_curl_yellow",
      likelyCauses: causes.slice(0, 3),
      why: "On sweet pepper, curling with yellowing is still unconfirmed. Sucking insects under new leaves are the first thing to check. A nutrient pattern would rise if older leaves are worse than new ones.",
      checks: [
        "Turn over curled new leaves and look for insects, mites, cast skins, or sticky residue",
        "Compare whether yellowing is worse on the newest curled leaves or the older lower leaves",
        "Note whether affected plants are scattered, in patches, or field-wide",
      ],
      actionsToday: [
        "Scout the underside of curled new leaves before changing fertilizer or sprays",
        HOLD_FERTILIZER,
        "Keep notes on how many plants are affected",
      ],
      avoid: [
        "Do not jump to a spray until insects, old versus new leaves, and spread are checked",
        "Do not add extra fertilizer yet until we know whether older or newer leaves are affected",
      ],
      whatWouldChange: [
        "Insects or sticky residue under new leaves would raise aphids or whiteflies",
        "Yellowing only on oldest leaves would raise a nutrient pattern",
        "Mosaic, mottle, or a confirmed vector would raise a virus concern",
      ],
      monitor: "Watch whether new growth stays curled and whether more plants join in over 2–3 days.",
      oneQuestion: UNDERSIDE_INSECT_QUESTION,
      photoHelpful: true,
    },
    HOME_GARDENER: {
      id: "pepper_curl_yellow_home",
      why: "Your sweet peppers are curling and yellowing. Check under the new leaves for insects before you change fertilizer.",
    },
  });
}

function lettuceEdgePlaybook(farmerLevel: FarmerLevel | null): CropPlaybook {
  const base: CropPlaybook = {
    id: "lettuce_edge",
    likelyCauses: [
      "Tip or edge burn from water, salt, or calcium/potassium stress",
      "Spray or fertilizer injury",
      "Leaf disease only if there are separate spots",
    ],
    why: "What you are describing could come from several different problems, but I would first separate leaf-tip or edge burn from true leaf spots. If the browning starts at the tips or edges, I would first look at watering, salt around the roots, or a recent spray. If you are seeing separate brown lesions, disease moves higher on the list.",
    checks: [
      "Is the burn starting at the tip or edge, or as separate spots?",
      "Are older leaves worse than new growth?",
      "Has fertilizer or pesticide been applied in the last 5–7 days?",
    ],
    actionsToday: [
      "Avoid increasing fertilizer or applying another pesticide until we narrow it down",
      "Check soil moisture and drainage",
      "If possible, send a close photo of the affected leaf plus a whole plant",
    ],
    avoid: [
      "Do not add more fertilizer today",
      "Do not spray another pesticide until we know whether this is burn or disease",
    ],
    whatWouldChange: [
      "Separate spots or lesions would raise foliar disease",
      "A recent spray or strong fertilizer would raise chemical injury",
    ],
    monitor: "Check new leaves over the next 24–72 hours. If spotting or lesions appear, disease becomes more likely.",
    oneQuestion: "Are the brown areas starting at the leaf tips, edges, or as separate spots?",
    photoHelpful: true,
  };
  return levelTone(farmerLevel, {
    base,
    HOME_GARDENER: {
      id: "lettuce_edge_home",
      likelyCauses: [
        "Watering or roots under stress",
        "Too much fertilizer or salt around the roots",
        "A leaf disease only if you see separate spots",
      ],
      why: "Brown lettuce edges often come from watering, salt around the roots, or a spray. Separate spots would point to a leaf disease instead.",
      checks: [
        "Does the brown start at the tips, or is it separate spots?",
        "Feel the soil — soggy or bone dry?",
        "Did you feed or spray in the last week?",
      ],
      actionsToday: [
        "Do not add more fertilizer today",
        "Water only if the soil is dry",
        "A close photo of the leaf and the whole plant would help",
      ],
    },
    SMALL_FARMER: {
      id: "lettuce_edge_small",
      likelyCauses: [
        "Uneven irrigation, drainage, or salt in the beds",
        "Recent fertilizer or spray injury on the planting",
        "Disease only if separate spots are present",
      ],
      why: "On a small farm planting, tip or edge burn is usually a field-management problem first: irrigation uniformity, salt around the roots, or a recent spray. Walk the beds and scout new growth before changing the spray programme. Disease only rises if you see separate spots rather than a clean margin burn.",
    },
    COMMERCIAL_FARMER: {
      id: "lettuce_edge_commercial",
      likelyCauses: [
        "Irrigation uniformity or root-zone salt/EC affecting marketable quality",
        "Nutrient imbalance with yield or harvest-timing risk",
        "Foliar disease only if lesions are present (spray-window and resistance implications)",
      ],
      why: "On a commercial lettuce planting this is a production problem first: map the pattern across beds, check irrigation and recent fertigation, then decide whether disease would force extra sprays, harvest delay, or resistance pressure.",
    },
    TECHNICAL_USER: {
      id: "lettuce_edge_technical",
      likelyCauses: [
        "Root-zone water relations, pH, or EC/nutrient antagonism",
        "Phytotoxicity from a recent spray or foliar feed",
        "Foliar pathogen if discrete lesions, sporulation, or systemic symptoms",
      ],
      why: "Treat this as a physiological/pathological differential. Tip or margin necrosis implicates water, salinity/EC, or nutrient transport. Discrete lesions shift prior toward a pathogen. pH and EC interact with nutrient availability and should be read together.",
    },
    AGRONOMIST: {
      id: "lettuce_edge_agronomist",
      likelyCauses: [
        "Rhizosphere water potential / osmotic scorch from NaCl or high EC",
        "Nutrient antagonism or transport failure versus xenobiotic injury",
        "Foliar mycosis or bacteriosis if lesion anatomy supports it; consider FRAC/IRAC only after that",
      ],
      why: "Full technical differential: competing aetiologies, lesion architecture, and epidemiology. Do not start a QoI/DMI (FRAC 11/3) or insecticide (IRAC) programme from a vague margin burn. Humidity can increase both abiotic scorch and infection risk without proving either.",
    },
  });
}

function wiltPlaybook(crop: string, farmerLevel: FarmerLevel | null): CropPlaybook {
  return levelTone(farmerLevel, {
    base: {
      id: "sudden_wilt",
      likelyCauses: [
        "Bacterial wilt",
        "Root or stem-base rot",
        "Waterlogging",
      ],
      why: `Sudden wilt in ${crop} can be bacterial wilt, root/stem rot, or waterlogged roots. These look similar until you check a cut stem, the roots, and whether plants sit in wet soil. Do not pull the whole field on this description alone.`,
      checks: [
        "Cut a wilted stem lengthwise — is the inside brown?",
        "Stand a freshly cut stem in clean water. A milky stream is strong field evidence that bacterial wilt is more likely — it does not confirm it the way a laboratory test would",
        "Check whether roots are white or rotten, and whether the soil is puddled",
        "Are wilted plants scattered, in a low wet patch, or most of the field?",
      ],
      actionsToday: [
        "Do not pull the whole field yet",
        "Avoid moving soil, tools, or water from wilted plants to healthy ones",
        "If practical, mark or isolate the worst plants and keep walking the rest",
      ],
      avoid: [
        "Do not dump or plough in the crop from one overnight wilt without checking stem and roots",
        "Do not add fertilizer hoping it will reverse a sudden wilt",
      ],
      whatWouldChange: [
        "A milky stream in water would make bacterial wilt much more likely, still not laboratory-confirmed",
        "Rotten roots or a brown stem base without streaming would raise root/stem rot",
        "Puddled low spots with plants recovering when dry would raise waterlogging",
      ],
      monitor: "Recheck neighbouring plants later today and tomorrow. Rapid spread raises the disease concern.",
      oneQuestion: "If you cut a wilted stem, is the inside brown, and do the roots look rotten or healthy?",
      photoHelpful: true,
    },
  });
}

function whiteflyPlaybook(crop: string, farmerLevel: FarmerLevel | null): CropPlaybook {
  return levelTone(farmerLevel, {
    base: {
      id: "whitefly_management",
      likelyCauses: ["Whiteflies (observed)"],
      why: `You already found whiteflies on ${crop}. That is an observed pest, not a weather guess. Heat or wind can make them breed faster or make spraying harder, but they are not the cause of the whiteflies. Focus on how many there are, honeydew or sooty mould, and whether new leaves look viral.`,
      checks: [
        "Turn over several leaves and note adults, nymphs, and eggs — not just one leaf",
        "Look for sticky honeydew or black sooty mould",
        "Check whether this is a hotspot or most of the field",
        "Look at new growth for curling or mosaic that could mean a virus",
        "Note any ladybirds, lacewings, or other beneficials",
      ],
      actionsToday: [
        "Scout in the cooler morning when whiteflies are easier to see",
        "Use a yellow sticky card or a beat-tray if you have one, to compare hotspots",
        "Avoid spraying the same insecticide group over and over",
        "Do not strip lots of leaves unless a plant is collapsing under sooty mould",
      ],
      avoid: [
        "Do not treat this as heat or wind damage",
        "Do not mix unlabelled insecticide cocktails",
        "Do not assume a product registered in another country is legal here",
      ],
      whatWouldChange: [
        "Curled or mottled new leaves would raise a virus concern on top of the whiteflies",
        "Most of the field sticky and black would raise urgency",
      ],
      monitor: "Recount a few plants in 2–3 days. If numbers climb or new leaves curl, we change course.",
      oneQuestion: "Are the whiteflies on a few plants, patches, or most of the field?",
      photoHelpful: true,
    },
    HOME_GARDENER: {
      id: "whitefly_management_home",
      why: `You already saw whiteflies on ${crop}. That is the problem to manage. Weather does not replace that. Check how many are under the leaves and whether the leaves are sticky or black.`,
    },
    AGRONOMIST: {
      id: "whitefly_management_agronomist",
      why: `Observed Bemisia/Trialeurodes on ${crop}. Do not substitute abiotic stress in the differential. Management: density and life-stage mix, honeydew/sooty mould, begomovirus symptoms, natural enemies, then IRAC rotation only if a locally verified insecticide is justified.`,
      checks: [
        "Life-stage mix on the abaxial surface (adults vs nymphs vs eggs)",
        "Honeydew / Capnodium sooty mould; virus-like new growth",
        "Within-field aggregation vs uniform infestation; beneficial counts",
      ],
    },
  });
}

export function nutrientOrRootSupported(evidence: ObservedEvidence, text: string): boolean {
  if (evidence.symptoms.includes("spots") && !/\bno spots?\b/.test(text)) return false;
  if (evidence.observedPest) return false;
  return (
    /\b(even yellow|no spots|pale new leaves|fertilizer|salt|soggy|bone dry)\b/.test(text) ||
    evidence.symptoms.includes("leaf burn")
  );
}
