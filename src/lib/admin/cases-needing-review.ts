/**
 * Staff concept: cases needing review.
 * Prioritise low-confidence, worsening, unusual, and high-consequence cases.
 * Does not redesign the dashboard — ranking only.
 */

import type { CropCaseRecord, FollowUpOutcome } from "@/lib/cases/types";
import { cropHealthStateFromMetadata } from "@/lib/agronomy/crop-health-state";
import { isLowDiagnosticConfidence } from "@/lib/agronomy/differential";
import type { DiagnosisConfidence } from "@/lib/agronomy/diagnosis-confidence";

export const REVIEW_REASONS = [
  "low_confidence",
  "worsening",
  "unusual",
  "high_consequence",
] as const;

export type ReviewReason = (typeof REVIEW_REASONS)[number];

export type CaseReviewPriority = {
  caseId: string;
  score: number;
  reasons: ReviewReason[];
  needsReview: boolean;
};

const HIGH_CONSEQUENCE =
  /\b(bacterial wilt|sudden wilt|herbicide|whole field|dying|collapse|virus|restricted pesticide)\b/i;

export function caseReviewPriority(
  record: Pick<
    CropCaseRecord,
    | "id"
    | "confidence"
    | "severity"
    | "humanEscalation"
    | "needsReview"
    | "possibleCauses"
    | "symptoms"
    | "crop"
    | "farmerProblemText"
    | "caseStatus"
    | "businessMetadata"
    | "agronomistReviewed"
  >,
  extras?: {
    outcome?: FollowUpOutcome | null;
    similarCaseCount?: number;
  },
): CaseReviewPriority {
  const state = cropHealthStateFromMetadata(record.businessMetadata);
  const reasons: ReviewReason[] = [];
  let score = 0;

  const diagnosticConfidence =
    (state?.diagnosticConfidence as DiagnosisConfidence | "unknown" | undefined) ??
    (record.confidence === "low"
      ? "possible"
      : record.confidence === "high"
        ? "likely"
        : "unknown");

  if (isLowDiagnosticConfidence(diagnosticConfidence) && (record.crop || record.symptoms.length > 0)) {
    reasons.push("low_confidence");
    score += 30;
  }

  if (extras?.outcome === "worse" || record.caseStatus === "human_review") {
    reasons.push("worsening");
    score += 40;
  }

  const unusual =
    (extras?.similarCaseCount ?? 0) === 0 &&
    Boolean(record.crop) &&
    record.symptoms.length > 0 &&
    !record.agronomistReviewed;
  if (unusual) {
    reasons.push("unusual");
    score += 20;
  }

  const highConsequence =
    record.severity === "high" ||
    record.humanEscalation ||
    HIGH_CONSEQUENCE.test(record.farmerProblemText) ||
    /\bmost of (the )?(field|crop)\b/i.test(record.farmerProblemText);
  if (highConsequence) {
    reasons.push("high_consequence");
    score += 35;
  }

  const needsReview =
    record.needsReview ||
    reasons.includes("worsening") ||
    reasons.includes("high_consequence") ||
    (reasons.includes("low_confidence") && reasons.includes("unusual"));

  if (record.needsReview) score += 10;

  return {
    caseId: record.id,
    score,
    reasons,
    needsReview,
  };
}

export function sortCasesNeedingReview<T extends { id: string }>(
  cases: T[],
  rank: (item: T) => CaseReviewPriority,
): Array<T & { review: CaseReviewPriority }> {
  return cases
    .map((item) => ({ ...item, review: rank(item) }))
    .filter((item) => item.review.needsReview || item.review.score > 0)
    .sort((a, b) => b.review.score - a.review.score);
}

export function shouldFlagForStaffReview(
  record: Parameters<typeof caseReviewPriority>[0],
  extras?: Parameters<typeof caseReviewPriority>[1],
): boolean {
  return caseReviewPriority(record, extras).needsReview;
}
