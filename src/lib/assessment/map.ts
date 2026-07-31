import type { AssessmentRecord, UrgencyLevel } from "./types";

type AssessmentRow = {
  id: string;
  crop_case_id: string;
  model_name: string | null;
  case_summary: string | null;
  summary: string | null;
  likely_causes: unknown;
  likely_issue: string | null;
  confidence_score: number | string | null;
  confidence: number | string | null;
  missing_information: unknown;
  immediate_safe_actions: unknown;
  human_review_required: boolean | null;
  laboratory_test_needed: boolean | null;
  product_recommendation_allowed: boolean | null;
  urgency_level: string | null;
  severity: string | null;
  assessed_at: string;
};

export const ASSESSMENT_SELECT =
  "id, crop_case_id, model_name, case_summary, summary, likely_causes, likely_issue, confidence_score, confidence, missing_information, immediate_safe_actions, human_review_required, laboratory_test_needed, product_recommendation_allowed, urgency_level, severity, assessed_at";

function asStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === "string");
}

export function mapAssessmentRow(row: AssessmentRow): AssessmentRecord {
  const likelyCauses = asStringArray(
    row.likely_causes,
    row.likely_issue ? [row.likely_issue] : [],
  );
  const confidence = Number(row.confidence_score ?? row.confidence ?? 0);
  const rawUrgency = row.urgency_level ?? row.severity ?? "moderate";
  const urgencyLevel: UrgencyLevel =
    rawUrgency === "mild"
      ? "moderate"
      : rawUrgency === "low" ||
          rawUrgency === "moderate" ||
          rawUrgency === "high" ||
          rawUrgency === "critical"
        ? rawUrgency
        : "moderate";

  return {
    id: row.id,
    cropCaseId: row.crop_case_id,
    modelName: row.model_name,
    caseSummary: row.case_summary ?? row.summary ?? "",
    likelyCauses,
    confidenceScore: Number.isFinite(confidence) ? confidence : 0,
    missingInformation: asStringArray(row.missing_information),
    immediateSafeActions: asStringArray(row.immediate_safe_actions),
    humanReviewRequired: row.human_review_required ?? true,
    laboratoryTestNeeded: row.laboratory_test_needed ?? false,
    productRecommendationAllowed: false,
    urgencyLevel,
    assessedAt: row.assessed_at,
  };
}
