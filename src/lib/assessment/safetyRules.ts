import type {
  ConfidenceBand,
  GuidanceMode,
  PreliminaryAssessmentJson,
  SafetyEvaluation,
} from "./types";

export type SafetyCaseSignals = {
  percentAffected: number | null;
  problemDescription: string | null;
  fertilizerHistory: string | null;
  sprayHistory: string | null;
  likelyCauses: string[];
  caseSummary: string;
  urgencyLevel: string;
  approvedProtocolExists?: boolean | null;
  plantsDyingQuickly?: boolean | null;
  unknownProductsMixed?: boolean | null;
  herbicideDamageSuspected?: boolean | null;
  multipleUnsuccessfulTreatments?: boolean | null;
  severeBacterialOrViralSuspected?: boolean | null;
};

const MOST_CROP_AFFECTED_THRESHOLD = 50;

function combinedText(signals: SafetyCaseSignals): string {
  return [
    signals.problemDescription,
    signals.fertilizerHistory,
    signals.sprayHistory,
    signals.caseSummary,
    ...signals.likelyCauses,
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Confidence bands for how the farmer-facing UI should behave.
 * - >= 80: approved preliminary guidance
 * - 60–79: ask for missing information / more photos
 * - < 60: send for human technical review
 */
export function getConfidenceBand(score: number): ConfidenceBand {
  if (score >= 80) return "approved_guidance";
  if (score >= 60) return "needs_more_info";
  return "human_review";
}

/**
 * Evaluates FVMLTD automatic human-review triggers from case data + assessment text.
 */
export function evaluateSafetyTriggers(
  signals: SafetyCaseSignals,
): { required: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const text = combinedText(signals);

  if (
    signals.percentAffected != null &&
    signals.percentAffected >= MOST_CROP_AFFECTED_THRESHOLD
  ) {
    reasons.push("Most of the crop is affected.");
  }

  const dyingQuickly =
    signals.plantsDyingQuickly === true ||
    includesAny(text, [
      /\bdy(ing|ed)\s+quickly\b/,
      /\brapid\s+wilt/,
      /\bcollaps(e|ing)\b/,
      /\bplants?\s+are\s+dying\b/,
      /\bsudden\s+death\b/,
      /\bwilting\s+fast\b/,
    ]) ||
    (signals.urgencyLevel === "critical" &&
      includesAny(text, [/\bdying\b/, /\bwilt/, /\bcollaps/]));

  if (dyingQuickly) {
    reasons.push("Plants are dying quickly.");
  }

  const unknownMixed =
    signals.unknownProductsMixed === true ||
    includesAny(text, [
      /\bunknown\s+products?\b/,
      /\bmixed\s+(products?|chemicals?|sprays?)\b/,
      /\bcocktail\b/,
      /\bhomemade\s+(mix|spray|brew)\b/,
      /\btank\s*mix\b/,
      /\bmixed\s+together\b/,
    ]);

  if (unknownMixed) {
    reasons.push("Unknown products were mixed.");
  }

  const herbicide =
    signals.herbicideDamageSuspected === true ||
    includesAny(text, [
      /\bherbicide\b/,
      /\bweedicide\b/,
      /\bglyphosate\b/,
      /\b2\s*,?\s*4\s*-?\s*d\b/,
      /\bherbicide\s+damage\b/,
      /\bdrift\s+damage\b/,
    ]);

  if (herbicide) {
    reasons.push("Herbicide damage is suspected.");
  }

  const multipleTreatments =
    signals.multipleUnsuccessfulTreatments === true ||
    includesAny(text, [
      /\bmultiple\s+(unsuccessful\s+)?(treatments?|sprays?)\b/,
      /\bseveral\s+(sprays?|treatments?)\b/,
      /\balready\s+(sprayed|treated)\b/,
      /\bsprayed\s+(again|twice|many|several)\b/,
      /\bno\s+improvement\s+after\s+(spray|treatment)/,
      /\bfailed\s+treatments?\b/,
    ]);

  if (multipleTreatments) {
    reasons.push("Multiple unsuccessful treatments were already applied.");
  }

  const severePathogen =
    signals.severeBacterialOrViralSuspected === true ||
    includesAny(text, [
      /\bsevere\s+(bacterial|viral)\b/,
      /\bbacterial\s+wilt\b/,
      /\bviral\s+(disease|infection|mosaic)\b/,
      /\bvirus\b/,
      /\bbacterium\b/,
      /\bbacterial\s+canker\b/,
      /\btomato\s+yellow\s+leaf\s+curl\b/,
      /\bcucumber\s+mosaic\b/,
      /\btobamovirus\b/,
    ]);

  if (severePathogen) {
    reasons.push(
      "The AI identifies a possible severe bacterial or viral issue.",
    );
  }

  if (signals.approvedProtocolExists === false) {
    reasons.push("No approved protocol exists.");
  }

  return { required: reasons.length > 0, reasons };
}

/**
 * Applies FVMLTD confidence + safety policy to a parsed assessment.
 * Product recommendations are never shown when human review is required.
 */
export function applySafetyRules(
  assessment: PreliminaryAssessmentJson,
  signals: SafetyCaseSignals,
): SafetyEvaluation {
  const confidenceBand = getConfidenceBand(assessment.confidence_score);
  const triggerResult = evaluateSafetyTriggers({
    ...signals,
    likelyCauses: assessment.likely_causes,
    caseSummary: assessment.case_summary,
    urgencyLevel: assessment.urgency_level,
  });

  const reasons = [...triggerResult.reasons];

  if (confidenceBand === "human_review") {
    reasons.push("Confidence is below 60% — send for human technical review.");
  }

  const humanReviewRequired =
    confidenceBand === "human_review" ||
    triggerResult.required ||
    assessment.human_review_required === true;

  // Deduplicate reasons while preserving order
  const humanReviewReasons = [...new Set(reasons)];

  let guidanceMode: GuidanceMode;
  if (humanReviewRequired) {
    guidanceMode = "human_review";
  } else if (confidenceBand === "needs_more_info") {
    guidanceMode = "needs_more_info";
  } else {
    guidanceMode = "approved_guidance";
  }

  // Never allow a final product recommendation when human review is required.
  const productRecommendationAllowed =
    !humanReviewRequired && assessment.product_recommendation_allowed === true
      ? false // still blocked at preliminary stage
      : false;

  const missingInformation = [...assessment.missing_information];
  if (
    guidanceMode === "needs_more_info" &&
    missingInformation.length === 0
  ) {
    missingInformation.push(
      "Clearer close-up photographs of affected and healthy plants",
    );
    missingInformation.push(
      "More detail on recent sprays, fertilizers, and when symptoms started",
    );
  }

  let immediateSafeActions = [...assessment.immediate_safe_actions];
  if (guidanceMode === "human_review") {
    immediateSafeActions = [
      "Do not apply a final product recommendation until FVMLTD technical staff review this case.",
      ...immediateSafeActions.filter(
        (action) =>
          !/product recommendation|apply .+ pesticide|spray with/i.test(action),
      ),
      "Isolate badly affected plants if practical and wait for staff guidance.",
    ];
    // unique
    immediateSafeActions = [...new Set(immediateSafeActions)];
  }

  return {
    confidenceBand,
    guidanceMode,
    humanReviewRequired,
    humanReviewReasons,
    productRecommendationAllowed,
    missingInformation,
    immediateSafeActions,
  };
}
