import { isDiagnosticIntent, type IntentCategory } from "@/lib/assistant/intents";
import { isGuidanceStage, isInterviewStage, type AgronomicCasePayload } from "./case-schema";
import type { KnownFarmerFacts } from "./tomato-protocol";
import { agronomicModeFor, shouldShowRankedCauses } from "./case-modes";
import { cropPlaybookFor, rankCropCauses } from "./crop-differentials";
import {
  extractObservedEvidence,
  genericCauseList,
  isGenericFallbackCause,
  weatherChangesDecision,
} from "./evidence-hierarchy";
import { sanitizeCertaintyLanguage, overclaimsConfirmation } from "./certainty-language";
import { buildSprayGuidance, hasUnverifiedCountryPesticideClaim, sanitizePrematureSprayWording } from "./chemical-guidance";
import { sanitizeDestructiveActions, softenDestructiveWording } from "@/lib/cases/destructive";
import type { AgronomicWeatherSignal } from "./agronomic-weather";
import type { RankedCause } from "./causes";
import { reconcileQuickReplies, repliesMatchQuestion } from "./question-types";
import { sanitizePhotoQuestion } from "./photo-request";
import {
  alignNarrativeToObservedSymptoms,
  extractSymptomAttributes,
  hasStaleSymptomWording,
} from "./symptom-consistency";
import {
  applyAuthoritativeCaseValidation,
  isDiagnosticContinuityFollowUp,
  isGenericCareQuestion,
  spotsAreObserved,
  sprayDiscussionJustified,
} from "./case-continuity";
import {
  admitEvidenceGatedCauses,
  curlYellowFollowUp,
} from "./evidence-gated-causes";
import type { CropHealthCaseState } from "./crop-health-state";

const GENERIC_DIAGNOSIS =
  /\b(could be heat|heat, nutrient|heat, watering|may be a disease|monitor it|check your plants|could be many things|looks like stress)\b/i;

const DESCRIBED_PROBLEM =
  /\b(burn|burning|scorch|wilt|yellow|spot|lesion|hole|stunt|disease|pest|whitefl|blight|rot|mould|mold|chloros|necrosis|tip\s*burn|leaf\s+edges?|crispy|curl)\b/i;

const PHOTO_INSUFFICIENT =
  /\b(photo is (a bit )?distant|blurry|too far|insufficient|first look only|cannot see|image is (unclear|too distant))\b/i;

export type DiagnosisQuality = {
  adequate: boolean;
  reasons: string[];
};

function hasUncertainty(payload: AgronomicCasePayload): boolean {
  const text = `${payload.preliminaryAssessment} ${(payload.likelyCauses ?? []).join(" ")}`;
  return (
    (payload.likelyCauses ?? []).length !== 1 ||
    /\b(could|may|might|possible|several|differential|or)\b/i.test(text)
  );
}

function farmerDescribedCropProblem(
  payload: AgronomicCasePayload,
  facts?: KnownFarmerFacts,
): boolean {
  if (facts?.suspectedIssue) return true;
  if (facts?.rawText && DESCRIBED_PROBLEM.test(facts.rawText)) return true;
  return GENERIC_DIAGNOSIS.test(payload.preliminaryAssessment);
}

/**
 * Structure/content check for a serious crop diagnosis.
 * Not a character-count gate. Interview turns and insufficient photos are not
 * forced through a full differential.
 */
export function evaluateDiagnosisQuality(
  payload: AgronomicCasePayload,
  options: {
    intent?: IntentCategory | null;
    facts?: KnownFarmerFacts;
  } = {},
): DiagnosisQuality {
  const intent = options.intent ?? (payload.intent as IntentCategory | undefined) ?? null;
  if (intent && !isDiagnosticIntent(intent)) {
    return { adequate: true, reasons: [] };
  }

  const reasons: string[] = [];
  const assessment = payload.preliminaryAssessment.trim();
  const causes = payload.likelyCauses ?? [];
  const disconfirm = payload.whatWouldChangeDiagnosis ?? [];
  const generic = GENERIC_DIAGNOSIS.test(assessment) && causes.length < 2;

  if (generic) {
    reasons.push("generic_diagnosis");
  }

  if (isInterviewStage(payload.stage)) {
    return { adequate: reasons.length === 0, reasons };
  }

  if (PHOTO_INSUFFICIENT.test(assessment)) {
    return { adequate: reasons.length === 0, reasons };
  }

  if (options.facts?.suspectedIssue === "whiteflies") {
    const pestContradicted = (payload.rankedCauses ?? []).some((cause) =>
      isGenericFallbackCause(cause.label),
    );
    if (pestContradicted) reasons.push("observed_pest_overridden");
    return { adequate: reasons.length === 0, reasons };
  }

  if (options.facts?.suddenWilt) {
    if (overclaimsConfirmation(assessment)) reasons.push("overclaimed_confirmation");
    return { adequate: reasons.length === 0, reasons };
  }

  if (!farmerDescribedCropProblem(payload, options.facts) && !generic) {
    return { adequate: true, reasons: [] };
  }

  if (!isGuidanceStage(payload.stage) && !generic) {
    return { adequate: reasons.length === 0, reasons };
  }

  if (payload.agronomicMode !== "OBSERVED_PEST_MANAGEMENT" && hasUncertainty(payload) && causes.length < 2) {
    reasons.push("missing_ranked_causes");
  }
  if (payload.checksToday.length < 2) {
    reasons.push("missing_field_checks");
  }
  if (payload.safeActionsNow.length < 1) {
    reasons.push("missing_safe_actions");
  }
  if (payload.actionsToAvoid.length < 1) {
    reasons.push("missing_what_not_to_do");
  }
  if (disconfirm.length < 1) {
    reasons.push("missing_what_would_change");
  }
  if (!payload.monitorNext) {
    reasons.push("missing_monitor_window");
  }

  return { adequate: reasons.length === 0, reasons };
}

export function needsDiagnosisRewrite(
  payload: AgronomicCasePayload,
  options: {
    intent?: IntentCategory | null;
    facts?: KnownFarmerFacts;
  } = {},
): boolean {
  return !evaluateDiagnosisQuality(payload, options).adequate;
}

export const THIN_REWRITE_INSTRUCTION = `The previous JSON was too thin for a serious crop problem.
Rewrite the SAME case as a stronger extension answer.
Preserve known facts and uncertainty. Do not invent a confirmed diagnosis. Do not manufacture pests or diseases that were not suggested by the symptoms.
If the farmer named a pest (for example whiteflies), manage that pest. Do not rank heat or nutrient stress as the cause.
If crop and symptom are known, use crop-relevant causes, not generic root-zone / nutrient / foliar-or-insect cards.
Write ONE coherent answer. Do not repeat the same guidance in paragraphs and again as lists.
Include: what is most likely and why; other possibilities only if unresolved; what to check now; what to do today; spray options only if asked or justified, with verified vs unverified clearly separated; weather only if it changes the ranking or a decision; what would change the assessment; one next question or one specific photo.
Do not recommend destroying plants or heavy defoliation at low confidence. If only a few leaves are badly affected, they can be removed carefully; avoid heavy defoliation until the cause is clearer.
Do not say a streaming test confirms bacterial wilt.
Do not lead with weather. Do not add product sales language. Return JSON only.`;

const DUPLICATE_HEADINGS =
  /\n?(what I think is happening|possible causes(?: ranked)?|check this now|what to do now|what not to do)\s*:?/gi;

function stripDuplicateSections(assessment: string, payload: AgronomicCasePayload): string {
  let next = assessment;
  if ((payload.likelyCauses ?? []).length > 0 || (payload.rankedCauses ?? []).length > 0) {
    next = next.replace(/\n?possible causes(?: ranked)?:[\s\S]*?(?=\n[A-Z]|$)/i, "");
  }
  if (payload.checksToday.length > 0) {
    next = next.replace(/\n?(check this now|what to check today):[\s\S]*?(?=\n[A-Z]|$)/i, "");
  }
  if (payload.safeActionsNow.length > 0) {
    next = next.replace(/\n?(what to do now|what to do today):[\s\S]*?(?=\n[A-Z]|$)/i, "");
  }
  next = next.replace(DUPLICATE_HEADINGS, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return next;
}

function irrelevantCropCause(label: string, crop: string | null): boolean {
  if (!crop) return false;
  const lower = label.toLowerCase();
  if (crop !== "tomato" && /\b(early blight|late blight|septoria leaf spot)\b/.test(lower)) return true;
  if (crop !== "banana" && crop !== "plantain" && /sigatoka/.test(lower)) return true;
  if (crop !== "celery" && /cercospora apii|septoria apiicola/.test(lower)) return true;
  return false;
}

function mapConfidence(value: string | null | undefined): "low" | "medium" | "high" | "unknown" {
  if (value === "confirmed" || value === "highly_likely") return "high";
  if (value === "likely") return "medium";
  if (value === "possible") return "low";
  return "unknown";
}

export function evaluateConsistency(options: {
  payload: AgronomicCasePayload;
  facts?: KnownFarmerFacts | null;
}): DiagnosisQuality {
  const { payload, facts } = options;
  const reasons: string[] = [];
  const evidence = extractObservedEvidence({ facts, text: facts?.rawText ?? payload.preliminaryAssessment });
  const text = [
    payload.preliminaryAssessment,
    ...(payload.likelyCauses ?? []),
    ...(payload.rankedCauses ?? []).map((item) => item.label),
    ...payload.safeActionsNow,
    ...payload.checksToday,
  ].join(" ");

  if (evidence.observedPest) {
    const genericRanked = (payload.rankedCauses ?? []).some((cause) => isGenericFallbackCause(cause.label));
    const genericLikely = (payload.likelyCauses ?? []).some((label) => isGenericFallbackCause(label));
    if (genericRanked || genericLikely) reasons.push("observed_pest_overridden");
  }

  const crop = facts?.crop ?? null;
  if (crop && (payload.likelyCauses ?? []).some((label) => irrelevantCropCause(label, crop))) {
    reasons.push("irrelevant_crop_cause");
  }

  if (hasUnverifiedCountryPesticideClaim(payload.preliminaryAssessment)) {
    reasons.push("unverified_pesticide_claim");
  }

  if (facts?.asksForProducts) {
    const rendered = [
      payload.sprayGuidanceText ?? "",
      payload.preliminaryAssessment,
      payload.diagnosisWhy ?? "",
    ].join(" ");
    if (!/if a spray is needed|could not verify a current|verified for this country/i.test(rendered)) {
      reasons.push("spray_question_unanswered");
    }
    if (
      /general active-ingredient classes/i.test(rendered) &&
      !/\b(copper|mancozeb|chlorothalonil|strobilurin|soap|beauveria)\b/i.test(rendered)
    ) {
      reasons.push("spray_classes_heading_without_classes");
    }
  }

  if (facts) {
    const attrs = extractSymptomAttributes({
      facts,
      text: facts.rawText,
    });
    const narrative = [
      payload.preliminaryAssessment,
      payload.diagnosisWhy ?? "",
      ...(payload.checksToday ?? []),
    ].join(" ");
    if (hasStaleSymptomWording(narrative, attrs)) {
      reasons.push("stale_symptom_wording");
    }
  }

  if (payload.nextQuestion.trim() && !repliesMatchQuestion(payload.nextQuestion, payload.quickReplies)) {
    reasons.push("mismatched_quick_replies");
  }

  if (overclaimsConfirmation(text, { labOrStaff: evidence.labOrStaffResult })) {
    reasons.push("overclaimed_confirmation");
  }

  const destructive = sanitizeDestructiveActions(payload.safeActionsNow, {
    observedFacts: evidence.explicitObservations,
    confidence: mapConfidence(payload.diagnosisConfidence),
  });
  if (destructive.blocked) reasons.push("destructive_low_confidence");

  const duplicate =
    /possible causes/i.test(payload.preliminaryAssessment) &&
    ((payload.rankedCauses ?? []).length > 0 || (payload.likelyCauses ?? []).length > 0);
  if (duplicate) reasons.push("duplicate_answer_sections");

  if (
    payload.weatherBrief &&
    !weatherChangesDecision({
      weatherText: `${payload.weatherBrief} ${payload.preliminaryAssessment}`,
      rankedLabels: payload.likelyCauses ?? [],
      signals: evidence.weatherSignals,
    })
  ) {
    reasons.push("weather_without_decision");
  }

  return { adequate: reasons.length === 0, reasons };
}

/**
 * One server-side correction pass before the farmer sees the answer.
 */
export function applyQualityCorrection(
  payload: AgronomicCasePayload,
  options: {
    facts: KnownFarmerFacts;
    weatherSignals?: AgronomicWeatherSignal[];
    ranked?: RankedCause[];
    hasPhotos?: boolean;
    previousState?: CropHealthCaseState | null;
  },
): AgronomicCasePayload {
  const facts = options.facts;
  const evidence = extractObservedEvidence({
    facts,
    text: facts.rawText,
    hasPhotos: options.hasPhotos,
    photoFindings: options.previousState?.photoFindings,
    weatherSignals: options.weatherSignals,
  });
  const mode = agronomicModeFor({ evidence, facts });
  const ranked =
    options.ranked ??
    rankCropCauses({
      text: facts.rawText,
      crop: facts.crop,
      evidence,
      facts,
    });
  const playbook = cropPlaybookFor({
    crop: facts.crop,
    facts,
    evidence,
    farmerLevel: facts.farmerLevel,
    ranked,
  });

  let next: AgronomicCasePayload = {
    ...payload,
    agronomicMode: mode,
    preliminaryAssessment: sanitizeCertaintyLanguage(payload.preliminaryAssessment, {
      labOrStaff: evidence.labOrStaffResult,
    }),
    checksToday: payload.checksToday.map((item) =>
      sanitizeCertaintyLanguage(item, { labOrStaff: evidence.labOrStaffResult }),
    ),
    whatWouldChangeDiagnosis: (payload.whatWouldChangeDiagnosis ?? []).map((item) =>
      sanitizeCertaintyLanguage(item, { labOrStaff: evidence.labOrStaffResult }),
    ),
  };

  let likely = [...(next.likelyCauses ?? [])].filter(
    (label) => !irrelevantCropCause(label, facts.crop),
  );
  let rankedCauses = [...(next.rankedCauses ?? [])].filter(
    (cause) => !irrelevantCropCause(cause.label, facts.crop),
  );

  if (evidence.observedPest && !evidence.secondUnexplainedSymptom) {
    likely = likely.filter((label) => !isGenericFallbackCause(label));
    rankedCauses = rankedCauses.filter((cause) => !isGenericFallbackCause(cause.label));
    if (likely.length === 0 && playbook) likely = playbook.likelyCauses;
    rankedCauses = [];
  } else if (genericCauseList(likely) && playbook) {
    likely = playbook.likelyCauses;
    rankedCauses = ranked.slice(0, 3);
  } else if (likely.length === 0 && playbook) {
    likely = playbook.likelyCauses;
  }

  if (
    playbook &&
    !spotsAreObserved(evidence, options.previousState, facts) &&
    likely.some((label) => /\b(cercospora|frogeye|bacterial leaf spot|waterlog)\b/i.test(label))
  ) {
    likely = playbook.likelyCauses;
    rankedCauses = ranked.slice(0, 3);
  }

  const gated = admitEvidenceGatedCauses({
    incoming: (likely.length > 0 ? likely : rankedCauses).map((item) =>
      typeof item === "string" ? item : item,
    ),
    evidence,
    facts,
    state: options.previousState,
    crop: facts.crop,
  });
  if (gated.admitted.length > 0) {
    likely = gated.admitted.map((cause) => cause.label);
    rankedCauses = gated.admitted;
  } else {
    likely = likely.filter((label) => !/\b(cercospora|frogeye|bacterial leaf spot|septoria|early blight)\b/i.test(label));
    rankedCauses = rankedCauses.filter((cause) => !/\b(cercospora|frogeye|bacterial leaf spot|septoria|early blight)\b/i.test(cause.label));
  }

  if (
    playbook?.why &&
    (/could be heat|root-zone stress|nutrient imbalance or watering|water regularly|balanced fertilizer|generic pepper|pots or in the ground/i.test(
      next.preliminaryAssessment,
    ) ||
      next.preliminaryAssessment.trim().length < 80 ||
      (!spotsAreObserved(evidence, options.previousState, facts) &&
        /pale[- ]centr|water[\s-]?soaked|cercospora|frogeye|if a spray is needed|mancozeb|chlorothalonil|greasy/i.test(next.preliminaryAssessment)))
  ) {
    next = { ...next, preliminaryAssessment: playbook.why, diagnosisWhy: playbook.why };
  }

  if (!shouldShowRankedCauses(mode, evidence)) {
    rankedCauses = [];
  } else if (rankedCauses.length > 0 && likely.length > 0) {
    const likelySet = new Set(likely.map((item) => item.toLowerCase()));
    const extras = rankedCauses.filter((cause) => !likelySet.has(cause.label.toLowerCase()));
    rankedCauses = extras.length === 0 ? [] : extras.slice(0, 3);
  }

  const cleanedActions = sanitizeDestructiveActions(
    next.safeActionsNow.map((item) =>
      softenDestructiveWording(item, mapConfidence(next.diagnosisConfidence)),
    ),
    {
      observedFacts: evidence.explicitObservations,
      confidence: mapConfidence(next.diagnosisConfidence),
    },
  );
  let safeActionsNow = cleanedActions.actions;
  if (cleanedActions.blocked && cleanedActions.farmerMessage) {
    if (
      !next.preliminaryAssessment.includes(cleanedActions.farmerMessage) &&
      !/unconfirmed virus|remove whole plants/i.test(cleanedActions.farmerMessage)
    ) {
      next = {
        ...next,
        preliminaryAssessment: `${next.preliminaryAssessment} ${cleanedActions.farmerMessage}`.trim(),
      };
    }
    if (playbook) {
      safeActionsNow = playbook.actionsToday.filter(
        (item) =>
          !sanitizeDestructiveActions([item], {
            observedFacts: evidence.explicitObservations,
            confidence: mapConfidence(next.diagnosisConfidence),
          }).blocked,
      );
    }
  }

  next = {
    ...next,
    likelyCauses: likely,
    rankedCauses,
    safeActionsNow,
    diagnosisWhy: next.diagnosisWhy || playbook?.why || next.diagnosisWhy,
  };

  if (
    playbook?.why &&
    evidence.weatherSignals.includes("prolonged_wetness") &&
    !/\b(wet|rain|damp|humid|leaf-disease)\b/i.test(next.diagnosisWhy || "")
  ) {
    next = { ...next, diagnosisWhy: playbook.why };
  }

  const confidence = mapConfidence(next.diagnosisConfidence);
  next.preliminaryAssessment = softenDestructiveWording(
    stripDuplicateSections(next.preliminaryAssessment, next),
    confidence,
  );
  if (next.diagnosisWhy) {
    next = {
      ...next,
      diagnosisWhy: softenDestructiveWording(next.diagnosisWhy, confidence),
    };
  }
  next = {
    ...next,
    weatherRisks: next.weatherRisks.map((risk) => ({
      ...risk,
      preventiveActions: risk.preventiveActions.map((item) =>
        softenDestructiveWording(item, confidence),
      ),
    })),
  };

  if (
    next.weatherBrief &&
    next.weatherRelevance !== "central" &&
    next.weatherRelevance !== "important" &&
    !weatherChangesDecision({
      weatherText: `${next.weatherBrief} ${next.preliminaryAssessment}`,
      rankedLabels: next.likelyCauses ?? [],
      signals: evidence.weatherSignals,
    })
  ) {
    next = { ...next, weatherBrief: null };
  }

  const spotsObserved = spotsAreObserved(evidence, options.previousState, facts);
  const sprayJustified = sprayDiscussionJustified({
    asksForSpray: facts.asksForProducts,
    evidence,
    diagnosisConfidence: next.diagnosisConfidence,
    mode: mode,
    state: options.previousState,
    facts,
  });
  if (sprayJustified) {
    const spray = buildSprayGuidance({
      country: facts.country,
      crop: facts.crop,
      target: facts.suspectedIssue,
      observedPest: evidence.observedPestLabel,
      diagnosisConfidence: next.diagnosisConfidence,
      asksForSpray: true,
      verifiedInputs: next.verifiedInputOptions,
      pesticideChecks: next.pesticideChecks,
      likelyCauses: likely,
      admittedCauses: (next.admittedCauses ?? []).map((cause) => cause.label),
      spotsObserved,
    });
    if (spray) {
      next = { ...next, sprayGuidanceText: spray.farmerText };
    }
  } else {
    next = { ...next, sprayGuidanceText: null };
  }

  if (
    !spotsObserved &&
    (facts.suspectedIssue === "leaf curl and yellowing" ||
      facts.suspectedIssue === "leaf curl" ||
      evidence.symptoms.includes("leaf curl"))
  ) {
    const curlQuestion = curlYellowFollowUp({
      hasPhotos: options.hasPhotos,
      findings: options.previousState?.photoFindings,
      answered: options.previousState?.answeredDiagnosticQuestions,
      last: options.previousState?.lastDiagnosticQuestion,
    });
    if (
      !next.nextQuestion.trim() ||
      /spots?|pale centre|water-soaked|country|just to confirm/i.test(next.nextQuestion) ||
      isGenericCareQuestion(next.nextQuestion) ||
      isDiagnosticContinuityFollowUp(facts.rawText)
    ) {
      next = { ...next, nextQuestion: curlQuestion };
    }
  }

  if (
    playbook &&
    !spotsObserved &&
    next.checksToday.some((item) => /pale[- ]centr|water[\s-]?soaked|cercospora|frogeye|if a spray is needed|greasy|mancozeb|chlorothalonil/i.test(item))
  ) {
    next = { ...next, checksToday: playbook.checks };
  }
  if (
    playbook &&
    !spotsObserved &&
    next.safeActionsNow.some((item) => /pale[- ]centr|water[\s-]?soaked|cercospora|if a spray is needed|mancozeb|chlorothalonil|copper spray|greasy/i.test(item))
  ) {
    next = { ...next, safeActionsNow: playbook.actionsToday };
  }
  if (
    playbook &&
    !spotsObserved &&
    next.actionsToAvoid.some((item) => /pale[- ]centr|water[\s-]?soaked|cercospora|if a spray is needed|mancozeb|chlorothalonil|greasy/i.test(item))
  ) {
    next = { ...next, actionsToAvoid: playbook.avoid };
  }

  next = {
    ...next,
    nextQuestion: sanitizePhotoQuestion(next.nextQuestion, facts),
  };

  const reconciled = reconcileQuickReplies({
    question: next.nextQuestion,
    quickReplies: next.quickReplies,
    questionType: next.questionType,
  });
  next = {
    ...next,
    questionType: reconciled.questionType,
    quickReplies: reconciled.quickReplies,
  };

  if (hasUnverifiedCountryPesticideClaim(next.preliminaryAssessment) && facts.country) {
    next = {
      ...next,
      preliminaryAssessment: next.preliminaryAssessment.replace(
        /\b(registered in|approved in|legal to spray in)\b[^.]*\./gi,
        `I could not verify a current ${facts.country} registration for this exact use. `,
      ),
    };
  }

  const attrs = extractSymptomAttributes({
    facts,
    text: facts.rawText,
    weatherSignals: evidence.weatherSignals,
  });
  const align = (value: string) =>
    sanitizePrematureSprayWording(alignNarrativeToObservedSymptoms(value, attrs));
  next = {
    ...next,
    preliminaryAssessment: align(next.preliminaryAssessment),
    diagnosisWhy: next.diagnosisWhy ? align(next.diagnosisWhy) : next.diagnosisWhy,
    checksToday: next.checksToday.map(align),
    safeActionsNow: next.safeActionsNow.map(align),
    actionsToAvoid: next.actionsToAvoid.map(align),
    monitorNext: next.monitorNext ? align(next.monitorNext) : next.monitorNext,
    sprayGuidanceText: next.sprayGuidanceText ? align(next.sprayGuidanceText) : next.sprayGuidanceText,
    weatherBrief: next.weatherBrief
      ? alignNarrativeToObservedSymptoms(next.weatherBrief, attrs)
      : next.weatherBrief,
  };

  next = applyAuthoritativeCaseValidation(next, {
    facts,
    evidence,
    state: options.previousState,
    hasPhotos: options.hasPhotos,
  });

  if (!shouldShowRankedCauses(mode, evidence)) {
    next = { ...next, rankedCauses: [] };
  }

  const finalReplies = reconcileQuickReplies({
    question: next.nextQuestion,
    quickReplies: next.quickReplies,
    questionType: next.questionType,
  });
  next = {
    ...next,
    questionType: finalReplies.questionType,
    quickReplies: finalReplies.quickReplies,
  };

  return next;
}
