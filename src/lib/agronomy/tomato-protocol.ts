/**
 * Rapid triage protocol for Caribbean crop problems (Quick Help + Full Crop Check).
 */

import {
  emptyRegionalContext,
  isGuidanceStage,
  isInterviewStage,
  QUICK_HELP_MAX_QUESTIONS,
  stripMarkdownMarkers,
  type AgronomicCasePayload,
  type CaseMode,
  type CaseStage,
  type SeverityLevel,
} from "./case-schema";
import {
  buildQuestionId,
  inferQuestionType,
  quickRepliesForType,
  type QuestionType,
} from "./question-types";

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

export type FarmerScale = "commercial" | "home" | null;

export type KnownFarmerFacts = {
  crop: string | null;
  suspectedIssue: string | null;
  country: string | null;
  district: string | null;
  distributionHint: string | null;
  productionSystem: string | null;
  farmerScale: FarmerScale;
  areaPlanted: string | null;
  plantAge: string | null;
  suddenWilt: boolean;
  stuntedWholeField: boolean;
  asksForProducts: boolean;
  asksAboutWeather: boolean;
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

const SCALE_QUESTION =
  /\b(commercial\s+or\s+home|home\s+garden|are\s+you\s+a\s+(commercial|home)|smallholder\s+or\s+commercial)\b/i;

const ACREAGE_QUESTION =
  /\b(how\s+many\s+acres|what\s+acreage|area\s+planted|how\s+large\s+is\s+(the|your)\s+(field|plot|farm))\b/i;

const PLANT_AGE_QUESTION =
  /\b(how\s+old\s+are\s+the\s+plants|plant\s+age|weeks?\s+old|what\s+stage\s+are\s+the\s+plants)\b/i;

/**
 * Extract facts already stated by the farmer so we never re-ask them.
 */
export function extractKnownFacts(
  text: string,
  profile?: { country?: string | null; district?: string | null } | null,
): KnownFarmerFacts {
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
  else if (/\b(blight|leaf\s+spot|fungal)\b/.test(lower)) {
    suspectedIssue = "foliar fungal disease";
  }

  let country: string | null = profile?.country?.trim() || null;
  if (!country) {
    if (/\btrinidad\b/.test(lower) || /\btobago\b/.test(lower)) {
      country = "Trinidad and Tobago";
    } else if (/\bjamaica\b/.test(lower)) country = "Jamaica";
    else if (/\bbarbados\b/.test(lower)) country = "Barbados";
    else if (/\bguyana\b/.test(lower)) country = "Guyana";
  }

  let district: string | null = profile?.district?.trim() || null;
  if (!district) {
    const districtMatch = lower.match(
      /\b(chaguanas|arima|san\s+fernando|port\s+of\s+spain|sangre\s+grande|point\s+fortin)\b/,
    );
    if (districtMatch) district = districtMatch[1];
  }

  let distributionHint: string | null = null;
  if (/\b(whole|entire|most\s+of\s+the)\s+field\b/.test(lower)) {
    distributionHint = "most of field";
  } else if (/\bpatches?\b/.test(lower)) {
    distributionHint = "patches";
  } else if (/\bfew\s+plants?\b/.test(lower)) {
    distributionHint = "few plants";
  }

  let productionSystem: string | null = null;
  if (/\bgreenhouse\b/.test(lower)) productionSystem = "greenhouse";
  else if (/\bshade\s*house\b/.test(lower)) productionSystem = "shade_house";
  else if (/\bhydroponic\b/.test(lower)) productionSystem = "hydroponic";
  else if (/\bopen\s+field\b/.test(lower)) productionSystem = "open_field";

  let farmerScale: FarmerScale = null;
  if (
    /\bcommercial\s+(farmer|grower|farm|production|field)\b/.test(lower) ||
    /\bi('m| am)\s+a\s+commercial\b/.test(lower)
  ) {
    farmerScale = "commercial";
  } else if (
    /\b(home|backyard|kitchen)\s+(garden|gardener|grower)\b/.test(lower) ||
    /\bhome\s+gardener\b/.test(lower)
  ) {
    farmerScale = "home";
  }

  const areaMatch = lower.match(
    /\b(\d+(?:\.\d+)?)\s*(acres?|hectares?|ha)\b/,
  );
  const areaPlanted = areaMatch
    ? `${areaMatch[1]} ${areaMatch[2]}`
    : null;

  const ageMatch =
    lower.match(/\b(\d+)\s*(weeks?|months?|days?)\s+old\b/) ||
    lower.match(/\bplants?\s+are\s+(\d+)\s*(weeks?|months?|days?)\b/);
  const plantAge = ageMatch ? `${ageMatch[1]} ${ageMatch[2]}` : null;

  return {
    crop,
    suspectedIssue,
    country,
    district,
    distributionHint,
    productionSystem,
    farmerScale,
    areaPlanted,
    plantAge,
    suddenWilt:
      /\bsudden(ly)?\s+wilt/.test(lower) ||
      /\bwilt(ing|ed)?\s+suddenly\b/.test(lower),
    stuntedWholeField:
      /\bstunt/.test(lower) &&
      /\b(whole|entire|most\s+of\s+the)\s+field\b/.test(lower),
    asksForProducts:
      /\b(product|pesticide|insecticide|fungicide|spray\s+to\s+use|what\s+can\s+i\s+(buy|use)|what\s+can\s+i\s+use|recommend(ed)?\s+(a\s+)?(product|chemical)|ask about (a )?product)\b/.test(
        lower,
      ) || /\bask about products\b/.test(lower),
    asksAboutWeather:
      /\b(weather|forecast|humidity|humid|dew\b|leaf\s+disease|disease\s+pressure|heavy\s+rain|rainfall|rainy|could this weather)\b/.test(
        lower,
      ) || /\bwhy am i suddenly seeing more\b/.test(lower),
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

  if (facts.farmerScale && SCALE_QUESTION.test(question)) {
    return true;
  }

  if (facts.areaPlanted && ACREAGE_QUESTION.test(question)) {
    return true;
  }

  if (facts.plantAge && PLANT_AGE_QUESTION.test(question)) {
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
  let nextQuestion = stripMarkdownMarkers(payload.nextQuestion);
  let preliminaryAssessment = stripMarkdownMarkers(
    payload.preliminaryAssessment,
  );
  let severity: SeverityLevel = payload.severity;
  let checksToday = payload.checksToday.map(stripMarkdownMarkers);
  let safeActionsNow = payload.safeActionsNow.map(stripMarkdownMarkers);
  let actionsToAvoid = payload.actionsToAvoid.map(stripMarkdownMarkers);
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

  // Never recommend chemical products from vague symptoms alone.
  if (isInterviewStage(stage) && !options.knownFacts.asksForProducts) {
    safeActionsNow = safeActionsNow.filter((action) => {
      if (
        /\b(apply|spray|use)\b.{0,40}\b(insecticide|fungicide|herbicide|pesticide|imidacloprid|mancozeb|chemical)\b/i.test(
          action,
        )
      ) {
        ensureAvoid(
          "Do not apply a chemical solely from a vague symptom — confirm the issue first.",
        );
        return false;
      }
      return true;
    });
  }

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

  // Never re-ask facts already in the farmer's message or profile.
  if (
    nextQuestion &&
    questionAsksForKnownFact(nextQuestion, options.knownFacts)
  ) {
    nextQuestion = "";
  }

  // Do not automatically ask country when already known, or first in Quick Help.
  if (
    nextQuestion &&
    LOCATION_QUESTION.test(nextQuestion) &&
    (options.knownFacts.country || mode === "quick_help")
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

  // Ask a follow-up only when the model left a material gap — do not force
  // a three-question interview when useful advice is already available.
  if (mode === "quick_help" && isInterviewStage(stage) && !nextQuestion) {
    const usefulAnswer =
      hasUsefulGuidance({
        ...payload,
        preliminaryAssessment,
        checksToday,
        safeActionsNow,
      }) || preliminaryAssessment.length > 80;

    if (usefulAnswer) {
      stage = options.knownFacts.suddenWilt ? "human_review" : "assessment";
    } else {
      nextQuestion = pickFallbackQuestion(
        options.knownFacts,
        options.questionsAskedBeforeThisTurn,
      );
    }
  }

  if (isGuidanceStage(stage)) {
    if (!preliminaryAssessment.toLowerCase().includes("preliminary")) {
      preliminaryAssessment = `Preliminary guidance: ${preliminaryAssessment}`;
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

  let questionType: QuestionType | "" = "";
  let questionId = "";

  if (nextQuestion) {
    const inferred = inferQuestionType(nextQuestion);
    questionType =
      payload.questionType && payload.questionType !== "open"
        ? (payload.questionType as QuestionType)
        : inferred;

    // Prefer deterministic type inference for common patterns.
    if (inferred !== "open") {
      questionType = inferred;
    }

    const questionNumber =
      options.questionsAskedBeforeThisTurn +
      (isInterviewStage(stage) ? 1 : 0);
    // Always bind questionId to the resolved questionType so stale buttons cannot linger.
    questionId = buildQuestionId(
      questionType || "open",
      Math.max(1, questionNumber),
    );

    const typedReplies = quickRepliesForType(questionType || "open");
    if (typedReplies.length > 0) {
      quickReplies = typedReplies;
    } else {
      // Unsupported / open question type — no unrelated buttons.
      quickReplies = [];
    }
  } else if (isGuidanceStage(stage)) {
    questionType = "guidance_followup";
    questionId = buildQuestionId("guidance_followup", options.questionsAskedBeforeThisTurn);
    quickReplies = quickRepliesForType("guidance_followup");
    if (!photoRecommended) {
      quickReplies = quickReplies.filter((item) => !/upload a photo/i.test(item));
    }
  } else {
    questionType = "";
    questionId = "";
    quickReplies = [];
  }

  return {
    mode,
    stage,
    questionId,
    questionType,
    nextQuestion,
    quickReplies,
    preliminaryAssessment,
    severity,
    checksToday,
    safeActionsNow,
    actionsToAvoid,
    photoRecommended,
    escalationRecommended,
    regionalContext: payload.regionalContext ?? emptyRegionalContext({
      country: options.knownFacts.country,
      district: options.knownFacts.district,
    }),
    weatherRisks: payload.weatherRisks ?? [],
    verifiedInputOptions: payload.verifiedInputOptions ?? [],
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

export function mentionsSandOrGravel(text: string): boolean {
  return SAND_OR_GRAVEL.test(text);
}

export function mentionsPrematureFertilizer(text: string): boolean {
  return PREMATURE_FERTILIZER.test(text);
}
