/**
 * Agronomic Case Engine — structured response schema (client + server safe).
 * Used by OpenAI Structured Outputs and the /ai-lab UI.
 */

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

export type AgronomicCasePayload = {
  stage: CaseStage;
  caseSummary: string;
  nextQuestion: string;
  missingCriticalInformation: string[];
  redFlags: string[];
  likelyCauses: string[];
  checksToday: string[];
  safeActionsNow: string[];
  actionsToAvoid: string[];
  escalationReason: string;
};

export const CASE_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "stage",
    "caseSummary",
    "nextQuestion",
    "missingCriticalInformation",
    "redFlags",
    "likelyCauses",
    "checksToday",
    "safeActionsNow",
    "actionsToAvoid",
    "escalationReason",
  ],
  properties: {
    stage: {
      type: "string",
      enum: [...CASE_STAGES],
    },
    caseSummary: { type: "string" },
    nextQuestion: { type: "string" },
    missingCriticalInformation: {
      type: "array",
      items: { type: "string" },
    },
    redFlags: {
      type: "array",
      items: { type: "string" },
    },
    likelyCauses: {
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
    escalationReason: { type: "string" },
  },
} as const;

export function isCaseStage(value: unknown): value is CaseStage {
  return (
    typeof value === "string" &&
    (CASE_STAGES as readonly string[]).includes(value)
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

/**
 * Validates and normalizes model JSON into the Agronomic Case payload.
 */
export function parseCasePayload(raw: unknown): AgronomicCasePayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("Case response was not a JSON object.");
  }

  const data = raw as Record<string, unknown>;

  if (!isCaseStage(data.stage)) {
    throw new Error("Case response has an invalid stage.");
  }

  const caseSummary = asTrimmedString(data.caseSummary);
  if (!caseSummary) {
    throw new Error("Case response missing caseSummary.");
  }

  return {
    stage: data.stage,
    caseSummary,
    nextQuestion: asTrimmedString(data.nextQuestion),
    missingCriticalInformation: asStringArray(data.missingCriticalInformation),
    redFlags: asStringArray(data.redFlags),
    likelyCauses: asStringArray(data.likelyCauses),
    checksToday: asStringArray(data.checksToday),
    safeActionsNow: asStringArray(data.safeActionsNow),
    actionsToAvoid: asStringArray(data.actionsToAvoid),
    escalationReason: asTrimmedString(data.escalationReason),
  };
}

/** Stages where the engine must ask exactly one question and avoid diagnosis. */
export function isInterviewStage(stage: CaseStage): boolean {
  return stage === "intake" || stage === "questioning";
}
