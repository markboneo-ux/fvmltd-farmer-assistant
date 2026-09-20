/**
 * Strict evidence hierarchy for crop-health reasoning.
 * A generic playbook must never override stronger evidence.
 */

import type { KnownFarmerFacts } from "./tomato-protocol";
import type { AgronomicWeatherSignal } from "./agronomic-weather";

export const EVIDENCE_TIERS = [
  "farmer_observation",
  "photo_evidence",
  "case_context",
  "lab_or_staff",
  "symptom_pattern",
  "weather",
  "field_history",
  "similar_cases",
  "generic_fallback",
] as const;

export type EvidenceTier = (typeof EVIDENCE_TIERS)[number];

export const OBSERVED_PESTS = [
  "whiteflies",
  "aphids",
  "thrips",
  "mites",
  "caterpillars",
] as const;

export type ObservedPest = (typeof OBSERVED_PESTS)[number];

export type ObservedEvidence = {
  explicitObservations: string[];
  observedPest: ObservedPest | null;
  observedPestLabel: string | null;
  photoEvidence: string[];
  labOrStaffResult: boolean;
  symptoms: string[];
  symptomLocation: string | null;
  wetFromFarmer: boolean;
  dryFromFarmer: boolean;
  heatFromFarmer: boolean;
  secondUnexplainedSymptom: boolean;
  weatherSignals: AgronomicWeatherSignal[];
};

const PEST_PATTERNS: Array<{ id: ObservedPest; pattern: RegExp; label: string }> = [
  { id: "whiteflies", pattern: /\bwhite\s*fl(y|ies)\b/i, label: "whiteflies" },
  { id: "aphids", pattern: /\baphids?\b/i, label: "aphids" },
  { id: "thrips", pattern: /\bthrips\b/i, label: "thrips" },
  { id: "mites", pattern: /\b(spider\s*)?mites?\b/i, label: "mites" },
  { id: "caterpillars", pattern: /\b(caterpillars?|worms?|loopers?)\b/i, label: "caterpillars" },
];

export function observedPestFromText(text: string): { id: ObservedPest; label: string } | null {
  const lower = text.toLowerCase();
  for (const item of PEST_PATTERNS) {
    if (item.pattern.test(lower)) return { id: item.id, label: item.label };
  }
  return null;
}

export function farmerReportedWetWeather(text: string): boolean {
  return /\b(week of rain|days of rain|heavy rain|prolonged rain|after (the )?rain|wet weather|lots of rain|rain(ing|ed)? (for|all) (a )?(week|days)|waterlog)\b/i.test(
    text,
  );
}

export function extractObservedEvidence(options: {
  facts?: KnownFarmerFacts | null;
  text?: string;
  hasPhotos?: boolean;
  photoFindings?: string[];
  labOrStaffResult?: boolean;
  weatherSignals?: AgronomicWeatherSignal[];
}): ObservedEvidence {
  const text = [options.text ?? options.facts?.rawText ?? "", ...(options.photoFindings ?? [])]
    .filter(Boolean)
    .join(" ")
    .trim();
  const lower = text.toLowerCase();
  const pest = observedPestFromText(text);
  const facts = options.facts ?? null;

  const symptoms: string[] = [];
  const deniesSpots = /\bno (discrete )?(leaf[- ]?)?spots?\b/.test(lower);
  if (/\b(spots?|lesions?|leaf[- ]spot)\b/.test(lower) && !deniesSpots) {
    symptoms.push("spots");
  }
  if (/\byellow/.test(lower)) symptoms.push("yellowing");
  if (/\bcurl/.test(lower)) symptoms.push("leaf curl");
  if (/\bwilt/.test(lower)) symptoms.push("wilt");
  if (/\b(burn(?:ing|t)?|scorch|brown (tips?|edges?))\b/.test(lower)) symptoms.push("leaf burn");
  if (/\b(sticky|honeydew|sooty)\b/.test(lower)) symptoms.push("honeydew");
  if (pest) symptoms.push(pest.label);
  if (facts?.suspectedIssue && !symptoms.includes(facts.suspectedIssue)) {
    symptoms.push(facts.suspectedIssue);
  }

  const location = /\b(lower leaves|older leaves|leaf tips?|edges?|underside|roots?|stem)\b/i.exec(
    text,
  );

  const wetFromFarmer = farmerReportedWetWeather(text) || Boolean(facts && /\b(wet|waterlog|drain|flood)\b/i.test(facts.rawText));
  const dryFromFarmer = /\b(dry|drought|no rain)\b/i.test(lower);
  const heatFromFarmer = /\b(heat|hot days?|sun scorch)\b/i.test(lower);

  const weatherSignals: AgronomicWeatherSignal[] = [...(options.weatherSignals ?? [])];
  if (wetFromFarmer) {
    if (!weatherSignals.includes("prolonged_wetness")) weatherSignals.push("prolonged_wetness");
    if (!weatherSignals.includes("disease_pressure")) weatherSignals.push("disease_pressure");
  }
  if (dryFromFarmer && !weatherSignals.includes("dry_conditions")) {
    weatherSignals.push("dry_conditions");
  }
  if (heatFromFarmer && !weatherSignals.includes("heat_stress")) {
    weatherSignals.push("heat_stress");
  }

  const explicitObservations: string[] = [];
  if (pest) explicitObservations.push(`observed_pest:${pest.id}`);
  if (facts?.crop) explicitObservations.push(`crop:${facts.crop}`);
  if (facts?.district) explicitObservations.push(`area:${facts.district}`);
  if (facts?.country) explicitObservations.push(`country:${facts.country}`);
  if (location) explicitObservations.push(`location:${location[0].toLowerCase()}`);

  return {
    explicitObservations,
    observedPest: pest?.id ?? (facts?.suspectedIssue === "whiteflies" ? "whiteflies" : null),
    observedPestLabel: pest?.label ?? (facts?.suspectedIssue === "whiteflies" ? "whiteflies" : null),
    photoEvidence: options.hasPhotos ? (options.photoFindings ?? ["photo_attached"]) : [],
    labOrStaffResult: Boolean(options.labOrStaffResult),
    symptoms,
    symptomLocation: location?.[0]?.toLowerCase() ?? null,
    wetFromFarmer,
    dryFromFarmer,
    heatFromFarmer,
    secondUnexplainedSymptom: hasSecondUnexplainedSymptom(lower, pest?.id ?? null),
    weatherSignals,
  };
}

function hasSecondUnexplainedSymptom(text: string, pest: ObservedPest | null): boolean {
  if (!pest) return false;
  if (pest === "whiteflies") {
    const extraWilt = /\bwilt/.test(text);
    const extraRot = /\b(rot|canker|stem lesion)\b/.test(text);
    const extraHoles = /\bholes?\b/.test(text);
    return extraWilt || extraRot || extraHoles;
  }
  return /\b(wilt|rot|spots?|blight)\b/.test(text);
}

export function isGenericFallbackCause(label: string): boolean {
  const lower = label.toLowerCase();
  return (
    /root-zone stress/.test(lower) ||
    /nutrient imbalance/.test(lower) ||
    /foliar disease or insect/.test(lower) ||
    /heat, wind, or weather stress/.test(lower) ||
    /could be heat/.test(lower)
  );
}

export function genericCauseList(labels: string[]): boolean {
  const genericCount = labels.filter(isGenericFallbackCause).length;
  return labels.length > 0 && genericCount >= Math.min(2, labels.length);
}

export function weatherChangesDecision(options: {
  weatherText: string | null | undefined;
  rankedLabels: string[];
  signals: AgronomicWeatherSignal[];
}): boolean {
  if (!options.weatherText?.trim()) return options.signals.length > 0 && options.rankedLabels.length > 0;
  if (options.signals.length === 0) return false;
  const text = options.weatherText.toLowerCase();
  const mentionsUse =
    /\b(more likely|less likely|raises?|increases?|poor spray|do not spray|wait to spray|wash off|rain chance|before (i |you )?spray|spray timing|wetness|leaf-disease|disease pressure|heat stress|dry)\b/.test(
      text,
    );
  return mentionsUse;
}
