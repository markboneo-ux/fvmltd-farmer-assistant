/**
 * Rapid triage protocol for Caribbean crop problems (Quick Help + Full Crop Check).
 */

import {
  isGuidanceStage,
  isInterviewStage,
  QUICK_HELP_MAX_QUESTIONS,
  STANDARD_QUICK_REPLIES,
  type AgronomicCasePayload,
  type CaseMode,
  type CaseStage,
  type SeverityLevel,
} from "./case-schema";

/** Full history facts — used only in full_crop_check or as internal notes. */
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

/** High-value Quick Help questions — severity, distribution, major risks. */
export const QUICK_HELP_FOCUS = [
  "field distribution / how many plants affected",
  "visible symptoms that separate competing causes",
  "recent sprays or sudden collapse risks",
  "photo when it would replace several questions",
] as const;

export const COMMERCIAL_FARMING_RULES = [
  "Never suggest adding sand or gravel to an established commercial field.",
  "Never recommend fertilizer solely because plants are stunted.",
  "First examine symptom distribution, water, drainage, roots, fertilizer history, and possible pests or diseases.",
  "Separate observations, hypotheses, and actions.",
  "Avoid brand recommendations.",
  "Do not recommend unsafe pesticide mixtures.",
  "Escalate serious wilt, chemical injury, uncertain high-loss cases, or cases requiring laboratory confirmation.",
] as const;

/** Preferred Quick Help sequence for tomato whiteflies. */
export const WHITEFLY_QUICK_SEQUENCE = [
  "Are they affecting a few plants, patches, or most of the field?",
  "Are you seeing sticky leaves, black mould, yellowing, curling, or tiny insects underneath the leaves?",
  "What have you sprayed during the last seven days?",
] as const;

export type KnownFarmerFacts = {
  crop: string | null;
  suspectedIssue: string | null;
  country: string | null;
  distributionHint: string | null;
  suddenWilt: boolean;
  stuntedWholeField: boolean;
  rawText: string;
};

const SAND_OR_GRAVEL =
  /\b(add|adding|mix|mixing|incorporate|incorporating|amend|amending|blend|blending)?\s*(sand|gravel|grit)\b|\b(sand|gravel)\s+(to|into)\s+(the\s+)?(soil|field|bed)/i;

const PREMATURE_FERTILIZER =
  /\b(apply|adding|add|give|use|put)\b.{0,40}\b(fertilizer|fertiliser|NPK|urea|ammonium|compost|manure|foliar\s+feed)\b|\b(fertilizer|fertiliser)\s+(now|today|immediately|first)\b/i;

const UNSAFE_MIX =
  /\b(mix|mixing|cocktail|tank\s*mix)\b.{0,40}\b(pesticide|insecticide|fungicide|herbicide|chemical)/i;

const LOCATION_QUESTION =
  /\b(which\s+)?(country|island|district|parish|region|where\s+are\s+you|where\s+is\s+the\s+(farm|field))\b/i;

const CROP_QUESTION =
  /\b(what\s+crop|which\s+crop|is\s+it\s+tomato|pepper\s+or|what\s+are\s+you\s+growing)\b/i;

/**
 * Extract facts already stated by the farmer so we never re-ask them.
 */
export function extractKnownFacts(text: string): KnownFarmerFacts {
  const rawText = text.trim();
  const lower = rawText.toLowerCase();

  let crop: string | null = null;
  if (/\btomato(es)?\b/.test(lower)) crop = "tomato";
  else if (/\bpepper(s)?\b/.test(lower)) crop = "pepper";
  else if (/\bcucumber(s)?\b/.test(lower)) crop = "cucumber";

  let suspectedIssue: string | null = null;
  if (/\bwhite\s*fl(y|ies)\b/.test(lower)) suspectedIssue = "whiteflies";
  else if (/\bholes?\b/.test(lower)) suspectedIssue = "leaf holes";
  else if (/\bwilt(ing|ed)?\b/.test(lower)) suspectedIssue = "wilt";
  else if (/\bstunt(ed|ing)?\b/.test(lower)) suspectedIssue = "stunting";

  let country: string | null = null;
  if (/\btrinidad\b/.test(lower)) country = "Trinidad";
  else if (/\btobago\b/.test(lower)) country = "Tobago";
  else if (/\bjamaica\b/.test(lower)) country = "Jamaica";
  else if (/\bbarbados\b/.test(lower)) country = "Barbados";
  else if (/\bguyana\b/.test(lower)) country = "Guyana";

  let distributionHint: string | null = null;
  if (/\b(whole|entire|most\s+of\s+the)\s+field\b/.test(lower)) {
    distributionHint = "most of field";
  } else if (/\bpatches?\b/.test(lower)) {
    distributionHint = "patches";
  } else if (/\bfew\s+plants?\b/.test(lower)) {
    distributionHint = "few plants";
  }

  return {
    crop,
    suspectedIssue,
    country,
    distributionHint,
    suddenWilt: /\bsudden(ly)?\s+wilt/.test(lower) || /\bwilt(ing|ed)?\s+suddenly\b/.test(lower),
    stuntedWholeField:
      /\bstunt/.test(lower) &&
      /\b(whole|entire|most\s+of\s+the)\s+field\b/.test(lower),
    rawText,
  };
}

export function questionAsksForKnownFact(
  question: string,
  facts: KnownFarmerFacts,
): boolean {
  if (!question.trim()) return false;

  if (facts.crop && CROP_QUESTION.test(question)) return true;

  if (
    facts.suspectedIssue === "whiteflies" &&
    /\b(what\s+(pest|insect)|which\s+pest|is\s+it\s+white\s*fl)/i.test(question)
  ) {
    return true;
  }

  if (
    facts.distributionHint === "most of field" &&
    /\b(few\s+plants|patches|most\s+of\s+(the\s+)?field|how\s+many\s+plants|which\s+parts?\s+of\s+the\s+field)/i.test(
      question,
    )
  ) {
    return true;
  }

  if (
    facts.country &&
    LOCATION_QUESTION.test(question) &&
    !/\b(would|materially|change)\b/i.test(question)
  ) {
    return true;
  }

  return false;
}

export function countPriorAssistantQuestions(
  history: { role: string; content: string }[],
): number {
  return history.filter((item) => {
    if (item.role !== "assistant") return false;
    return (
      /\bnext question:/i.test(item.content) ||
      item.content.includes("?") ||
      /\bstage:\s*(intake|questioning)/i.test(item.content)
    );
  }).length;
}

function defaultQuickReplies(stage: CaseStage, photoRecommended: boolean): string[] {
  if (isGuidanceStage(stage)) {
    const replies = ["Upload a photo", "Start full crop check"];
    if (!photoRecommended) {
      return ["Start full crop check", "Not sure"];
    }
    return replies;
  }

  return [
    "Few plants",
    "Patches",
    "Most of field",
    "Not sure",
    "Upload a photo",
    "Start full crop check",
  ];
}

/**
 * Server-side rapid-triage + commercial safety net.
 */
export function applyCommercialSafetyGuards(
  payload: AgronomicCasePayload,
  options: {
    mode: CaseMode;
    questionsAskedBeforeThisTurn: number;
    knownFacts: KnownFarmerFacts;
  },
): AgronomicCasePayload {
  const mode = options.mode;
  let stage: CaseStage = payload.stage;
  let nextQuestion = payload.nextQuestion;
  let preliminaryAssessment = payload.preliminaryAssessment;
  let severity: SeverityLevel = payload.severity;
  let checksToday = [...payload.checksToday];
  let safeActionsNow = [...payload.safeActionsNow];
  let actionsToAvoid = [...payload.actionsToAvoid];
  let quickReplies = [...payload.quickReplies];
  let photoRecommended = payload.photoRecommended;
  let escalationRecommended = payload.escalationRecommended;
  const internalMissingInformation = [...payload.internalMissingInformation];

  const ensureAvoid = (text: string) => {
    if (!actionsToAvoid.some((item) => item.toLowerCase() === text.toLowerCase())) {
      actionsToAvoid.push(text);
    }
  };

  safeActionsNow = safeActionsNow.filter((action) => {
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

  if (isInterviewStage(stage) || !hasWaterOrRootEvidence(payload)) {
    safeActionsNow = safeActionsNow.filter((action) => {
      if (PREMATURE_FERTILIZER.test(action)) {
        ensureAvoid(
          "Do not apply fertilizer solely because plants look stunted — check water, drainage and roots first.",
        );
        return false;
      }
      return true;
    });
  }

  // Never re-ask facts already in the farmer's message.
  if (
    nextQuestion &&
    questionAsksForKnownFact(nextQuestion, options.knownFacts)
  ) {
    nextQuestion = "";
  }

  // Do not lead with country/district in Quick Help.
  if (
    mode === "quick_help" &&
    nextQuestion &&
    LOCATION_QUESTION.test(nextQuestion) &&
    !options.knownFacts.country
  ) {
    nextQuestion = "";
  }

  const questionsIncludingThis =
    options.questionsAskedBeforeThisTurn +
    (isInterviewStage(stage) && nextQuestion ? 1 : 0);

  // Quick Help hard cap: after 3 questions, force preliminary guidance.
  if (
    mode === "quick_help" &&
    (options.questionsAskedBeforeThisTurn >= QUICK_HELP_MAX_QUESTIONS ||
      (questionsIncludingThis > QUICK_HELP_MAX_QUESTIONS &&
        isInterviewStage(stage)))
  ) {
    stage = options.knownFacts.suddenWilt ? "human_review" : "assessment";
    if (!isGuidanceStage(payload.stage) || !hasUsefulGuidance(payload)) {
      const forced = buildForcedQuickGuidance(options.knownFacts, payload);
      preliminaryAssessment = forced.preliminaryAssessment;
      severity = forced.severity;
      checksToday = forced.checksToday;
      safeActionsNow = forced.safeActionsNow;
      actionsToAvoid = [...new Set([...actionsToAvoid, ...forced.actionsToAvoid])];
      photoRecommended = forced.photoRecommended;
      escalationRecommended = forced.escalationRecommended;
    }
    // One optional next question after guidance — not another interview.
    if (isInterviewStage(payload.stage)) {
      nextQuestion =
        photoRecommended
          ? "Can you upload a clear photo of the damage?"
          : nextQuestion && !questionAsksForKnownFact(nextQuestion, options.knownFacts)
            ? nextQuestion
            : "";
    }
  }

  // During early interview turns, keep guidance light but allow a short framing line.
  if (mode === "quick_help" && isInterviewStage(stage)) {
    if (!nextQuestion) {
      nextQuestion = pickFallbackQuestion(options.knownFacts, options.questionsAskedBeforeThisTurn);
    }
    // Ensure we still ask at most one question and offer chips.
    if (!quickReplies.length) {
      quickReplies = defaultQuickReplies(stage, photoRecommended);
    }
  }

  if (isGuidanceStage(stage)) {
    if (!preliminaryAssessment.toLowerCase().includes("preliminary")) {
      preliminaryAssessment = `Preliminary guidance: ${preliminaryAssessment}`;
    }
    if (!quickReplies.length) {
      quickReplies = defaultQuickReplies(stage, photoRecommended);
    }
    // Always offer optional deeper path.
    if (
      !quickReplies.some((item) => /full crop check/i.test(item))
    ) {
      quickReplies = [...quickReplies, "Start full crop check"];
    }
  }

  if (
    shouldEscalate(payload, options.knownFacts) ||
    options.knownFacts.suddenWilt
  ) {
    escalationRecommended = true;
    if (stage === "assessment" || stage === "action_plan") {
      stage = "human_review";
    }
  }

  // Normalize quick replies to known useful chips when model invents empty/odd values.
  quickReplies = normalizeQuickReplies(quickReplies, stage, photoRecommended);

  return {
    mode,
    stage,
    preliminaryAssessment,
    severity,
    nextQuestion,
    quickReplies,
    checksToday,
    safeActionsNow,
    actionsToAvoid,
    photoRecommended,
    escalationRecommended,
    internalMissingInformation,
  };
}

function hasUsefulGuidance(payload: AgronomicCasePayload): boolean {
  return (
    payload.checksToday.length > 0 ||
    payload.safeActionsNow.length > 0 ||
    payload.preliminaryAssessment.length > 40
  );
}

function hasWaterOrRootEvidence(payload: AgronomicCasePayload): boolean {
  const text = [
    payload.preliminaryAssessment,
    ...payload.internalMissingInformation,
    ...payload.checksToday,
  ]
    .join(" ")
    .toLowerCase();

  return /\b(drain|drainage|wet|waterlog|irrigation|root|roots)\b/.test(text);
}

function shouldEscalate(
  payload: AgronomicCasePayload,
  facts: KnownFarmerFacts,
): boolean {
  if (payload.escalationRecommended || facts.suddenWilt) return true;

  const text = [payload.preliminaryAssessment, ...payload.internalMissingInformation]
    .join(" ")
    .toLowerCase();

  return (
    /\b(serious\s+wilt|bacterial\s+wilt|rapid\s+wilt|sudden\s+wilt)\b/.test(
      text,
    ) ||
    /\b(chemical\s+injury|herbicide\s+(damage|injury)|spray\s+burn)\b/.test(
      text,
    ) ||
    /\b(high[\s-]?loss|entire\s+crop)\b/.test(text) ||
    payload.severity === "high"
  );
}

function pickFallbackQuestion(
  facts: KnownFarmerFacts,
  questionsAskedBeforeThisTurn: number,
): string {
  if (
    facts.crop === "tomato" &&
    facts.suspectedIssue === "whiteflies"
  ) {
    const index = Math.min(
      questionsAskedBeforeThisTurn,
      WHITEFLY_QUICK_SEQUENCE.length - 1,
    );
    // Skip distribution question if already known.
    if (
      index === 0 &&
      facts.distributionHint &&
      WHITEFLY_QUICK_SEQUENCE.length > 1
    ) {
      return WHITEFLY_QUICK_SEQUENCE[1];
    }
    return WHITEFLY_QUICK_SEQUENCE[index];
  }

  if (facts.distributionHint) {
    if (facts.suddenWilt) {
      return "Did the wilt start after a hot day, heavy rain, or a recent spray?";
    }
    return "Are you seeing soft stems, yellowing, sticky leaves, holes, or insects underneath the leaves?";
  }

  if (questionsAskedBeforeThisTurn === 0) {
    return "Are they affecting a few plants, patches, or most of the field?";
  }
  if (questionsAskedBeforeThisTurn === 1) {
    return "What exactly do you see on the leaves or stems right now?";
  }
  return "What have you sprayed during the last seven days?";
}

function buildForcedQuickGuidance(
  facts: KnownFarmerFacts,
  payload: AgronomicCasePayload,
): Pick<
  AgronomicCasePayload,
  | "preliminaryAssessment"
  | "severity"
  | "checksToday"
  | "safeActionsNow"
  | "actionsToAvoid"
  | "photoRecommended"
  | "escalationRecommended"
> {
  const crop = facts.crop ?? "crop";
  const issue = facts.suspectedIssue ?? "the reported problem";

  if (facts.suddenWilt) {
    return {
      preliminaryAssessment: `Preliminary guidance: Sudden wilting in ${crop} can signal serious root, vascular disease, or chemical injury. This is not a final diagnosis — treat it as urgent triage.`,
      severity: "high",
      checksToday: [
        "Cut a wilted stem lengthwise and check for brown streaks inside",
        "Feel whether the soil is waterlogged or bone dry around roots",
        "Note whether wilted plants are in a patch or scattered",
      ],
      safeActionsNow: [
        "Stop new sprays until the pattern is clearer",
        "Isolate badly wilted plants if practical",
        "Take a clear photo of wilted plants and a cut stem for review",
      ],
      actionsToAvoid: [
        "Do not mix pesticides into unapproved cocktails",
        "Do not assume fertilizer will reverse sudden wilt",
      ],
      photoRecommended: true,
      escalationRecommended: true,
    };
  }

  if (facts.suspectedIssue === "whiteflies") {
    return {
      preliminaryAssessment: `Preliminary guidance: Tomato whiteflies are a likely concern based on your report. Severity and next steps depend on how widespread the infestation is and whether leaves show sticky residue, mould, or yellowing. This is preliminary only.`,
      severity:
        facts.distributionHint === "most of field" ? "high" : payload.severity === "unknown" ? "medium" : payload.severity,
      checksToday: [
        "Turn over leaves and look for tiny white insects",
        "Check for sticky residue or black sooty mould",
        "Compare a few plants versus patches versus most of the field",
      ],
      safeActionsNow: [
        "Scout early morning when whiteflies are easier to see",
        "Remove heavily infested lower leaves if plants are strong enough",
        "Avoid spraying the same product repeatedly without checking results",
      ],
      actionsToAvoid: [
        "Do not mix insecticides into unapproved cocktails",
        "Do not wait until the whole field is sticky and yellow before scouting",
      ],
      photoRecommended: true,
      escalationRecommended: facts.distributionHint === "most of field",
    };
  }

  if (facts.stuntedWholeField || facts.distributionHint === "most of field") {
    return {
      preliminaryAssessment: `Preliminary guidance: Whole-field ${issue} on ${crop} needs cautious triage. Check water, drainage and roots before adding fertilizer. This is not a confirmed diagnosis.`,
      severity: "high",
      checksToday: [
        "Compare low spots and higher ground for wet or dry soil",
        "Dig beside a few plants and inspect root colour and smell",
        "Note yellowing pattern — older leaves, new leaves, or both",
      ],
      safeActionsNow: [
        "Pause irrigation if soil stays wet for more than a day",
        "Walk the whole field and mark the worst patches",
        "Upload a photo of roots and foliage if possible",
      ],
      actionsToAvoid: [
        "Do not add sand or gravel to an established commercial field",
        "Do not apply fertilizer solely because plants look stunted",
      ],
      photoRecommended: true,
      escalationRecommended: true,
    };
  }

  return {
    preliminaryAssessment: `Preliminary guidance: Based on your ${crop} report (${issue}), start with distribution and leaf symptoms, then take safe observation steps. This is preliminary only — a full crop check can go deeper.`,
    severity: payload.severity === "unknown" ? "medium" : payload.severity,
    checksToday:
      payload.checksToday.length > 0
        ? payload.checksToday
        : [
            "Confirm whether a few plants, patches, or most of the field are affected",
            "Inspect the underside of leaves and stem bases closely",
          ],
    safeActionsNow:
      payload.safeActionsNow.length > 0
        ? payload.safeActionsNow
        : [
            "Scout today and note sticky leaves, holes, wilt, or insects",
            "Hold off on new chemical mixes until the pattern is clearer",
          ],
    actionsToAvoid:
      payload.actionsToAvoid.length > 0
        ? payload.actionsToAvoid
        : [
            "Do not mix pesticides into unapproved cocktails",
            "Do not apply fertilizer as the first response without checking water and roots",
          ],
    photoRecommended: true,
    escalationRecommended: payload.escalationRecommended,
  };
}

function normalizeQuickReplies(
  replies: string[],
  stage: CaseStage,
  photoRecommended: boolean,
): string[] {
  const cleaned = replies
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (cleaned.length > 0) {
    const hasStandard = cleaned.some((item) =>
      (STANDARD_QUICK_REPLIES as readonly string[]).some(
        (standard) => standard.toLowerCase() === item.toLowerCase(),
      ),
    );
    if (hasStandard) return cleaned;
  }

  return defaultQuickReplies(stage, photoRecommended);
}

export function mentionsSandOrGravel(text: string): boolean {
  return SAND_OR_GRAVEL.test(text);
}

export function mentionsPrematureFertilizer(text: string): boolean {
  return PREMATURE_FERTILIZER.test(text);
}
