/**
 * Agronomic Case Engine — rapid triage schema (client + server safe).
 * Used by OpenAI Structured Outputs and the farmer-facing UI.
 */

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

/** Farmer-visible quick-reply chips. */
export const STANDARD_QUICK_REPLIES = [
  "Few plants",
  "Patches",
  "Most of field",
  "Not sure",
  "Upload a photo",
  "Start full crop check",
] as const;

export type AgronomicCasePayload = {
  mode: CaseMode;
  stage: CaseStage;
  preliminaryAssessment: string;
  severity: SeverityLevel;
  nextQuestion: string;
  quickReplies: string[];
  checksToday: string[];
  safeActionsNow: string[];
  actionsToAvoid: string[];
  photoRecommended: boolean;
  escalationRecommended: boolean;
  /** Engine-only — never show in farmer UI. */
  internalMissingInformation: string[];
};

export const CASE_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "mode",
    "stage",
    "preliminaryAssessment",
    "severity",
    "nextQuestion",
    "quickReplies",
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
    preliminaryAssessment: { type: "string" },
    severity: {
      type: "string",
      enum: [...SEVERITY_LEVELS],
    },
    nextQuestion: { type: "string" },
    quickReplies: {
      type: "array",
      items: { type: "string" },
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

  return {
    mode: data.mode,
    stage: data.stage,
    preliminaryAssessment,
    severity: data.severity,
    nextQuestion: asTrimmedString(data.nextQuestion),
    quickReplies: asStringArray(data.quickReplies),
    checksToday: asStringArray(data.checksToday),
    safeActionsNow: asStringArray(data.safeActionsNow),
    actionsToAvoid: asStringArray(data.actionsToAvoid),
    photoRecommended: asBoolean(data.photoRecommended),
    escalationRecommended: asBoolean(data.escalationRecommended),
    internalMissingInformation: asStringArray(data.internalMissingInformation),
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
