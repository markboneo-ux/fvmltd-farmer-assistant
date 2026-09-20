/**
 * Structured internal crop-health case state.
 * Stored on the case (business_metadata + mapped columns). Never shown as raw JSON.
 */

import type { RankedCause } from "./causes";
import type { DiagnosisConfidence } from "./diagnosis-confidence";
import type { FollowUpOutcome } from "@/lib/cases/types";
import type { WeatherCoordinates } from "@/lib/weather/provider";

export const CROP_HEALTH_PHOTO_VIEWS = [
  "underside_of_leaf",
  "whole_plant",
  "roots",
  "stem_lesion",
  "cut_fruit",
  "field_pattern",
  "affected_leaf_front",
  "healthy_comparison",
] as const;

export type CropHealthPhotoView = (typeof CROP_HEALTH_PHOTO_VIEWS)[number];

export type SuspectedCauseEntry = {
  label: string;
  category: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  rank: number;
};

export type CropHealthCaseState = {
  country: string | null;
  farmingArea: string | null;
  coordinates: WeatherCoordinates | null;
  crop: string | null;
  variety: string | null;
  growthStage: string | null;
  symptoms: string[];
  symptomLocation: string | null;
  onset: string | null;
  spread: string | null;
  percentageAffected: string | null;
  recentRainfall: string | null;
  forecastRainfall: string | null;
  temperature: string | null;
  humidity: string | null;
  drainage: string | null;
  irrigation: string | null;
  recentFertilizer: string | null;
  recentSprays: string | null;
  photoFindings: string[];
  suspectedCauses: SuspectedCauseEntry[];
  diagnosticConfidence: DiagnosisConfidence | "unknown";
  missingInformation: string[];
  recommendedActions: string[];
  outcome: FollowUpOutcome | null;
  observedSymptoms: string[];
  notReportedSymptoms: string[];
  suspectedPest: string | null;
  suspectedDiseaseOrDisorder: string | null;
  suspectedCause: string | null;
  confirmedDiagnosis: string | null;
  nextDistinguishingCheck: string | null;
  requestedPhotoView: CropHealthPhotoView | null;
  agronomicMode?: string | null;
  farmerIntent?: string | null;
  lastDiagnosticQuestion?: string | null;
  answeredDiagnosticQuestions?: string[];
  caseNarrative?: string | null;
  photoSupports?: string[];
  photoWeakens?: string[];
  photoUnknown?: string[];
};

export const CROP_HEALTH_STATE_KEY = "cropHealthState";

export function emptyCropHealthState(
  overrides: Partial<CropHealthCaseState> = {},
): CropHealthCaseState {
  return {
    country: null,
    farmingArea: null,
    coordinates: null,
    crop: null,
    variety: null,
    growthStage: null,
    symptoms: [],
    symptomLocation: null,
    onset: null,
    spread: null,
    percentageAffected: null,
    recentRainfall: null,
    forecastRainfall: null,
    temperature: null,
    humidity: null,
    drainage: null,
    irrigation: null,
    recentFertilizer: null,
    recentSprays: null,
    photoFindings: [],
    suspectedCauses: [],
    diagnosticConfidence: "unknown",
    missingInformation: [],
    recommendedActions: [],
    outcome: null,
    observedSymptoms: [],
    notReportedSymptoms: [],
    suspectedPest: null,
    suspectedDiseaseOrDisorder: null,
    suspectedCause: null,
    confirmedDiagnosis: null,
    nextDistinguishingCheck: null,
    requestedPhotoView: null,
    agronomicMode: null,
    farmerIntent: null,
    lastDiagnosticQuestion: null,
    answeredDiagnosticQuestions: [],
    caseNarrative: null,
    photoSupports: [],
    photoWeakens: [],
    photoUnknown: [],
    ...overrides,
  };
}

function pickText(current: string | null, incoming: string | null | undefined): string | null {
  const next = incoming?.trim() || null;
  if (!next) return current;
  return next;
}

function pickList(current: string[], incoming: string[] | undefined): string[] {
  if (!incoming?.length) return current;
  return [...new Set([...current, ...incoming].map((item) => item.trim()).filter(Boolean))];
}

export function mergeCropHealthState(
  current: CropHealthCaseState | null | undefined,
  incoming: Partial<CropHealthCaseState>,
): CropHealthCaseState {
  const base = current ? { ...current } : emptyCropHealthState();
  return {
    country: pickText(base.country, incoming.country),
    farmingArea: pickText(base.farmingArea, incoming.farmingArea),
    coordinates: incoming.coordinates ?? base.coordinates,
    crop: pickText(base.crop, incoming.crop),
    variety: pickText(base.variety, incoming.variety),
    growthStage: pickText(base.growthStage, incoming.growthStage),
    symptoms: pickList(base.symptoms, incoming.symptoms),
    symptomLocation: pickText(base.symptomLocation, incoming.symptomLocation),
    onset: pickText(base.onset, incoming.onset),
    spread: pickText(base.spread, incoming.spread),
    percentageAffected: pickText(base.percentageAffected, incoming.percentageAffected),
    recentRainfall: pickText(base.recentRainfall, incoming.recentRainfall),
    forecastRainfall: pickText(base.forecastRainfall, incoming.forecastRainfall),
    temperature: pickText(base.temperature, incoming.temperature),
    humidity: pickText(base.humidity, incoming.humidity),
    drainage: pickText(base.drainage, incoming.drainage),
    irrigation: pickText(base.irrigation, incoming.irrigation),
    recentFertilizer: pickText(base.recentFertilizer, incoming.recentFertilizer),
    recentSprays: pickText(base.recentSprays, incoming.recentSprays),
    photoFindings: pickList(base.photoFindings, incoming.photoFindings),
    suspectedCauses:
      incoming.suspectedCauses && incoming.suspectedCauses.length > 0
        ? incoming.suspectedCauses.slice(0, 3)
        : base.suspectedCauses,
    diagnosticConfidence: incoming.diagnosticConfidence ?? base.diagnosticConfidence,
    missingInformation: incoming.missingInformation?.length
      ? incoming.missingInformation
      : base.missingInformation,
    recommendedActions: incoming.recommendedActions?.length
      ? incoming.recommendedActions
      : base.recommendedActions,
    outcome: incoming.outcome ?? base.outcome,
    observedSymptoms: pickList(base.observedSymptoms, incoming.observedSymptoms),
    notReportedSymptoms: pickList(base.notReportedSymptoms, incoming.notReportedSymptoms),
    suspectedPest: pickText(base.suspectedPest, incoming.suspectedPest),
    suspectedDiseaseOrDisorder: pickText(
      base.suspectedDiseaseOrDisorder,
      incoming.suspectedDiseaseOrDisorder,
    ),
    suspectedCause: pickText(base.suspectedCause, incoming.suspectedCause),
    confirmedDiagnosis:
      incoming.confirmedDiagnosis === null
        ? null
        : pickText(base.confirmedDiagnosis, incoming.confirmedDiagnosis),
    nextDistinguishingCheck: pickText(
      base.nextDistinguishingCheck,
      incoming.nextDistinguishingCheck,
    ),
    requestedPhotoView: incoming.requestedPhotoView ?? base.requestedPhotoView,
    agronomicMode: incoming.agronomicMode ?? base.agronomicMode ?? null,
    farmerIntent: pickText(base.farmerIntent ?? null, incoming.farmerIntent),
    lastDiagnosticQuestion: pickText(
      base.lastDiagnosticQuestion ?? null,
      incoming.lastDiagnosticQuestion,
    ),
    answeredDiagnosticQuestions: pickList(
      base.answeredDiagnosticQuestions ?? [],
      incoming.answeredDiagnosticQuestions,
    ),
    caseNarrative: pickText(base.caseNarrative ?? null, incoming.caseNarrative),
    photoSupports: pickList(base.photoSupports ?? [], incoming.photoSupports),
    photoWeakens: pickList(base.photoWeakens ?? [], incoming.photoWeakens),
    photoUnknown: pickList(base.photoUnknown ?? [], incoming.photoUnknown),
  };
}

export function suspectedCausesFromRanked(causes: RankedCause[]): SuspectedCauseEntry[] {
  return causes.slice(0, 3).map((cause) => ({
    label: cause.label,
    category: cause.category,
    evidenceFor: cause.increasesIf ? [cause.increasesIf] : [],
    evidenceAgainst: cause.decreasesIf ? [cause.decreasesIf] : [],
    rank: cause.rank,
  }));
}

export function cropHealthStateFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): CropHealthCaseState | null {
  const raw = metadata?.[CROP_HEALTH_STATE_KEY];
  if (!raw || typeof raw !== "object") return null;
  return mergeCropHealthState(emptyCropHealthState(), raw as Partial<CropHealthCaseState>);
}

export function withCropHealthState(
  metadata: Record<string, unknown> | null | undefined,
  state: CropHealthCaseState,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    [CROP_HEALTH_STATE_KEY]: state,
  };
}

export function isMeaningfulCropHealthCase(state: Pick<CropHealthCaseState, "crop" | "symptoms" | "observedSymptoms">): boolean {
  return Boolean(state.crop || state.symptoms.length > 0 || state.observedSymptoms.length > 0);
}

export function cropHealthMissingFields(state: CropHealthCaseState): string[] {
  const missing: string[] = [];
  if (!state.crop) missing.push("crop");
  if (!state.farmingArea && !state.country) missing.push("farming_area");
  if (!state.symptomLocation && state.symptoms.length > 0) missing.push("symptom_location");
  if (!state.spread && !state.percentageAffected) missing.push("spread");
  if (!state.growthStage) missing.push("growth_stage");
  return missing;
}
