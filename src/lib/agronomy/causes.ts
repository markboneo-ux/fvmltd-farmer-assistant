/**
 * Rank plausible plant-problem causes. Do not force pest/disease.
 * Crop-specific evidence outranks a generic fallback.
 */

import type { AgronomicWeatherSignal } from "./agronomic-weather";
import { rankCropCauses } from "./crop-differentials";
import {
  extractObservedEvidence,
  isGenericFallbackCause,
  type ObservedEvidence,
} from "./evidence-hierarchy";
import type { KnownFarmerFacts } from "./tomato-protocol";

export const CAUSE_CATEGORIES = [
  "nutrition",
  "irrigation",
  "drainage",
  "pH / EC",
  "root health",
  "fungal disease",
  "bacterial disease",
  "viral disease",
  "insects",
  "mites",
  "herbicide injury",
  "environmental stress",
  "salinity",
  "physical damage",
  "age/senescence",
] as const;

export type CauseCategory = (typeof CAUSE_CATEGORIES)[number];

export type RankedCause = {
  category: CauseCategory;
  label: string;
  rank: number;
  why: string;
  increasesIf: string;
  decreasesIf: string;
};

export type RankDiagnosticOptions = {
  crop?: string | null;
  facts?: KnownFarmerFacts | null;
  weatherSignals?: AgronomicWeatherSignal[];
  evidence?: ObservedEvidence;
  hasPhotos?: boolean;
};

export function rankDiagnosticCauses(
  text: string,
  options: RankDiagnosticOptions = {},
): RankedCause[] {
  const evidence =
    options.evidence ??
    extractObservedEvidence({
      facts: options.facts ?? null,
      text,
      hasPhotos: options.hasPhotos,
      weatherSignals: options.weatherSignals,
    });
  const crop = options.crop ?? options.facts?.crop ?? null;
  const lower = text.toLowerCase();

  const cropSpecific = rankCropCauses({
    text,
    crop,
    evidence,
    limit: 5,
  });

  if (evidence.observedPest && !evidence.secondUnexplainedSymptom) {
    return cropSpecific
      .filter((item) => item.category === "insects" || item.category === "mites" || item.category === "viral disease")
      .slice(0, 3)
      .map((item, index) => ({ ...item, rank: index + 1 }));
  }

  if (crop && cropSpecific.length >= 2) {
    return cropSpecific.slice(0, 3).map((item, index) => ({ ...item, rank: index + 1 }));
  }

  const scored: Array<RankedCause & { score: number }> = cropSpecific.map((item) => ({
    ...item,
    score: 10 - item.rank,
  }));

  const add = (
    category: CauseCategory,
    score: number,
    label: string,
    why: string,
    increasesIf: string,
    decreasesIf: string,
  ) => {
    if (score <= 0) return;
    if (scored.some((item) => item.label === label)) return;
    scored.push({ category, score, label, rank: 0, why, increasesIf, decreasesIf });
  };

  const yellowNoSpots =
    /\byellow/.test(lower) && /\bno spots?\b/.test(lower);
  const yellow = /\byellow|chloros/.test(lower);
  const spots = /\b(spots?|blight|mildew|mould|mold)\b/.test(lower) && !/\bno spots?\b/.test(lower);
  const wilt = /\bwilt/.test(lower);
  const wet = evidence.wetFromFarmer || /\b(wet|waterlog|drain|flood|heavy rain)\b/.test(lower);
  const dry = /\b(dry|drought|under.?water)\b/.test(lower);
  const insects = /\b(white\s*fl|aphid|thrips|worm|caterpillar|insect|holes?)\b/.test(lower);
  const mites = /\bmites?\b/.test(lower);
  const herbicide = /\b(herbicide|roundup|drift|spray burn)\b/.test(lower);
  const oldLeaves = /\b(old|older|lower) (leaves|leaf)\b/.test(lower);
  const youngLeaves = /\b(young|new|upper) (leaves|leaf)\b/.test(lower);

  if (yellowNoSpots) {
    add(
      "nutrition",
      8,
      "Nitrogen or other nutrient shortage",
      "Yellowing without spots often starts as nutrition, water, or root stress rather than a leaf-spot disease.",
      "Yellowing starts on older leaves and moves up, plants otherwise look even.",
      "You find spots, mould, sticky insects, or a sharp patch of sudden collapse.",
    );
    add(
      "root health",
      7,
      "Root stress",
      "Roots that are damaged, crowded, or sitting wet cannot feed the leaves.",
      "Plants pull easily, roots are brown or smell sour, or the soil stays wet.",
      "Roots are white and the soil drains in a few hours.",
    );
    add(
      "drainage",
      6,
      "Wet soil / poor drainage",
      "Waterlogging yellows leaves without making leaf spots.",
      "Low spots in the field are worse after rain.",
      "The same yellowing happens on raised, well-drained beds.",
    );
    add(
      "age/senescence",
      5,
      "Older-leaf ageing",
      "Lower leaves naturally fade as the plant puts growth into new leaves or harvest.",
      "Only the oldest leaves are yellow and new growth is green.",
      "New leaves are yellow, or the whole plant is fading quickly.",
    );
    add(
      "irrigation",
      4,
      "Water stress",
      "Too little or irregular water can yellow leaves without spots.",
      "Soil is dry around the roots at the same time leaves fade.",
      "Moisture is even and only one nutrient pattern fits.",
    );
  }

  if (yellow && youngLeaves && !spots) {
    add(
      "nutrition",
      7,
      "Mobile vs immobile nutrient pattern",
      "Yellow new leaves point to different nutrients than yellow old leaves.",
      "Newest leaves are pale while old leaves stay greener.",
      "Only the oldest leaves are yellow.",
    );
  }

  if (spots && cropSpecific.length === 0) {
    add(
      "fungal disease",
      wet ? 10 : 8,
      "Fungal leaf disease",
      "Spots, blight, or mould on leaves can be fungal, especially in humid weather.",
      "Spots have a pattern, rings, or mould and spread in wet weather.",
      "There are no spots and the yellowing is even.",
    );
    add(
      "bacterial disease",
      wet ? 7 : 5,
      "Bacterial leaf problem",
      "Some leaf spots are bacterial, especially with water-soaking or sticky ooze.",
      "Spots look water-soaked or the stem oozes.",
      "The pattern is even yellowing with no lesions.",
    );
  }

  if (wilt && cropSpecific.length === 0) {
    add(
      "bacterial disease",
      8,
      "Wilt disease (including bacterial wilt)",
      "Sudden wilt with green leaves can be a vascular disease, but roots and waterlogging can look similar.",
      "A cut stem streams milky bacteria in water, or neighbouring plants collapse fast.",
      "Only the soil is wet and plants recover when it dries.",
    );
    add(
      "root health",
      7,
      "Root or stem-base problem",
      "Root rot and stem-base damage wilt plants without a leaf-spot pattern.",
      "Stem base is brown or roots are rotten.",
      "Roots and stem base are clean.",
    );
    add(
      "drainage",
      6,
      "Waterlogging",
      "Saturated soil suffocates roots and causes wilt.",
      "The worst plants sit in puddles.",
      "The field drains quickly and only scattered plants wilt.",
    );
  }

  if (wet && !spots) {
    add("drainage", 5, "Drainage", "Wet soil changes root function.", "Water sits more than a day.", "Soil dries within hours.");
  }
  if (dry) {
    add("irrigation", 5, "Irrigation", "Dry roots yellow or wilt without disease spots.", "Soil is powder-dry at root depth.", "Moisture is adequate.");
  }
  if (insects && !evidence.observedPest) {
    add(
      "insects",
      7,
      "Insect feeding",
      "Insects can yellow, curl, or hole leaves.",
      "You see insects, sticky honeydew, or feeding on the underside.",
      "No insects and an even yellowing from the base of the plant.",
    );
  }
  if (mites) {
    add("mites", 7, "Mites", "Mites stipple leaves and are often on the underside.", "Fine webbing or tiny movers under the leaf.", "Underside is clean.");
  }
  if (herbicide) {
    add(
      "herbicide injury",
      8,
      "Herbicide injury",
      "Drift or residue can twist, bleach, or yellow leaves in odd patterns.",
      "A spray was used nearby, or symptoms ignore plant rows in a drift pattern.",
      "No herbicide was used and neighbours are healthy in a disease-like spread.",
    );
  }
  if (oldLeaves && yellow && !spots) {
    add(
      "age/senescence",
      3,
      "Ageing lower leaves",
      "Older leaves fade first as the crop matures.",
      "Only lower leaves, new growth healthy.",
      "New growth is also pale.",
    );
  }

  const allowWeatherStress =
    !evidence.observedPest &&
    !spots &&
    cropSpecific.length === 0 &&
    (yellow || wilt || evidence.heatFromFarmer);

  if (allowWeatherStress) {
    add(
      "environmental stress",
      evidence.heatFromFarmer ? 5 : 3,
      "Heat, wind, or weather stress",
      "Weather can add stress but does not by itself prove a disease.",
      "Symptoms line up with a heat spike, wind burn, or sudden rain.",
      "The pattern is a classic nutrient or pest picture on otherwise mild days.",
    );
  }

  scored.sort((a, b) => b.score - a.score);
  return scored
    .filter((item) => !isGenericFallbackCause(item.label) || cropSpecific.length === 0)
    .slice(0, 5)
    .map((item, index) => ({
      category: item.category,
      label: item.label,
      rank: index + 1,
      why: item.why,
      increasesIf: item.increasesIf,
      decreasesIf: item.decreasesIf,
    }));
}

export function rankedCausesForPrompt(causes: RankedCause[], options?: { observedPest?: string | null }): string {
  if (causes.length === 0) return "";
  const lines = [
    options?.observedPest
      ? `The farmer explicitly reported ${options.observedPest}. That observation outranks any generic abiotic differential.`
      : "Consider several cause categories before answering. Ranked possibilities from the farmer's description:",
  ];
  for (const cause of causes) {
    lines.push(
      `${cause.rank}. ${cause.label} (${cause.category}). ${cause.why} More likely if: ${cause.increasesIf} Less likely if: ${cause.decreasesIf}`,
    );
  }
  if (!options?.observedPest) {
    lines.push("Do not force this into a pest/disease diagnosis if nutrition, water, roots, or age fit better.");
    lines.push("If the crop is known, prefer crop-relevant causes over generic root-zone / nutrient / foliar-or-insect cards.");
  }
  return lines.join("\n");
}
