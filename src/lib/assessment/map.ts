import { getConfidenceBand } from "./safetyRules";
import type {
  AssessmentRecord,
  ConfidenceBand,
  GuidanceMode,
  UrgencyLevel,
} from "./types";

type AssessmentRow = {
  id: string;
  crop_check_id: string;
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
  raw_response?: unknown;
};

export const ASSESSMENT_SELECT =
  "id, crop_check_id, model_name, case_summary, summary, likely_causes, likely_issue, confidence_score, confidence, missing_information, immediate_safe_actions, human_review_required, laboratory_test_needed, product_recommendation_allowed, urgency_level, severity, assessed_at, raw_response";

function asStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === "string");
}

function policyFromRaw(raw: unknown): {
  confidenceBand?: ConfidenceBand;
  guidanceMode?: GuidanceMode;
  humanReviewReasons?: string[];
} {
  if (!raw || typeof raw !== "object") return {};
  const data = raw as Record<string, unknown>;
  const band = data.confidence_band ?? data.confidenceBand;
  const mode = data.guidance_mode ?? data.guidanceMode;
  const reasons = data.human_review_reasons ?? data.humanReviewReasons;

  return {
    confidenceBand:
      band === "approved_guidance" ||
      band === "needs_more_info" ||
      band === "human_review"
        ? band
        : undefined,
    guidanceMode:
      mode === "approved_guidance" ||
      mode === "needs_more_info" ||
      mode === "human_review"
        ? mode
        : undefined,
    humanReviewReasons: asStringArray(reasons),
  };
}

export function mapAssessmentRow(row: AssessmentRow): AssessmentRecord {
  const likelyCauses = asStringArray(
    row.likely_causes,
    row.likely_issue ? [row.likely_issue] : [],
  );
  const confidence = Number(row.confidence_score ?? row.confidence ?? 0);
  const confidenceScore = Number.isFinite(confidence) ? confidence : 0;
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

  const humanReviewRequired = row.human_review_required ?? true;
  const policy = policyFromRaw(row.raw_response);
  const confidenceBand =
    policy.confidenceBand ?? getConfidenceBand(confidenceScore);
  const guidanceMode =
    policy.guidanceMode ??
    (humanReviewRequired
      ? "human_review"
      : confidenceBand === "needs_more_info"
        ? "needs_more_info"
        : "approved_guidance");

  return {
    id: row.id,
    cropCaseId: row.crop_check_id,
    modelName: row.model_name,
    caseSummary: row.case_summary ?? row.summary ?? "",
    likelyCauses,
    confidenceScore,
    missingInformation: asStringArray(row.missing_information),
    immediateSafeActions: asStringArray(row.immediate_safe_actions),
    humanReviewRequired,
    laboratoryTestNeeded: row.laboratory_test_needed ?? false,
    // Never surface a final product recommendation when human review is required.
    productRecommendationAllowed:
      humanReviewRequired || guidanceMode === "human_review"
        ? false
        : Boolean(row.product_recommendation_allowed),
    urgencyLevel,
    assessedAt: row.assessed_at,
    confidenceBand,
    guidanceMode,
    humanReviewReasons: policy.humanReviewReasons ?? [],
  };
}
