export type UrgencyLevel = "low" | "moderate" | "high" | "critical";

/** Confidence-only band before safety-trigger overrides. */
export type ConfidenceBand =
  | "approved_guidance"
  | "needs_more_info"
  | "human_review";

/** Farmer-facing display mode after confidence + safety rules. */
export type GuidanceMode = ConfidenceBand;

export type AssessmentSafetySignals = {
  plants_dying_quickly: boolean;
  unknown_products_mixed: boolean;
  herbicide_damage_suspected: boolean;
  multiple_unsuccessful_treatments: boolean;
  severe_bacterial_or_viral_suspected: boolean;
  approved_protocol_exists: boolean;
};

export type PreliminaryAssessmentJson = {
  case_summary: string;
  likely_causes: string[];
  confidence_score: number;
  missing_information: string[];
  immediate_safe_actions: string[];
  human_review_required: boolean;
  laboratory_test_needed: boolean;
  product_recommendation_allowed: boolean;
  urgency_level: UrgencyLevel;
  safety_signals: AssessmentSafetySignals;
};

export type SafetyEvaluation = {
  confidenceBand: ConfidenceBand;
  guidanceMode: GuidanceMode;
  humanReviewRequired: boolean;
  humanReviewReasons: string[];
  productRecommendationAllowed: boolean;
  missingInformation: string[];
  immediateSafeActions: string[];
};

export type AssessmentRecord = {
  id: string;
  cropCaseId: string;
  modelName: string | null;
  caseSummary: string;
  likelyCauses: string[];
  confidenceScore: number;
  missingInformation: string[];
  immediateSafeActions: string[];
  humanReviewRequired: boolean;
  laboratoryTestNeeded: boolean;
  productRecommendationAllowed: boolean;
  urgencyLevel: UrgencyLevel;
  assessedAt: string;
  confidenceBand: ConfidenceBand;
  guidanceMode: GuidanceMode;
  humanReviewReasons: string[];
};

export const ASSESSMENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "case_summary",
    "likely_causes",
    "confidence_score",
    "missing_information",
    "immediate_safe_actions",
    "human_review_required",
    "laboratory_test_needed",
    "product_recommendation_allowed",
    "urgency_level",
    "safety_signals",
  ],
  properties: {
    case_summary: { type: "string" },
    likely_causes: {
      type: "array",
      items: { type: "string" },
    },
    confidence_score: { type: "number" },
    missing_information: {
      type: "array",
      items: { type: "string" },
    },
    immediate_safe_actions: {
      type: "array",
      items: { type: "string" },
    },
    human_review_required: { type: "boolean" },
    laboratory_test_needed: { type: "boolean" },
    product_recommendation_allowed: { type: "boolean" },
    urgency_level: {
      type: "string",
      enum: ["low", "moderate", "high", "critical"],
    },
    safety_signals: {
      type: "object",
      additionalProperties: false,
      required: [
        "plants_dying_quickly",
        "unknown_products_mixed",
        "herbicide_damage_suspected",
        "multiple_unsuccessful_treatments",
        "severe_bacterial_or_viral_suspected",
        "approved_protocol_exists",
      ],
      properties: {
        plants_dying_quickly: { type: "boolean" },
        unknown_products_mixed: { type: "boolean" },
        herbicide_damage_suspected: { type: "boolean" },
        multiple_unsuccessful_treatments: { type: "boolean" },
        severe_bacterial_or_viral_suspected: { type: "boolean" },
        approved_protocol_exists: { type: "boolean" },
      },
    },
  },
} as const;
