/**
 * Agronomic response modes. Do not use one template for every crop-health case.
 */

import type { ObservedEvidence } from "./evidence-hierarchy";
import type { KnownFarmerFacts } from "./tomato-protocol";

export const AGRONOMIC_MODES = [
  "UNKNOWN_CAUSE_DIAGNOSIS",
  "OBSERVED_PEST_MANAGEMENT",
  "SUSPECTED_DISEASE_DIAGNOSIS",
  "CONFIRMED_DISEASE_MANAGEMENT",
  "NUTRITION_ROOTZONE",
  "ENVIRONMENTAL_STRESS",
  "GENERAL_CROP_MANAGEMENT",
] as const;

export type AgronomicMode = (typeof AGRONOMIC_MODES)[number];

export function agronomicModeFor(options: {
  evidence: ObservedEvidence;
  facts?: KnownFarmerFacts | null;
  labOrStaffConfirmedDisease?: boolean;
}): AgronomicMode {
  const { evidence, facts } = options;
  const text = (facts?.rawText ?? "").toLowerCase();

  if (options.labOrStaffConfirmedDisease) {
    return "CONFIRMED_DISEASE_MANAGEMENT";
  }

  if (evidence.observedPest && !evidence.secondUnexplainedSymptom) {
    return "OBSERVED_PEST_MANAGEMENT";
  }

  if (facts?.suddenWilt || (/\bwilt/.test(text) && /\b(overnight|sudden|whole field|pull)\b/.test(text))) {
    return "SUSPECTED_DISEASE_DIAGNOSIS";
  }

  if (
    evidence.symptoms.includes("spots") ||
    /\b(blight|mildew|mould|mold|leaf spot|anthracnose|sigatoka|cercospora|septoria)\b/.test(text)
  ) {
    return "SUSPECTED_DISEASE_DIAGNOSIS";
  }

  if (
    evidence.symptoms.includes("leaf curl") ||
    /\bcurl/.test(text)
  ) {
    return "UNKNOWN_CAUSE_DIAGNOSIS";
  }

  if (
    /\b(yellow|chloros|pale)\b/.test(text) &&
    !evidence.symptoms.includes("spots") &&
    !evidence.observedPest
  ) {
    return "NUTRITION_ROOTZONE";
  }

  if (
    /\b(burn|scorch|brown (tips?|edges?)|heat|wind burn)\b/.test(text) &&
    !evidence.symptoms.includes("spots")
  ) {
    return /\b(tip|edge|fertilizer|salt|water)\b/.test(text)
      ? "NUTRITION_ROOTZONE"
      : "ENVIRONMENTAL_STRESS";
  }

  if (facts?.crop && (evidence.symptoms.length > 0 || facts.suspectedIssue)) {
    return "UNKNOWN_CAUSE_DIAGNOSIS";
  }

  return "GENERAL_CROP_MANAGEMENT";
}

export function shouldShowRankedCauses(
  mode: AgronomicMode,
  evidence: ObservedEvidence,
): boolean {
  if (mode === "OBSERVED_PEST_MANAGEMENT" && !evidence.secondUnexplainedSymptom) {
    return false;
  }
  if (mode === "CONFIRMED_DISEASE_MANAGEMENT") return false;
  if (mode === "GENERAL_CROP_MANAGEMENT") return false;
  return (
    mode === "UNKNOWN_CAUSE_DIAGNOSIS" ||
    mode === "SUSPECTED_DISEASE_DIAGNOSIS" ||
    mode === "NUTRITION_ROOTZONE" ||
    mode === "ENVIRONMENTAL_STRESS"
  );
}

export function modeAnswerGuide(mode: AgronomicMode): string {
  switch (mode) {
    case "OBSERVED_PEST_MANAGEMENT":
      return `MODE: OBSERVED_PEST_MANAGEMENT.
The farmer already reported a pest. Do NOT rank heat, wind, nutrient imbalance, or generic foliar disease as the cause of that pest.
Answer as pest management: confirm population/life stages, underside of leaves, honeydew/sooty mould, virus symptoms if relevant, hotspot vs field-wide, beneficial insects, monitoring, locally verified insecticide options if available, IRAC rotation if chemical control is relevant.
Weather may affect reproduction, spray timing, or natural enemies — it does not replace the observed pest.
Do not emit a "Possible causes ranked" list unless there is a second unexplained symptom.`;
    case "SUSPECTED_DISEASE_DIAGNOSIS":
      return `MODE: SUSPECTED_DISEASE_DIAGNOSIS.
Use crop-specific disease possibilities ranked by evidence (crop + symptom + weather + biology). Do not lead with generic root-zone / nutrient / foliar-or-insect cards.
Do not call a field test "confirmation" unless it is a lab or specialist result.`;
    case "CONFIRMED_DISEASE_MANAGEMENT":
      return `MODE: CONFIRMED_DISEASE_MANAGEMENT.
The disease is confirmed by lab or specialist evidence. Focus on management, not a wide differential.`;
    case "NUTRITION_ROOTZONE":
      return `MODE: NUTRITION_ROOTZONE.
Separate watering, salt/EC, and nutrient pattern from disease. Disease rises only if discrete spots or lesions are present.`;
    case "ENVIRONMENTAL_STRESS":
      return `MODE: ENVIRONMENTAL_STRESS.
Weather or physical stress is in play. Do not invent an unrelated crop disease.`;
    case "GENERAL_CROP_MANAGEMENT":
      return `MODE: GENERAL_CROP_MANAGEMENT.
This is not a diagnosis card. Answer the management question directly.`;
    default:
      return `MODE: UNKNOWN_CAUSE_DIAGNOSIS.
Internally rank 1–3 crop-relevant causes from evidence. A generic playbook is the last resort, never the first.`;
  }
}
