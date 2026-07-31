export type UrgencyLevel = "low" | "moderate" | "high" | "critical";

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
  },
} as const;
