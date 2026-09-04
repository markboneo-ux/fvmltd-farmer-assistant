/**
 * Agronomic Case Engine — farmer-facing structured response schema.
 * Used by OpenAI Structured Outputs and the farmer UI.
 */

import {
  isQuestionType,
  type QuestionType,
} from "./question-types";

export const CASE_MODES = ["quick_help", "full_crop_check"] as const;
export type CaseMode = (typeof CASE_MODES)[number];

export const CASE_STAGES = [
  "intake",
  "questioning",
  "assessment",
  "action_plan",
  "follow_up",
  "resolved",
  "human_review",
] as const;

export type CaseStage = (typeof CASE_STAGES)[number];

export const SEVERITY_LEVELS = ["low", "medium", "high", "unknown"] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

/** Farmer-visible quick-reply chips (legacy standard set). */
export const STANDARD_QUICK_REPLIES = [
  "Few plants",
  "Patches",
  "Most of field",
  "Not sure",
  "Upload a photo",
  "Start full crop check",
] as const;

export type RegionalContext = {
  country: string | null;
  district: string | null;
  productDataAsOf: string | null;
  weatherDataAsOf: string | null;
};

export type WeatherRiskOption = {
  diseaseOrPest: string;
  riskLevel: "low" | "moderate" | "high" | "urgent";
  riskWindow: string;
  weatherDrivers: string[];
  cropStage: string | null;
  recommendedChecks: string[];
  preventiveActions: string[];
  confidence: string;
  dataSource: string;
  generatedAt: string;
  disclaimer: string;
};

export type VerifiedBrandDisplay = {
  brandName: string;
  registrationStatus: string;
  availabilityStatus: string;
  officialSource: string | null;
  lastVerifiedAt: string;
  labelRestrictions: string[];
  whyConsidered: string;
  agronomistConfirmationRequired: boolean;
};

export type VerifiedInputDisplay = {
  productType: string;
  activeIngredientOrNutrient: string;
  verifiedBrands: VerifiedBrandDisplay[];
  registrationStatus: string;
  availabilityStatus: string;
  labelRestrictions: string[];
  officialSource: string | null;
  lastVerifiedAt: string | null;
  agronomistConfirmationRequired: boolean;
};

export type AgronomicCasePayload = {
  mode: CaseMode;
  stage: CaseStage;
  questionId: string;
  questionType: QuestionType | "";
  nextQuestion: string;
  quickReplies: string[];
  preliminaryAssessment: string;
  severity: SeverityLevel;
  checksToday: string[];
  safeActionsNow: string[];
  actionsToAvoid: string[];
  photoRecommended: boolean;
  escalationRecommended: boolean;
  regionalContext: RegionalContext;
  weatherRisks: WeatherRiskOption[];
  verifiedInputOptions: VerifiedInputDisplay[];
  /** Engine-only — never show in farmer UI. */
  internalMissingInformation: string[];
  intent?: string;
  questionCategory?: string;
  calculationType?: string | null;
};

/** Schema sent to OpenAI — tool-filled fields are empty stubs only. */
export const CASE_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "mode",
    "stage",
    "questionId",
    "questionType",
    "nextQuestion",
    "quickReplies",
    "preliminaryAssessment",
    "severity",
    "checksToday",
    "safeActionsNow",
    "actionsToAvoid",
    "photoRecommended",
    "escalationRecommended",
    "internalMissingInformation",
  ],
  properties: {
    mode: {
      type: "string",
      enum: [...CASE_MODES],
    },
    stage: {
      type: "string",
      enum: [...CASE_STAGES],
    },
    questionId: { type: "string" },
    questionType: {
      type: "string",
      enum: [
        "field_distribution",
        "soil_type",
        "drainage",
        "production_system",
        "symptom_location",
        "recent_spray",
        "photo_request",
        "guidance_followup",
        "open",
        "",
      ],
    },
    nextQuestion: { type: "string" },
    quickReplies: {
      type: "array",
      items: { type: "string" },
    },
    preliminaryAssessment: { type: "string" },
    severity: {
      type: "string",
      enum: [...SEVERITY_LEVELS],
    },
    checksToday: {
      type: "array",
      items: { type: "string" },
    },
    safeActionsNow: {
      type: "array",
      items: { type: "string" },
    },
    actionsToAvoid: {
      type: "array",
      items: { type: "string" },
    },
    photoRecommended: { type: "boolean" },
    escalationRecommended: { type: "boolean" },
    internalMissingInformation: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

/** Max assistant questions before Quick Help must give preliminary guidance. */
export const QUICK_HELP_MAX_QUESTIONS = 3;

export function emptyRegionalContext(
  overrides: Partial<RegionalContext> = {},
): RegionalContext {
  return {
    country: null,
    district: null,
    productDataAsOf: null,
    weatherDataAsOf: null,
    ...overrides,
  };
}

export function isCaseMode(value: unknown): value is CaseMode {
  return (
    typeof value === "string" &&
    (CASE_MODES as readonly string[]).includes(value)
  );
}

export function isCaseStage(value: unknown): value is CaseStage {
  return (
    typeof value === "string" &&
    (CASE_STAGES as readonly string[]).includes(value)
  );
}

export function isSeverityLevel(value: unknown): value is SeverityLevel {
  return (
    typeof value === "string" &&
    (SEVERITY_LEVELS as readonly string[]).includes(value)
  );
}

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Validates and normalizes model JSON into the Agronomic Case payload.
 * Tool-enriched fields default empty — filled by the case route after tools run.
 */
export function parseCasePayload(raw: unknown): AgronomicCasePayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("Case response was not a JSON object.");
  }

  const data = raw as Record<string, unknown>;

  if (!isCaseMode(data.mode)) {
    throw new Error("Case response has an invalid mode.");
  }

  if (!isCaseStage(data.stage)) {
    throw new Error("Case response has an invalid stage.");
  }

  if (!isSeverityLevel(data.severity)) {
    throw new Error("Case response has an invalid severity.");
  }

  const preliminaryAssessment = asTrimmedString(data.preliminaryAssessment);
  if (!preliminaryAssessment) {
    throw new Error("Case response missing preliminaryAssessment.");
  }

  const questionTypeRaw = asTrimmedString(data.questionType);
  const questionType: QuestionType | "" = isQuestionType(questionTypeRaw)
    ? questionTypeRaw
    : questionTypeRaw === ""
      ? ""
      : "open";

  return {
    mode: data.mode,
    stage: data.stage,
    questionId: asTrimmedString(data.questionId),
    questionType,
    nextQuestion: asTrimmedString(data.nextQuestion),
    quickReplies: asStringArray(data.quickReplies),
    preliminaryAssessment,
    severity: data.severity,
    checksToday: asStringArray(data.checksToday),
    safeActionsNow: asStringArray(data.safeActionsNow),
    actionsToAvoid: asStringArray(data.actionsToAvoid),
    photoRecommended: asBoolean(data.photoRecommended),
    escalationRecommended: asBoolean(data.escalationRecommended),
    regionalContext: emptyRegionalContext(),
    weatherRisks: [],
    verifiedInputOptions: [],
    internalMissingInformation: asStringArray(data.internalMissingInformation),
    intent: asTrimmedString(data.intent) || undefined,
    questionCategory: asTrimmedString(data.questionCategory) || undefined,
    calculationType: asTrimmedString(data.calculationType) || null,
  };
}

/** Stages where the engine may still be asking (not yet delivering full triage). */
export function isInterviewStage(stage: CaseStage): boolean {
  return stage === "intake" || stage === "questioning";
}

/** Stages that deliver farmer-visible guidance. */
export function isGuidanceStage(stage: CaseStage): boolean {
  return (
    stage === "assessment" ||
    stage === "action_plan" ||
    stage === "follow_up" ||
    stage === "human_review" ||
    stage === "resolved"
  );
}

/** Strip Markdown markers that must never reach the farmer UI. */
export function stripMarkdownMarkers(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}
