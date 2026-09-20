/**
 * Canonical crop-health cause IDs.
 * The model may only explain IDs the server puts on the allowed list.
 */

import type { CauseCategory } from "./causes";

export type PipelineObservations = {
  crop: string | null;
  cropKey: string | null;
  symptoms: string[];
  lesionsReported: boolean;
  lesionEvidence: boolean;
  insectsReported: boolean;
  observedPest: string | null;
  mosaicReported: boolean;
  wetOrDrainageEvidence: boolean;
  dryEvidence: boolean;
  heatEvidence: boolean;
  wiltReported: boolean;
  leafBurnReported: boolean;
  curlReported: boolean;
  yellowingReported: boolean;
  sprayMentioned: boolean;
  farmingArea: string | null;
  country: string | null;
  photoAttached: boolean;
  photoUncertain: boolean;
  photoFindings: string[];
  farmerNamedCauseIds: CauseId[];
};

export const CAUSE_IDS = [
  "APHIDS",
  "WHITEFLY",
  "MITES",
  "THRIPS",
  "NUTRIENT_PATTERN",
  "ROOT_WATER_STRESS",
  "WATERLOGGING",
  "VIRUS_SUSPECTED",
  "CERCOSPORA",
  "BACTERIAL_LEAF_SPOT",
  "FUNGAL_LEAF_SPOT",
  "SEPTORIA",
  "EARLY_BLIGHT",
  "BACTERIAL_WILT",
  "ROOT_ROT",
  "HERBICIDE_INJURY",
  "HEAT_STRESS",
  "TIP_EDGE_BURN",
] as const;

export type CauseId = (typeof CAUSE_IDS)[number];

export type CauseDefinition = {
  id: CauseId;
  category: CauseCategory;
  farmerLabel: string;
  crops: string[];
  farmerWhy: string;
  increasesIf: string;
  decreasesIf: string;
  checks: string[];
  actions: string[];
  avoid: string[];
  nextQuestion: string;
  /** Lesion-named diseases never enter the allowlist without lesion evidence. */
  requiresLesionEvidence?: boolean;
  allowed: (obs: PipelineObservations) => boolean;
  admit: (obs: PipelineObservations) => boolean;
};

const ALL = ["*"];

function cropAllowed(def: CauseDefinition, cropKey: string | null): boolean {
  if (def.crops.includes("*")) return true;
  if (!cropKey) return false;
  return def.crops.includes(cropKey);
}

export const CAUSE_CATALOG: Record<CauseId, CauseDefinition> = {
  APHIDS: {
    id: "APHIDS",
    category: "insects",
    farmerLabel: "Aphids or other sucking insects",
    crops: ALL,
    farmerWhy:
      "Curling and yellowing of new leaves often starts with sucking insects under the newest growth. That is a hypothesis until the undersides are checked.",
    increasesIf: "You find insects, cast skins, or sticky residue under curled new leaves.",
    decreasesIf: "Undersides of several curled leaves are clean.",
    checks: [
      "Turn over curled new leaves and look for insects, mites, cast skins, or sticky residue",
      "Compare whether yellowing is worse on the newest curled leaves or the older lower leaves",
    ],
    actions: [
      "Scout the underside of curled new leaves before changing fertilizer or sprays",
      "Do not add extra fertilizer yet until we know whether older or newer leaves are affected",
    ],
    avoid: [
      "Do not jump to a spray until insects, old versus new leaves, and spread are checked",
      "Do not add extra fertilizer yet until we know whether older or newer leaves are affected",
    ],
    nextQuestion: "Can you check the underside of the curled new leaves for tiny insects or mites?",
    allowed: (obs) =>
      cropAllowed(CAUSE_CATALOG.APHIDS, obs.cropKey) &&
      (obs.curlReported ||
        obs.observedPest === "aphids" ||
        /\baphids?\b/.test(obs.observedPest ?? "")),
    admit: (obs) =>
      obs.curlReported || obs.observedPest === "aphids" || obs.insectsReported,
  },
  WHITEFLY: {
    id: "WHITEFLY",
    category: "insects",
    farmerLabel: "Whiteflies",
    crops: ALL,
    farmerWhy:
      "Whiteflies on the underside of leaves can yellow plants and leave sticky residue. Treat them as a cause only when they are seen or clearly reported.",
    increasesIf: "Whiteflies, sticky honeydew, or sooty mould are on the underside of leaves.",
    decreasesIf: "Undersides are clean and no whiteflies are found after a careful check.",
    checks: ["Look under leaves for tiny white insects, honeydew, or sooty mould"],
    actions: ["Scout the underside of leaves before changing sprays or fertilizer"],
    avoid: ["Do not spray for whiteflies until you have seen them on the plants"],
    nextQuestion: "Can you check the underside of the newest leaves for whiteflies or sticky residue?",
    allowed: (obs) =>
      cropAllowed(CAUSE_CATALOG.WHITEFLY, obs.cropKey) &&
      (obs.observedPest === "whiteflies" || obs.curlReported),
    admit: (obs) => obs.observedPest === "whiteflies",
  },
  MITES: {
    id: "MITES",
    category: "mites",
    farmerLabel: "Mites",
    crops: ALL,
    farmerWhy:
      "Mites can curl or speckle leaves and are often only visible on the underside. They stay on the list until that check is done.",
    increasesIf: "Fine speckling, webbing, or tiny movers under the leaf.",
    decreasesIf: "Underside is clean with no speckling.",
    checks: ["Look under curled leaves for tiny mites, speckling, or fine webbing"],
    actions: ["Scout the underside of curled new leaves before changing fertilizer or sprays"],
    avoid: ["Do not jump to a miticide until mites are seen"],
    nextQuestion: "Can you check the underside of the curled new leaves for tiny insects or mites?",
    allowed: (obs) =>
      cropAllowed(CAUSE_CATALOG.MITES, obs.cropKey) &&
      (obs.curlReported || obs.observedPest === "mites" || obs.yellowingReported),
    admit: (obs) => obs.curlReported || obs.observedPest === "mites",
  },
  THRIPS: {
    id: "THRIPS",
    category: "insects",
    farmerLabel: "Thrips",
    crops: ALL,
    farmerWhy: "Thrips can silver or distort new leaves. They are only a live hypothesis if damage or insects fit.",
    increasesIf: "Silvery streaks, black specks, or thrips in flowers or new leaves.",
    decreasesIf: "New leaves are clean with no silvering.",
    checks: ["Look inside new leaves and flowers for tiny slender insects"],
    actions: ["Scout new growth before spraying"],
    avoid: ["Do not assume thrips from yellowing alone"],
    nextQuestion: "Do the newest leaves look silvery, scarred, or twisted as well as curled?",
    allowed: (obs) => obs.observedPest === "thrips",
    admit: (obs) => obs.observedPest === "thrips",
  },
  NUTRIENT_PATTERN: {
    id: "NUTRIENT_PATTERN",
    category: "nutrition",
    farmerLabel: "Nutrient shortage or uneven feeding",
    crops: ALL,
    farmerWhy:
      "Yellowing may be nutrition if older leaves are worse than new ones. Do not add extra fertilizer until that pattern is known.",
    increasesIf: "Yellowing is mainly on older lower leaves and new growth is otherwise normal.",
    decreasesIf: "Only the newest curled leaves are yellow, mottled, or twisted.",
    checks: [
      "Compare whether yellowing is worse on the newest curled leaves or the older lower leaves",
    ],
    actions: [
      "Do not add extra fertilizer yet until we know whether older or newer leaves are affected",
    ],
    avoid: [
      "Do not add extra fertilizer yet until we know whether older or newer leaves are affected",
    ],
    nextQuestion: "Is the yellowing mainly on the newest curled leaves or the older lower leaves?",
    allowed: (obs) =>
      cropAllowed(CAUSE_CATALOG.NUTRIENT_PATTERN, obs.cropKey) &&
      (obs.yellowingReported || obs.leafBurnReported) &&
      !obs.lesionEvidence,
    admit: (obs) => (obs.yellowingReported || obs.leafBurnReported) && !obs.lesionEvidence,
  },
  ROOT_WATER_STRESS: {
    id: "ROOT_WATER_STRESS",
    category: "root health",
    farmerLabel: "Root or water stress",
    crops: ALL,
    farmerWhy:
      "Roots that sit too wet or too dry cannot feed the leaves, which can yellow or wilt without leaf spots.",
    increasesIf: "Soil stays soggy, plants pull easily, or roots are brown.",
    decreasesIf: "Beds drain quickly and roots are white.",
    checks: ["Check whether the soil around affected plants is soggy, dry, or uneven"],
    actions: ["Fix obvious dry or waterlogged spots before changing fertilizer"],
    avoid: ["Do not add extra fertilizer while roots may be sitting wet"],
    nextQuestion: "Does the soil around the worst plants stay wet, or is it drying out?",
    allowed: (obs) =>
      cropAllowed(CAUSE_CATALOG.ROOT_WATER_STRESS, obs.cropKey) &&
      (obs.wetOrDrainageEvidence || obs.dryEvidence || obs.wiltReported),
    admit: (obs) => obs.wetOrDrainageEvidence || obs.dryEvidence || obs.wiltReported,
  },
  WATERLOGGING: {
    id: "WATERLOGGING",
    category: "drainage",
    farmerLabel: "Waterlogging",
    crops: ALL,
    farmerWhy: "Saturated soil suffocates roots and can yellow or wilt plants after heavy rain.",
    increasesIf: "The worst plants sit in puddles or low beds.",
    decreasesIf: "Beds drain quickly and only scattered plants on higher ground are affected.",
    checks: ["Walk the low spots — do affected plants sit in water?"],
    actions: ["Improve drainage around the worst plants if you can"],
    avoid: ["Do not add extra fertilizer while the soil is waterlogged"],
    nextQuestion: "Are the worst plants sitting in water or in a low, poorly drained spot?",
    allowed: (obs) => obs.wetOrDrainageEvidence,
    admit: (obs) => obs.wetOrDrainageEvidence,
  },
  VIRUS_SUSPECTED: {
    id: "VIRUS_SUSPECTED",
    category: "viral disease",
    farmerLabel: "Virus risk",
    crops: ["pepper", "tomato", "cassava"],
    farmerWhy:
      "A virus can curl or mottle new leaves, often after sucking insects, but curling and yellowing alone do not prove it.",
    increasesIf: "New leaves stay cupped or mottled and a vector insect is present.",
    decreasesIf: "Only older leaves yellow evenly and new growth is otherwise normal.",
    checks: ["Look for mosaic, mottle, or stunting on new growth, and for vector insects"],
    actions: ["Keep scouting new growth; do not pull plants from curling alone"],
    avoid: ["Do not remove whole plants from a possible virus without stronger evidence"],
    nextQuestion: "Do the newest leaves look mottled or mosaic as well as curled?",
    allowed: (obs) =>
      cropAllowed(CAUSE_CATALOG.VIRUS_SUSPECTED, obs.cropKey) &&
      (obs.mosaicReported ||
        obs.observedPest === "whiteflies" ||
        obs.observedPest === "aphids"),
    admit: (obs) =>
      obs.mosaicReported ||
      ((obs.observedPest === "whiteflies" || obs.observedPest === "aphids") && obs.curlReported),
  },
  CERCOSPORA: {
    id: "CERCOSPORA",
    category: "fungal disease",
    farmerLabel: "Cercospora / frogeye leaf spot",
    crops: ["pepper"],
    requiresLesionEvidence: true,
    farmerWhy:
      "On pepper, discrete leaf spots after wet weather can fit Cercospora-type spots. Spot type still needs a close look.",
    increasesIf: "Round spots with a pale centre on older leaves after humid or rainy days.",
    decreasesIf: "Only the leaf edges burn, or you see insects and sticky residue instead of spots.",
    checks: ["Are spots round with a pale centre, or greasy and water-soaked?"],
    actions: ["Avoid working the crop while leaves are wet"],
    avoid: ["Do not choose a disease spray until the spot type is clearer"],
    nextQuestion: "Are the spots round with a pale centre, or greasy and water-soaked?",
    allowed: (obs) =>
      cropAllowed(CAUSE_CATALOG.CERCOSPORA, obs.cropKey) && obs.lesionEvidence,
    admit: (obs) => obs.lesionEvidence && cropAllowed(CAUSE_CATALOG.CERCOSPORA, obs.cropKey),
  },
  BACTERIAL_LEAF_SPOT: {
    id: "BACTERIAL_LEAF_SPOT",
    category: "bacterial disease",
    farmerLabel: "Bacterial leaf spot",
    crops: ["pepper", "tomato"],
    requiresLesionEvidence: true,
    farmerWhy:
      "Bacterial spot is splash-spread and more likely after rain when discrete greasy or water-soaked spots are present.",
    increasesIf: "Water-soaked or greasy spots, maybe on fruit, after rain.",
    decreasesIf: "A clean margin burn with no discrete spots.",
    checks: ["Look for greasy or water-soaked specks versus dry margin burn"],
    actions: ["Avoid working the crop while leaves are wet"],
    avoid: ["Do not choose a bacterial spray until spots are confirmed"],
    nextQuestion: "Do the spots look greasy or water-soaked, or dry from the leaf edge?",
    allowed: (obs) =>
      cropAllowed(CAUSE_CATALOG.BACTERIAL_LEAF_SPOT, obs.cropKey) && obs.lesionEvidence,
    admit: (obs) =>
      obs.lesionEvidence && cropAllowed(CAUSE_CATALOG.BACTERIAL_LEAF_SPOT, obs.cropKey),
  },
  FUNGAL_LEAF_SPOT: {
    id: "FUNGAL_LEAF_SPOT",
    category: "fungal disease",
    farmerLabel: "Fungal leaf spot",
    crops: ALL,
    requiresLesionEvidence: true,
    farmerWhy:
      "Discrete leaf spots can be a fungal leaf spot when lesions are actually present. Colouring or curling without spots is not enough.",
    increasesIf: "Separate spots on leaves, especially after wet weather.",
    decreasesIf: "Even yellowing or curling with no discrete lesions.",
    checks: ["Confirm the marks are separate spots, not even yellowing or tip burn"],
    actions: ["Avoid working wet plants more than needed"],
    avoid: ["Do not start a fungicide from yellowing or curling alone"],
    nextQuestion: "Are you seeing separate spots, or even yellowing and curling without spots?",
    allowed: (obs) => obs.lesionEvidence,
    admit: (obs) => obs.lesionEvidence,
  },
  SEPTORIA: {
    id: "SEPTORIA",
    category: "fungal disease",
    farmerLabel: "Septoria leaf spot",
    crops: ["tomato"],
    requiresLesionEvidence: true,
    farmerWhy:
      "Yellow or brown spots starting on older tomato leaves after wet weather often fit Septoria.",
    increasesIf: "Many small spots on lower leaves, maybe tiny dark centres, after several wet days.",
    decreasesIf: "Only leaf tips burn, or new leaves are worse than old ones with no spots.",
    checks: ["Are older lower tomato leaves spotted, and do spots have tiny dark centres?"],
    actions: ["Avoid overhead watering if you can, so leaves dry faster"],
    avoid: ["Do not strip leaves just because they have a few spots"],
    nextQuestion: "Do the spots have rings, tiny dark centres, or a greasy water-soaked look?",
    allowed: (obs) => cropAllowed(CAUSE_CATALOG.SEPTORIA, obs.cropKey) && obs.lesionEvidence,
    admit: (obs) => cropAllowed(CAUSE_CATALOG.SEPTORIA, obs.cropKey) && obs.lesionEvidence,
  },
  EARLY_BLIGHT: {
    id: "EARLY_BLIGHT",
    category: "fungal disease",
    farmerLabel: "Early blight",
    crops: ["tomato"],
    requiresLesionEvidence: true,
    farmerWhy: "Early blight makes target-like spots on older tomato leaves in warm, wet spells.",
    increasesIf: "Spots have rings, and lower leaves yellow and drop after humid weather.",
    decreasesIf: "Spots are tiny specks only, or damage is only at the leaf edge with no rings.",
    checks: ["Do tomato spots have target-like rings on older leaves?"],
    actions: ["Keep people and tools from moving through wet plants more than needed"],
    avoid: ["Do not assume one product will cover fungal and bacterial spots"],
    nextQuestion: "Do the spots have rings, tiny dark centres, or a greasy water-soaked look?",
    allowed: (obs) => cropAllowed(CAUSE_CATALOG.EARLY_BLIGHT, obs.cropKey) && obs.lesionEvidence,
    admit: (obs) => cropAllowed(CAUSE_CATALOG.EARLY_BLIGHT, obs.cropKey) && obs.lesionEvidence,
  },
  BACTERIAL_WILT: {
    id: "BACTERIAL_WILT",
    category: "bacterial disease",
    farmerLabel: "Bacterial wilt",
    crops: ["pepper", "tomato", "cucumber"],
    farmerWhy:
      "Sudden wilt with green leaves can be bacterial wilt, but root rot and waterlogging can look the same until you check stem and roots. A milky stream in water makes bacterial wilt much more likely — it is strong field evidence, not a laboratory confirmation.",
    increasesIf: "Plants wilt fast, often overnight, and a cut stem streams milky threads in water.",
    decreasesIf: "Only the soil is puddled and plants pick up when it dries, or roots are obviously rotten.",
    checks: ["Cut a wilted stem and stand it in water — does a milky stream appear?"],
    actions: [
      "Check the stem and roots before removing plants",
      "Do not remove every plant until the stem and roots have been checked",
    ],
    avoid: ["Do not remove every plant until the stem and roots have been checked"],
    nextQuestion: "Did the plants wilt suddenly while the leaves were still green?",
    allowed: (obs) => cropAllowed(CAUSE_CATALOG.BACTERIAL_WILT, obs.cropKey) && obs.wiltReported,
    admit: (obs) => obs.wiltReported,
  },
  ROOT_ROT: {
    id: "ROOT_ROT",
    category: "root health",
    farmerLabel: "Root or stem-base rot",
    crops: ALL,
    farmerWhy: "Roots or the stem base can rot in wet soil and wilt the plant without a leaf-spot pattern.",
    increasesIf: "Stem base is brown, roots are mushy, or plants sit in wet spots.",
    decreasesIf: "Roots are white and the stem inside is clean.",
    checks: ["Check the stem base and roots of a wilted plant"],
    actions: ["Improve drainage around the worst plants if you can"],
    avoid: ["Do not add extra fertilizer while roots may be rotting"],
    nextQuestion: "Are the roots or the stem base brown and mushy?",
    allowed: (obs) => obs.wiltReported,
    admit: (obs) => obs.wiltReported,
  },
  HERBICIDE_INJURY: {
    id: "HERBICIDE_INJURY",
    category: "herbicide injury",
    farmerLabel: "Spray or fertilizer injury",
    crops: ALL,
    farmerWhy: "A recent spray or strong feed can burn or twist leaves in odd patterns.",
    increasesIf: "You sprayed or fertigated in the last week, or the burn follows spray swaths.",
    decreasesIf: "No spray or feed was applied and neighbours are healthy in a disease-like spread.",
    checks: ["Did you spray or feed in the last week, and does the pattern follow spray swaths?"],
    actions: ["Hold extra fertilizer and extra pesticide until the pattern is clearer"],
    avoid: ["Do not apply another pesticide until we know whether this is burn, disease, or insects"],
    nextQuestion: "Has fertilizer or pesticide been applied in the last 5–7 days?",
    allowed: (obs) => obs.sprayMentioned || (obs.leafBurnReported && !obs.lesionEvidence),
    admit: (obs) => obs.sprayMentioned || (obs.leafBurnReported && !obs.lesionEvidence),
  },
  HEAT_STRESS: {
    id: "HEAT_STRESS",
    category: "environmental stress",
    farmerLabel: "Heat or weather stress",
    crops: ALL,
    farmerWhy: "Heat can add stress but does not by itself prove a disease.",
    increasesIf: "Symptoms line up with a heat spike or sun scorch.",
    decreasesIf: "The pattern is a classic nutrient or pest picture on otherwise mild days.",
    checks: ["Did the damage start after very hot, windy, or sudden weather?"],
    actions: ["Shade or water only if the soil is actually dry"],
    avoid: ["Do not treat heat scorch as a leaf-spot disease"],
    nextQuestion: "Did this start after very hot days or strong sun?",
    allowed: (obs) => obs.heatEvidence,
    admit: (obs) => obs.heatEvidence,
  },
  TIP_EDGE_BURN: {
    id: "TIP_EDGE_BURN",
    category: "nutrition",
    farmerLabel: "Tip or edge burn from water, salt, or nutrient stress",
    crops: ["celery", "lettuce", "cabbage"],
    farmerWhy:
      "Brown tips or edges without separate spots usually start as watering, salt, or nutrient transport, not a leaf-spot disease.",
    increasesIf: "Browning starts at the tip or edge and older leaves are worse.",
    decreasesIf: "You see separate spots, rings, or mould rather than a clean margin burn.",
    checks: [
      "Is the burn starting at the tip or edge, or as separate spots?",
      "Are older leaves worse than new growth?",
    ],
    actions: [
      "Avoid increasing fertilizer or applying another pesticide until we narrow it down",
      "Check soil moisture and drainage",
    ],
    avoid: [
      "Do not increase fertilizer yet",
      "Do not apply another pesticide until we know whether this is burn, disease, or insects",
    ],
    nextQuestion: "Are the brown or yellow areas starting at the leaf tips, edges, or as separate spots?",
    allowed: (obs) =>
      cropAllowed(CAUSE_CATALOG.TIP_EDGE_BURN, obs.cropKey) &&
      (obs.leafBurnReported || (obs.yellowingReported && !obs.lesionEvidence)),
    admit: (obs) => obs.leafBurnReported || (obs.yellowingReported && !obs.lesionEvidence),
  },
};

export const LESION_CAUSE_IDS: CauseId[] = CAUSE_IDS.filter(
  (id) => CAUSE_CATALOG[id].requiresLesionEvidence,
);

const LABEL_TO_ID: Array<{ pattern: RegExp; id: CauseId }> = [
  { pattern: /\bcercospora|frogeye/i, id: "CERCOSPORA" },
  { pattern: /\bbacterial leaf spot|\bbacterial spot\b/i, id: "BACTERIAL_LEAF_SPOT" },
  { pattern: /\bfungal leaf spot/i, id: "FUNGAL_LEAF_SPOT" },
  { pattern: /\bseptoria/i, id: "SEPTORIA" },
  { pattern: /\bearly blight/i, id: "EARLY_BLIGHT" },
  { pattern: /\bwhitefl/i, id: "WHITEFLY" },
  { pattern: /\baphids?|sucking insects?/i, id: "APHIDS" },
  { pattern: /\bmites?\b/i, id: "MITES" },
  { pattern: /\bthrips\b/i, id: "THRIPS" },
  { pattern: /\bvirus\b/i, id: "VIRUS_SUSPECTED" },
  { pattern: /\bwaterlog/i, id: "WATERLOGGING" },
  { pattern: /\broot or water|\broot-zone|\broots? (?:under )?stress/i, id: "ROOT_WATER_STRESS" },
  { pattern: /\bnutrient|uneven feeding|nitrogen/i, id: "NUTRIENT_PATTERN" },
  { pattern: /\bherbicide|spray injury|phytotoxic/i, id: "HERBICIDE_INJURY" },
  { pattern: /\bheat|weather stress/i, id: "HEAT_STRESS" },
  { pattern: /\bbacterial wilt/i, id: "BACTERIAL_WILT" },
  { pattern: /\broot or stem|stem-base rot|root rot/i, id: "ROOT_ROT" },
  { pattern: /\btip or edge burn|leaf-tip burn/i, id: "TIP_EDGE_BURN" },
];

export function isCauseId(value: string): value is CauseId {
  return (CAUSE_IDS as readonly string[]).includes(value);
}

export function causeIdFromLabel(label: string): CauseId | null {
  const trimmed = label.trim();
  if (isCauseId(trimmed)) return trimmed;
  for (const item of LABEL_TO_ID) {
    if (item.pattern.test(trimmed)) return item.id;
  }
  return null;
}

export function farmerNamedCauseIds(text: string): CauseId[] {
  const ids: CauseId[] = [];
  for (const item of LABEL_TO_ID) {
    if (item.pattern.test(text) && !ids.includes(item.id)) ids.push(item.id);
  }
  return ids;
}

export function allowedCauseIds(obs: PipelineObservations): CauseId[] {
  return CAUSE_IDS.filter((id) => {
    const def = CAUSE_CATALOG[id];
    if (
      def.requiresLesionEvidence &&
      !obs.lesionEvidence &&
      !obs.farmerNamedCauseIds.includes(id)
    ) {
      return false;
    }
    if (obs.farmerNamedCauseIds.includes(id) && cropAllowed(def, obs.cropKey)) {
      return true;
    }
    return def.allowed(obs);
  });
}

export function admitCauseIds(obs: PipelineObservations, allowed: CauseId[]): CauseId[] {
  return allowed.filter((id) => {
    const def = CAUSE_CATALOG[id];
    if (
      def.requiresLesionEvidence &&
      !obs.lesionEvidence &&
      !obs.farmerNamedCauseIds.includes(id)
    ) {
      return false;
    }
    if (obs.farmerNamedCauseIds.includes(id)) return true;
    return def.admit(obs);
  });
}

export function forbiddenCauseNames(obs: PipelineObservations): string[] {
  const allowed = new Set(allowedCauseIds(obs));
  return CAUSE_IDS.filter((id) => !allowed.has(id)).map((id) => CAUSE_CATALOG[id].farmerLabel);
}
