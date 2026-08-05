/**
 * Commercial Caribbean tomato diagnostic interview protocol.
 * Defines facts to collect, questioning rules, and commercial safety guards.
 */

import {
  isInterviewStage,
  type AgronomicCasePayload,
  type CaseStage,
} from "./case-schema";

/** Critical facts the interview must collect and retain. */
export const CRITICAL_CASE_FACTS = [
  "country",
  "district",
  "crop",
  "variety",
  "plant age",
  "commercial or home production",
  "production environment",
  "area planted",
  "symptom onset",
  "leaves affected",
  "field distribution",
  "soil or growing medium",
  "irrigation",
  "drainage",
  "fertilizer history",
  "spray history",
  "recent weather",
  "root observations",
  "photo availability",
] as const;

export type CriticalCaseFact = (typeof CRITICAL_CASE_FACTS)[number];

/** Preferred interview order — choose the next missing fact that separates causes. */
export const QUESTION_PRIORITY: CriticalCaseFact[] = [
  "country",
  "crop",
  "commercial or home production",
  "plant age",
  "field distribution",
  "leaves affected",
  "symptom onset",
  "irrigation",
  "drainage",
  "soil or growing medium",
  "fertilizer history",
  "root observations",
  "spray history",
  "recent weather",
  "production environment",
  "variety",
  "area planted",
  "district",
  "photo availability",
];

export const COMMERCIAL_FARMING_RULES = [
  "Never suggest adding sand or gravel to an established commercial field.",
  "Never recommend fertilizer solely because plants are stunted.",
  "First examine symptom distribution, water, drainage, roots, fertilizer history, and possible pests or diseases.",
  "Separate observations, hypotheses, and actions.",
  "Avoid brand recommendations.",
  "Do not recommend unsafe pesticide mixtures.",
  "Escalate serious wilt, chemical injury, uncertain high-loss cases, or cases requiring laboratory confirmation.",
] as const;

const SAND_OR_GRAVEL =
  /\b(add|adding|mix|mixing|incorporate|incorporating|amend|amending|blend|blending)?\s*(sand|gravel|grit)\b|\b(sand|gravel)\s+(to|into)\s+(the\s+)?(soil|field|bed)/i;

const PREMATURE_FERTILIZER =
  /\b(apply|adding|add|give|use|put)\b.{0,40}\b(fertilizer|fertiliser|NPK|urea|ammonium|compost|manure|foliar\s+feed)\b|\b(fertilizer|fertiliser)\s+(now|today|immediately|first)\b/i;

const UNSAFE_MIX =
  /\b(mix|mixing|cocktail|tank\s*mix)\b.{0,40}\b(pesticide|insecticide|fungicide|herbicide|chemical)/i;

/**
 * Server-side commercial safety net applied after the model responds.
 * Does not invent agronomy — only strips unsafe or premature advice.
 */
export function applyCommercialSafetyGuards(
  payload: AgronomicCasePayload,
): AgronomicCasePayload {
  const actionsToAvoid = [...payload.actionsToAvoid];
  const ensureAvoid = (text: string) => {
    if (!actionsToAvoid.some((item) => item.toLowerCase() === text.toLowerCase())) {
      actionsToAvoid.push(text);
    }
  };

  let safeActionsNow = payload.safeActionsNow.filter((action) => {
    if (SAND_OR_GRAVEL.test(action)) {
      ensureAvoid(
        "Do not add sand or gravel to an established commercial field.",
      );
      return false;
    }
    if (UNSAFE_MIX.test(action)) {
      ensureAvoid("Do not mix pesticides into unapproved cocktails.");
      return false;
    }
    return true;
  });

  // During intake/questioning: never push fertilizer as the first fix for stunting.
  if (isInterviewStage(payload.stage)) {
    safeActionsNow = safeActionsNow.filter((action) => {
      if (PREMATURE_FERTILIZER.test(action)) {
        ensureAvoid(
          "Do not apply fertilizer solely because plants look stunted — gather water, drainage, root, and history evidence first.",
        );
        return false;
      }
      return true;
    });
  } else {
    safeActionsNow = safeActionsNow.filter((action) => {
      if (PREMATURE_FERTILIZER.test(action) && !hasWaterOrRootEvidence(payload)) {
        ensureAvoid(
          "Do not recommend fertilizer before reviewing water, drainage, roots, and fertilizer history.",
        );
        return false;
      }
      return true;
    });
  }

  // Interview stages: one question, no final diagnosis lists.
  let stage: CaseStage = payload.stage;
  let nextQuestion = payload.nextQuestion;
  let likelyCauses = payload.likelyCauses;
  let checksToday = payload.checksToday;
  let escalationReason = payload.escalationReason;

  if (isInterviewStage(stage)) {
    likelyCauses = [];
    checksToday = [];
    safeActionsNow = [];
    if (!nextQuestion) {
      nextQuestion =
        "Which part of the field is most affected — patches, edges, low spots, or almost the entire field?";
    }
  }

  // Escalate when red flags mention serious wilt / chemical injury / high loss.
  if (
    shouldEscalate(payload) &&
    stage !== "human_review" &&
    stage !== "resolved"
  ) {
    if (stage === "assessment" || stage === "action_plan") {
      stage = "human_review";
    }
    if (!escalationReason) {
      escalationReason =
        "Serious wilt, chemical injury, uncertain high-loss pattern, or laboratory confirmation may be needed.";
    }
  }

  return {
    ...payload,
    stage,
    nextQuestion,
    likelyCauses,
    checksToday,
    safeActionsNow,
    actionsToAvoid,
    escalationReason,
  };
}

function hasWaterOrRootEvidence(payload: AgronomicCasePayload): boolean {
  const text = [
    payload.caseSummary,
    ...payload.missingCriticalInformation,
    ...payload.checksToday,
    ...payload.likelyCauses,
  ]
    .join(" ")
    .toLowerCase();

  return (
    /\b(drain|drainage|wet|waterlog|irrigation|root|roots|soil stays wet)\b/.test(
      text,
    ) || payload.checksToday.some((c) => /\broot|drain|irrigation/i.test(c))
  );
}

function shouldEscalate(payload: AgronomicCasePayload): boolean {
  const text = [
    payload.caseSummary,
    payload.escalationReason,
    ...payload.redFlags,
    ...payload.likelyCauses,
  ]
    .join(" ")
    .toLowerCase();

  return (
    /\b(serious\s+wilt|bacterial\s+wilt|rapid\s+wilt|sudden\s+wilt)\b/.test(
      text,
    ) ||
    /\b(chemical\s+injury|herbicide\s+(damage|injury)|spray\s+burn)\b/.test(
      text,
    ) ||
    /\b(high[\s-]?loss|entire\s+crop|most\s+of\s+the\s+(field|crop))\b/.test(
      text,
    ) ||
    /\b(lab(oratory)?\s+(confirm|test|needed)|needs?\s+lab)\b/.test(text) ||
    payload.redFlags.length >= 3
  );
}

/** Detect forbidden commercial advice strings for acceptance checks. */
export function mentionsSandOrGravel(text: string): boolean {
  return SAND_OR_GRAVEL.test(text);
}

export function mentionsPrematureFertilizer(text: string): boolean {
  return PREMATURE_FERTILIZER.test(text);
}
