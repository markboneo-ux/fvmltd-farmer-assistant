import "server-only";

import OpenAI from "openai";
import {
  type AiDiagnosticCode,
  type GuestChatMessage,
} from "@/lib/ai/guestChat";
import { formatCalculationReply, tryFarmerCalculation } from "@/lib/assistant/calculator";
import { buildCashflowTurn } from "@/lib/assistant/cashflow";
import {
  cropLockInstruction,
  resolveTurnContext,
  sanitizeFarmerFacingText,
  sliceHistoryForCurrentIntent,
} from "@/lib/assistant/context";
import {
  farmerContextFromText,
  farmerContextSummary,
  mergeFarmerContext,
  responseTokenBudget,
  shouldAskCountry,
  type LocationConfidence,
} from "@/lib/assistant/farmer-context";
import {
  isCalculationIntent,
  isDiagnosticIntent,
  type IntentCategory,
} from "@/lib/assistant/intents";
import { applyDiagnosticPlaybook } from "@/lib/agronomy/diagnosis";
import { cropPlaybookFor } from "@/lib/agronomy/crop-differentials";
import { needsDiagnosisRewrite, THIN_REWRITE_INSTRUCTION, applyQualityCorrection } from "@/lib/agronomy/response-quality";
import { answerShapeForIntent } from "./answer-structure";
import { rankDiagnosticCauses, rankedCausesForPrompt } from "./causes";
import { rankTurnContext, relevanceInstructions } from "./relevance";
import { getWeatherDiseaseRisk } from "@/lib/agronomy/get-weather-disease-risk";
import {
  formatForecastTimingBrief,
  forecastLooksHot,
  forecastLooksWetOrHumid,
} from "@/lib/agronomy/weather-brief";
import { formatSupportingWeatherNote } from "@/lib/agronomy/weather-relevance";
import { getOpenAIEnvDiagnostics, getOpenAIModel } from "@/lib/openai/env";
import { tryCreateOpenAIClient } from "@/lib/openai/client";
import { getVerifiedRegionalInputs } from "@/lib/regional-inputs/get-verified-regional-inputs";
import { NO_VERIFIED_PRODUCT_MESSAGE } from "@/lib/regional-inputs/types";
import { classifyPesticideQuery } from "@/lib/research/pesticide-query";
import { classifyResearchNeed } from "@/lib/research/should-research";
import { researchNotesForPrompt, runCountryResearch } from "@/lib/research/run";
import { recordWebResearchEvent } from "@/lib/research/events";
import { persistWebResearchEvent } from "@/lib/research/persist";
import { detectResearchTopics, countryPromptIfNeeded, shouldRunWebResearch } from "@/lib/research/policy";
import { sanitizeUnverifiedPesticideClaims } from "@/lib/research/pesticides";
import { resolveConversationReference } from "@/lib/assistant/reference-resolution";
import { citationToUiSource, enrichCitations, sourceVerificationLine, stripCitedSourceNames } from "@/lib/research/citations";
import { applyPesticideAnswerToText, isGenericRegulatoryRefusal } from "@/lib/research/pesticide-answer";
import type { ResearchResult, WebResearchResult } from "@/lib/research/types";
import { newCorrelationId, logStageFailure } from "@/lib/errors/correlation";
import { logOps } from "@/lib/security/ops-log";
import { getForecast } from "@/lib/weather/get-forecast";
import { resolveFarmingArea, shouldAskFarmingArea, farmingAreaUniquelyImpliesCountry } from "@/lib/weather/geocode";
import { summarizeAgronomicWeather } from "./agronomic-weather";
import type { AgronomicWeatherSignal } from "./agronomic-weather";
import { emptyWeatherDebug, logWeatherDebug, type WeatherRetrievalDebug } from "./weather-debug";
import { buildDifferentialDiagnosis, isLowDiagnosticConfidence } from "./differential";
import {
  mergeCropHealthState,
  type CropHealthCaseState,
} from "./crop-health-state";
import { extractObservedEvidence } from "./evidence-hierarchy";
import { farmerIntentFromMessage, photoUnknownLine } from "./case-continuity";
import {
  admitEvidenceGatedCauses,
  applyAdmittedCauseContract,
  collectRawModelCauses,
  farmerReportedLesions,
  gatedCausesToEntries,
  hasLesionEvidence,
  logCauseDebug,
  sanitizePhotoFindings,
  trustedPhotoFindings,
  admittedHasPesticideTarget,
  type CauseRankingDebug,
} from "./evidence-gated-causes";
import { agronomicModeFor, modeAnswerGuide, shouldShowRankedCauses } from "./case-modes";
import { specificPhotoRequest, sanitizePhotoQuestion } from "./photo-request";
import {
  countryKnowledgeHooks,
  countryKnowledgeNotesForPrompt,
} from "@/lib/research/country-knowledge";
import {
  CASE_RESPONSE_JSON_SCHEMA,
  emptyRegionalContext,
  isCaseMode,
  isGuidanceStage,
  parseCasePayload,
  type AgronomicCasePayload,
  type CaseMode,
  type VerifiedInputDisplay,
  type WeatherRelevanceLevel,
  type WeatherRiskOption,
} from "./case-schema";
import { buildCaseSystemInstructions } from "./system-instructions";
import {
  shouldInvokeProductTool,
  shouldInvokeWeatherTool,
  weatherRelevanceFor,
} from "./tool-policy";
import { rulesForCrop } from "./disease-risk-rules";
import { applyOutputGuard } from "./output-guard";
import {
  applyCommercialSafetyGuards,
  countPriorAssistantQuestions,
  historyAlreadyRequestedPhoto,
  type KnownFarmerFacts,
} from "./tomato-protocol";

export type CaseChatMessage = GuestChatMessage;

export type CaseImageInput = {
  mimeType: string;
  base64: string;
  fileName?: string;
};

export type CaseModelResponse = {
  id: string;
  model?: string;
  output_text?: string;
};

export type AgronomicCaseResult =
  | {
      ok: true;
      case: AgronomicCasePayload;
      responseId: string;
      model: string;
      diagnosticCode: "AI_READY";
      requestCompleted: true;
      questionsAsked: number;
      weatherDebug?: WeatherRetrievalDebug;
      causeDebug?: CauseRankingDebug;
    }
  | {
      ok: false;
      error: string;
      status: number;
      diagnosticCode: AiDiagnosticCode;
      model: string;
      requestCompleted: boolean;
    };

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeErrorMessage(message: string) {
  return message
    .replace(/\bsk-[^\s"'`,;]+/gi, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 200);
}

function logReason(
  reason: AiDiagnosticCode,
  extra?: Record<string, string | number | boolean | null | undefined>,
) {
  const diagnostics = getOpenAIEnvDiagnostics();
  console.error(`[ai/case] ${reason}`, {
    keyPresent: diagnostics.keyPresent,
    keyDefined: diagnostics.keyDefined,
    keyLength: diagnostics.keyLength,
    model: diagnostics.model,
    vercelEnv: diagnostics.vercelEnv,
    nextRuntime: diagnostics.nextRuntime,
    ...extra,
  });
}

function mapOpenAIFailure(
  error: unknown,
  model: string,
): {
  diagnosticCode: AiDiagnosticCode;
  error: string;
  status: number;
} {
  if (error instanceof OpenAI.AuthenticationError) {
    return {
      diagnosticCode: "OPENAI_AUTH_FAILED",
      error: "OpenAI rejected the server API key. Check OPENAI_API_KEY on the host.",
      status: 502,
    };
  }

  if (error instanceof OpenAI.NotFoundError) {
    return {
      diagnosticCode: "MODEL_NOT_AVAILABLE",
      error: `The configured model (${model}) is not available.`,
      status: 502,
    };
  }

  if (error instanceof OpenAI.RateLimitError) {
    const text = `${error.message} ${error.code ?? ""} ${error.type ?? ""}`.toLowerCase();
    if (
      text.includes("insufficient_quota") ||
      text.includes("billing") ||
      text.includes("quota")
    ) {
      return {
        diagnosticCode: "OPENAI_QUOTA_OR_BILLING",
        error: "OpenAI quota or billing prevented this request.",
        status: 502,
      };
    }
    return {
      diagnosticCode: "OPENAI_RATE_LIMIT",
      error: "OpenAI rate limit reached. Please try again shortly.",
      status: 429,
    };
  }

  if (error instanceof OpenAI.BadRequestError) {
    const text = `${error.message} ${error.code ?? ""}`.toLowerCase();
    if (text.includes("previous_response_id") || text.includes("previous response")) {
      return {
        diagnosticCode: "INVALID_REQUEST",
        error:
          "Previous conversation context expired. Clear the conversation and start again, or continue with full history.",
        status: 400,
      };
    }
    if (text.includes("model")) {
      return {
        diagnosticCode: "MODEL_NOT_AVAILABLE",
        error: `The configured model (${model}) is not available.`,
        status: 502,
      };
    }
    return {
      diagnosticCode: "INVALID_REQUEST",
      error: "The AI case request was rejected as invalid. Please try again.",
      status: 400,
    };
  }

  if (
    error instanceof OpenAI.APIConnectionError ||
    error instanceof OpenAI.APIConnectionTimeoutError
  ) {
    return {
      diagnosticCode: "OPENAI_REQUEST_FAILED",
      error: "Could not reach OpenAI. Check your connection and try again.",
      status: 502,
    };
  }

  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    const text = `${error.message} ${error.code ?? ""} ${error.type ?? ""}`.toLowerCase();

    if (status === 401 || status === 403) {
      return {
        diagnosticCode: "OPENAI_AUTH_FAILED",
        error:
          "OpenAI rejected the server API key. Check OPENAI_API_KEY on the host.",
        status: 502,
      };
    }
    if (
      text.includes("insufficient_quota") ||
      text.includes("billing") ||
      (status === 429 && text.includes("quota"))
    ) {
      return {
        diagnosticCode: "OPENAI_QUOTA_OR_BILLING",
        error: "OpenAI quota or billing prevented this request.",
        status: 502,
      };
    }
    if (status === 429) {
      return {
        diagnosticCode: "OPENAI_RATE_LIMIT",
        error: "OpenAI rate limit reached. Please try again shortly.",
        status: 429,
      };
    }
    if (status === 404 || (text.includes("model") && text.includes("not"))) {
      return {
        diagnosticCode: "MODEL_NOT_AVAILABLE",
        error: `The configured model (${model}) is not available.`,
        status: 502,
      };
    }
  }

  const messageText =
    error instanceof Error ? error.message : "OpenAI request failed.";
  const lower = messageText.toLowerCase();
  if (
    lower.includes("fetch") ||
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("econn") ||
    lower.includes("enotfound")
  ) {
    return {
      diagnosticCode: "OPENAI_REQUEST_FAILED",
      error: "Could not reach OpenAI. Check your connection and try again.",
      status: 502,
    };
  }

  return {
    diagnosticCode: "OPENAI_REQUEST_FAILED",
    error: "The AI case engine could not answer right now. Please try again.",
    status: 502,
  };
}

export type CaseProfileContext = {
  country?: string | null;
  district?: string | null;
  countrySource?: "client" | "continuing" | "registered" | null;
  locationConfidence?: LocationConfidence | null;
};

export type CaseActiveContext = {
  crop?: string | null;
  conversationIntent?: string | null;
  farmerProblemText?: string | null;
  country?: string | null;
  district?: string | null;
  farmerLevel?: string | null;
  cropHealthState?: CropHealthCaseState | null;
};

export function parseCaseRequestBody(body: unknown): {
  message: string;
  history: CaseChatMessage[];
  previousResponseId: string | null;
  mode: CaseMode;
  profile: CaseProfileContext;
  images: CaseImageInput[];
  activeQuestionId: string | null;
} {
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const message =
    asTrimmedString(record.message) || asTrimmedString(record.question);

  const previousResponseId =
    asTrimmedString(record.previousResponseId) ||
    asTrimmedString(record.previous_response_id) ||
    null;

  const modeRaw = asTrimmedString(record.mode).toLowerCase().replace(/\s+/g, "_");
  const mode: CaseMode = isCaseMode(modeRaw) ? modeRaw : "quick_help";

  const historyRaw = Array.isArray(record.messages)
    ? record.messages
    : Array.isArray(record.history)
      ? record.history
      : [];

  const history: CaseChatMessage[] = [];
  for (const item of historyRaw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const role = entry.role === "assistant" ? "assistant" : "user";
    const content = asTrimmedString(entry.content) || asTrimmedString(entry.text);
    if (!content) continue;
    history.push({ role, content });
  }

  const profileRaw =
    record.profile && typeof record.profile === "object"
      ? (record.profile as Record<string, unknown>)
      : {};

  const profile: CaseProfileContext = {
    country:
      asTrimmedString(profileRaw.country) ||
      asTrimmedString(record.country) ||
      null,
    district:
      asTrimmedString(profileRaw.district) ||
      asTrimmedString(record.district) ||
      null,
  };

  const images: CaseImageInput[] = [];
  const imagesRaw = Array.isArray(record.images) ? record.images : [];
  for (const item of imagesRaw.slice(0, 3)) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const mimeType = asTrimmedString(entry.mimeType) || asTrimmedString(entry.type);
    const base64 = asTrimmedString(entry.base64) || asTrimmedString(entry.data);
    if (!mimeType.startsWith("image/") || !base64) continue;
    images.push({
      mimeType,
      base64: base64.replace(/^data:[^;]+;base64,/, ""),
      fileName: asTrimmedString(entry.fileName) || asTrimmedString(entry.name) || undefined,
    });
  }

  return {
    message,
    history,
    previousResponseId,
    mode,
    profile,
    images,
    activeQuestionId: asTrimmedString(record.activeQuestionId) || null,
  };
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Empty model output.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model output was not valid JSON.");
  }
}

function summarizeKnownFacts(
  history: CaseChatMessage[],
  message: string,
  profile?: CaseProfileContext | null,
  activeCase?: CaseActiveContext | null,
) {
  return resolveTurnContext({
    history,
    message,
    profile,
    activeCase: activeCase
      ? {
          crop: activeCase.crop ?? null,
          conversationIntent: activeCase.conversationIntent ?? null,
          farmerProblemText: activeCase.farmerProblemText ?? null,
          country: activeCase.country ?? profile?.country ?? null,
          district: activeCase.district ?? profile?.district ?? null,
          farmerLevel: activeCase.farmerLevel ?? null,
          cropHealthState: activeCase.cropHealthState ?? null,
        }
      : null,
  });
}

function knownFactsSummary(facts: KnownFarmerFacts): string {
  const lines: string[] = [];
  if (facts.crop) lines.push(`- crop: ${facts.crop}`);
  else lines.push("- crop: unknown — do not assume tomato or any other crop");
  if (facts.variety) lines.push(`- variety: ${facts.variety}`);
  if (facts.suspectedIssue) lines.push(`- suspected issue: ${facts.suspectedIssue}`);
  if (facts.problemCategory) lines.push(`- problem category: ${facts.problemCategory}`);
  if (facts.userType) lines.push(`- user type: ${facts.userType}`);
  if (facts.farmerLevel) lines.push(`- farmer_level: ${facts.farmerLevel}`);
  if (facts.country) {
    lines.push(`- country/island: ${facts.country} (${facts.locationConfidence})`);
  } else {
    lines.push("- country: unknown — do not assume Trinidad and Tobago");
  }
  if (facts.district) lines.push(`- district/region: ${facts.district}`);
  if (facts.district && facts.country && farmingAreaUniquelyImpliesCountry(facts.district) === facts.country) {
    lines.push(
      `- farming area ${facts.district} uniquely implies ${facts.country}; do not ask for country confirmation`,
    );
  }
  if (facts.suspectedIssue && !/\bspot/.test(facts.suspectedIssue) && !/\bspots?\b/i.test(facts.rawText)) {
    lines.push("- observed symptoms do not include leaf spots; do not mention spots, pale centres, or fungal-vs-bacterial spray guidance");
  }
  lines.push("- Follow-up reassurance such as wanting plants to survive continues THIS case. Do not switch to generic crop-care advice.");
  lines.push("- Ask exactly one highest-value diagnostic question. Do not recommend removing whole plants at low/moderate confidence.");
  if (facts.recentFertilizer) lines.push("- recent fertilizer: mentioned");
  if (facts.recentPesticide) lines.push("- recent pesticide: mentioned");
  if (facts.irrigationType) lines.push(`- irrigation: ${facts.irrigationType}`);
  if (facts.productionSystem) {
    lines.push(`- production system: ${facts.productionSystem}`);
  }
  if (facts.farmerScale) {
    lines.push(`- farmer scale: ${facts.farmerScale}`);
  }
  if (facts.areaPlanted) {
    lines.push(`- area planted: ${facts.areaPlanted}`);
  }
  if (facts.plantAge) {
    lines.push(`- plant age: ${facts.plantAge}`);
  }
  if (facts.distributionHint) {
    lines.push(`- distribution hint: ${facts.distributionHint}`);
  }
  if (facts.suddenWilt) lines.push("- sudden wilt reported: yes");
  if (facts.asksForMarket) lines.push("- farmer asked about market prices");
  if (facts.asksForPesticideRegistration) {
    lines.push("- farmer asked about pesticide registration");
  }
  if (facts.asksForProducts) lines.push("- farmer asked about products");
  return lines.join("\n");
}

function buildUserContent(
  turnContext: string,
  images: CaseImageInput[],
): string | Array<Record<string, unknown>> {
  if (images.length === 0) return turnContext;

  const parts: Array<Record<string, unknown>> = [
    { type: "input_text", text: turnContext },
  ];

  for (const image of images) {
    parts.push({
      type: "input_image",
      image_url: `data:${image.mimeType};base64,${image.base64}`,
    });
  }

  return parts;
}

function gateRankedCausesForTurn(options: {
  ranked: ReturnType<typeof rankDiagnosticCauses>;
  evidence: ReturnType<typeof extractObservedEvidence>;
  facts: KnownFarmerFacts;
  state?: CropHealthCaseState | null;
  stage: "prompt" | "final";
}): ReturnType<typeof rankDiagnosticCauses> {
  const gated = admitEvidenceGatedCauses({
    incoming: options.ranked,
    evidence: options.evidence,
    facts: options.facts,
    state: options.state,
    crop: options.facts.crop,
  });
  if (options.stage === "prompt") {
    logCauseDebug(gated.debug, "prompt");
  }
  return gated.admitted;
}

function carriedObservedSymptoms(
  previous: string[] | undefined,
  farmerText: string,
): string[] {
  const farmerHasLesions = farmerReportedLesions(farmerText);
  return (previous ?? []).filter((item) => {
    if (/spot|lesion/i.test(item)) return farmerHasLesions;
    return true;
  });
}

function attachCropHealthState(
  payload: AgronomicCasePayload,
  facts: KnownFarmerFacts,
  hasPhotos: boolean,
  photoAlreadyRequested: boolean,
  previousState?: CropHealthCaseState | null,
  currentMessage?: string,
): { payload: AgronomicCasePayload; causeDebug: CauseRankingDebug } {
  const evidence = extractObservedEvidence({
    facts,
    text: [facts.rawText, ...carriedObservedSymptoms(previousState?.observedSymptoms, facts.rawText)]
      .filter(Boolean)
      .join(" "),
    hasPhotos,
    photoFindings: previousState?.photoFindings,
  });
  const mode = agronomicModeFor({ evidence, facts });
  const differential = buildDifferentialDiagnosis({
    text: facts.rawText,
    facts,
    ranked: shouldShowRankedCauses(mode, evidence) ? payload.rankedCauses : [],
    hasPhotos,
    photoAlreadyRequested,
  });
  const photo = specificPhotoRequest({
    facts,
    hasPhotos,
    alreadyRequested: photoAlreadyRequested,
  });
  const nextQuestion = sanitizePhotoQuestion(payload.nextQuestion, facts);
  if (nextQuestion !== payload.nextQuestion) {
    payload = { ...payload, nextQuestion };
  }
  if (
    payload.photoRecommended &&
    photo &&
    (!payload.nextQuestion.trim() || /affected leaf/i.test(payload.nextQuestion)) &&
    !photoAlreadyRequested
  ) {
    payload = {
      ...payload,
      nextQuestion: photo.farmerQuestion,
      questionType: "photo_request",
    };
  }
  if (
    isLowDiagnosticConfidence(differential.diagnosticConfidence) &&
    payload.escalationRecommended === false &&
    (facts.suddenWilt || payload.severity === "high")
  ) {
    payload = { ...payload, escalationRecommended: true };
  }

  const lesion = hasLesionEvidence({ evidence, facts, state: previousState });
  const observedFromEvidence = evidence.symptoms.filter((item) => item !== "spots" || lesion);
  const previousSafe = carriedObservedSymptoms(previousState?.observedSymptoms, facts.rawText);
  const observed = [...new Set([...observedFromEvidence, ...previousSafe])];
  const notReported = ["spots", "waterlogging", "wilting"].filter(
    (item) => !observed.some((symptom) => symptom.includes(item.replace(/ing$/, ""))),
  );
  const answered = [...(previousState?.answeredDiagnosticQuestions ?? [])];
  if (previousState?.lastDiagnosticQuestion && previousState.lastDiagnosticQuestion !== payload.nextQuestion) {
    answered.push(previousState.lastDiagnosticQuestion);
  }

  const gated = admitEvidenceGatedCauses({
    incoming: payload.likelyCauses?.length
      ? payload.likelyCauses
      : payload.rankedCauses?.length
        ? payload.rankedCauses
        : [],
    evidence,
    facts,
    state: previousState,
    crop: facts.crop,
  });
  const playbook = cropPlaybookFor({
    crop: facts.crop,
    facts,
    evidence,
    farmerLevel: facts.farmerLevel,
  });
  const cropDifferential = rankDiagnosticCauses(facts.rawText, {
    crop: facts.crop,
    facts,
    evidence,
  });
  const rawModelCauses = collectRawModelCauses({
    ...payload,
    rawModelCauses: payload.rawModelCauses ?? [],
  });
  const preGateRankedCauses = cropDifferential.map((cause) => cause.label);
  const contracted = applyAdmittedCauseContract(
    {
      ...payload,
      rawModelCauses,
    },
    {
      admitted: gated.admitted,
      rawModelCauses,
      evidence,
      facts,
      hasPhotos,
      previousState,
    },
  );
  const admitted = contracted.admittedCauses ?? [];
  const finalVisibleCauses = admitted.map((cause) => cause.label);
  const causeDebug: CauseRankingDebug = {
    stage: "final",
    extractedSymptoms: evidence.symptoms,
    rawModelCauses,
    playbookSelectedCauses: playbook?.likelyCauses ?? [],
    preGateRankedCauses,
    admittedCauses: finalVisibleCauses,
    sprayIntent: Boolean(facts.asksForProducts),
    pesticideTarget: admittedHasPesticideTarget(admitted),
    finalVisibleCauses,
    lesionEvidence: gated.debug.lesionEvidence,
    observedSymptoms: evidence.symptoms,
    photoFindings: gated.debug.photoFindings,
    causes: gated.debug.causes,
    rejected: gated.debug.rejected,
  };
  logCauseDebug(causeDebug, "final");
  console.info(
    "[fvm-first-turn-debug]",
    JSON.stringify({
      extractedSymptoms: causeDebug.extractedSymptoms,
      rawModelCauses: causeDebug.rawModelCauses,
      playbookSelectedCauses: causeDebug.playbookSelectedCauses,
      preGateRankedCauses: causeDebug.preGateRankedCauses,
      admittedCauses: causeDebug.admittedCauses,
      sprayIntent: causeDebug.sprayIntent,
      pesticideTarget: causeDebug.pesticideTarget,
      finalVisibleCauses: causeDebug.finalVisibleCauses,
    }),
  );

  const farmerHasLesions = farmerReportedLesions(facts.rawText);
  const photoFindings = hasPhotos
    ? trustedPhotoFindings({
        raw: [
          ...(previousState?.photoFindings ?? []),
          ...trustedPhotoFindings({
            raw: payload.cropHealthState?.photoFindings,
            farmerReportedLesions: farmerHasLesions,
          }),
          ...evidence.photoEvidence,
        ],
        farmerReportedLesions: farmerHasLesions || lesion,
      })
    : sanitizePhotoFindings(previousState?.photoFindings);

  const merged: CropHealthCaseState = mergeCropHealthState(previousState, {
    country: facts.country,
    farmingArea: facts.district,
    crop: facts.crop,
    variety: facts.variety,
    growthStage: facts.plantAge,
    symptoms: observed,
    observedSymptoms: observed,
    notReportedSymptoms: notReported,
    symptomLocation: previousState?.symptomLocation ?? evidence.symptomLocation,
    spread: facts.distributionHint,
    irrigation: facts.irrigationType,
    recentFertilizer: facts.recentFertilizer ? "mentioned" : null,
    recentSprays: facts.recentPesticide ? "mentioned" : null,
    photoFindings,
    suspectedCauses: gatedCausesToEntries(admitted),
    diagnosticConfidence: contracted.diagnosisConfidence ?? differential.diagnosticConfidence,
    missingInformation: contracted.internalMissingInformation,
    recommendedActions: contracted.safeActionsNow,
    suspectedPest: evidence.observedPestLabel ?? differential.suspectedPest,
    suspectedDiseaseOrDisorder: lesion
      ? differential.suspectedDiseaseOrDisorder
      : admitted.find((cause) => cause.category.includes("viral") || cause.category === "nutrition")
          ?.label ?? null,
    suspectedCause: admitted[0]?.label ?? null,
    confirmedDiagnosis: null,
    nextDistinguishingCheck: contracted.nextQuestion || differential.nextObservation,
    requestedPhotoView: photo?.view ?? previousState?.requestedPhotoView ?? null,
    agronomicMode: mode,
    farmerIntent: farmerIntentFromMessage(currentMessage || facts.rawText, facts.asksForProducts),
    lastDiagnosticQuestion: contracted.nextQuestion || null,
    answeredDiagnosticQuestions: answered,
    caseNarrative: facts.rawText,
    photoSupports: hasPhotos
      ? photoFindings.filter((item) => /curl|cup|yellow|insect|mite|mosaic|visible/i.test(item))
      : previousState?.photoSupports,
    photoWeakens: hasPhotos
      ? lesion
        ? previousState?.photoWeakens
        : ["leaf-spot disease — no discrete lesions visible"]
      : previousState?.photoWeakens,
    photoUnknown: hasPhotos ? [photoUnknownLine()] : previousState?.photoUnknown,
  });
  merged.suspectedCauses = gatedCausesToEntries(admitted);
  merged.suspectedCause = admitted[0]?.label ?? null;
  merged.suspectedDiseaseOrDisorder = lesion
    ? differential.suspectedDiseaseOrDisorder
    : admitted.find((cause) => cause.category.includes("viral") || cause.category === "nutrition")?.label ??
      null;
  merged.observedSymptoms = observed;
  merged.symptoms = observed;

  return {
    payload: {
      ...contracted,
      diagnosisConfidence: contracted.diagnosisConfidence ?? differential.diagnosticConfidence,
      agronomicMode: mode,
      cropHealthState: merged,
      locationConfidence: facts.locationConfidence,
    },
    causeDebug,
  };
}

async function enrichWithRegionalTools(
  payload: AgronomicCasePayload,
  facts: KnownFarmerFacts,
  research: ResearchResult | null,
  intent?: IntentCategory | null,
): Promise<{
  payload: AgronomicCasePayload;
  weatherDebug: WeatherRetrievalDebug;
  retrievedWeatherSignals: AgronomicWeatherSignal[];
}> {
  const country = facts.country?.trim() || "";
  const crop = facts.crop;
  const issue = facts.suspectedIssue || "general crop problem";
  const initialRelevance = weatherRelevanceFor(facts, intent);

  const geocoded = await resolveFarmingArea({
    farmingArea: facts.district,
    country: facts.country,
    text: facts.rawText,
  });
  const resolvedCountry = country || geocoded?.country || "";
  const resolvedArea = facts.district || geocoded?.farmingArea || null;

  const shouldFetchWeather =
    (Boolean(resolvedCountry) || Boolean(geocoded?.coordinates)) &&
    shouldInvokeWeatherTool(facts, intent);
  const shouldFetchInputs =
    Boolean(resolvedCountry) && Boolean(crop) && shouldInvokeProductTool(facts);

  let weatherRisks: WeatherRiskOption[] = [];
  let weatherDataAsOf: string | null = null;
  let productDataAsOf: string | null = null;
  let verifiedInputOptions: VerifiedInputDisplay[] = [];
  let weatherBrief: string | null = payload.weatherBrief ?? null;
  let weatherRelevance: WeatherRelevanceLevel = initialRelevance;
  let retrievedWeatherSignals: AgronomicWeatherSignal[] = [];
  let weatherDebug = emptyWeatherDebug({
    resolvedLocation: {
      country: resolvedCountry || geocoded?.country || null,
      farmingArea: resolvedArea,
      coordinates: geocoded?.coordinates ?? null,
    },
    providerResult: shouldFetchWeather ? "skipped" : "skipped",
  });

  if (shouldFetchWeather && (resolvedCountry || geocoded?.coordinates)) {
    try {
      const forecast = await getForecast({
        country: resolvedCountry || geocoded?.country || "",
        district: resolvedArea,
        coordinates: geocoded?.coordinates ?? null,
      });
      weatherDataAsOf = forecast.retrievedAt;
      const agronomic = summarizeAgronomicWeather(forecast);
      retrievedWeatherSignals = agronomic.signals;
      weatherDebug = {
        ...weatherDebug,
        providerResult: "success",
        providerName: forecast.provider,
        recentPeriodAvailable: (forecast.recentDaily?.length ?? 0) > 0,
        forecastAvailable:
          (forecast.forecastDaily?.length ?? forecast.daily.length) > 0,
        signals: [...retrievedWeatherSignals],
      };
      const retrievedSupportsDisease =
        retrievedWeatherSignals.includes("prolonged_wetness") ||
        retrievedWeatherSignals.includes("disease_pressure");
      const cropHasWeatherModel = Boolean(crop && rulesForCrop(crop).length > 0);
      if (
        weatherRelevance === "supporting" &&
        retrievedSupportsDisease &&
        cropHasWeatherModel
      ) {
        weatherRelevance = "important";
      }
      if (weatherRelevance === "central") {
        weatherBrief = [formatForecastTimingBrief(forecast), agronomic.farmerBrief]
          .filter(Boolean)
          .join(" ");
      } else if (weatherRelevance === "supporting") {
        weatherBrief =
          agronomic.farmerBrief ||
          formatSupportingWeatherNote({
            wetOrHumid: forecastLooksWetOrHumid(forecast),
            heat: forecastLooksHot(forecast),
            rainLikely: (forecast.daily[0]?.rainfallMm ?? 0) >= 2,
          });
      } else if (weatherRelevance === "important") {
        weatherBrief = agronomic.farmerBrief;
      }
      payload = {
        ...payload,
        cropHealthState: mergeCropHealthState(payload.cropHealthState, {
          farmingArea: resolvedArea,
          country: resolvedCountry || null,
          coordinates: geocoded?.coordinates ?? null,
          recentRainfall: agronomic.recentRainfallLabel,
          forecastRainfall: agronomic.forecastRainfallLabel,
          temperature: agronomic.temperatureLabel,
          humidity: agronomic.humidityLabel,
        }),
      };
      if (
        crop &&
        resolvedCountry &&
        (weatherRelevance === "important" || weatherRelevance === "central")
      ) {
        const weather = await getWeatherDiseaseRisk({
          country: resolvedCountry,
          district: resolvedArea,
          coordinates: geocoded?.coordinates ?? null,
          crop,
          productionSystem: facts.productionSystem,
          recentSymptoms: facts.suspectedIssue || facts.rawText,
        });
        weatherDataAsOf = weather.weatherDataAsOf;
        weatherRisks = weather.alerts.map((alert) => ({
          diseaseOrPest: alert.diseaseOrPest,
          riskLevel: alert.riskLevel,
          riskWindow: alert.riskWindow,
          weatherDrivers: alert.weatherDrivers,
          cropStage: alert.cropStage,
          recommendedChecks: alert.recommendedChecks,
          preventiveActions: alert.preventiveActions,
          confidence: alert.confidence,
          dataSource: alert.dataSource,
          generatedAt: alert.generatedAt,
          disclaimer: alert.disclaimer,
        }));
      }
    } catch (error) {
      weatherDebug = {
        ...weatherDebug,
        providerResult: "failed",
        error:
          error instanceof Error
            ? error.message.slice(0, 180)
            : "weather_provider_failed",
        signals: [],
      };
      retrievedWeatherSignals = [];
      weatherBrief = null;
    }
  }

  if (shouldFetchInputs && crop && country) {
    const inputs = getVerifiedRegionalInputs({
      country,
      crop,
      issue,
      forFarmerDisplay: true,
    });
    productDataAsOf = inputs.productDataAsOf;
    verifiedInputOptions = inputs.options.map((option) => ({
      productType: option.productType,
      activeIngredientOrNutrient: option.activeIngredientOrNutrient,
      verifiedBrands: option.verifiedBrands.map((brand) => ({
        brandName: brand.brandName,
        registrationStatus: brand.registrationStatus,
        availabilityStatus: brand.availabilityStatus,
        officialSource: brand.officialSource,
        lastVerifiedAt: brand.lastVerifiedAt,
        labelRestrictions: brand.labelRestrictions,
        whyConsidered: brand.whyConsidered,
        agronomistConfirmationRequired: brand.agronomistConfirmationRequired,
      })),
      registrationStatus: option.registrationStatus,
      availabilityStatus: option.availabilityStatus,
      labelRestrictions: option.labelRestrictions,
      officialSource: option.officialSource,
      lastVerifiedAt: option.lastVerifiedAt,
      agronomistConfirmationRequired: option.agronomistConfirmationRequired,
    }));

    if (
      facts.asksForProducts &&
      verifiedInputOptions.length === 0 &&
      isGuidanceStage(payload.stage)
    ) {
      payload = {
        ...payload,
        preliminaryAssessment: `${payload.preliminaryAssessment} ${NO_VERIFIED_PRODUCT_MESSAGE}`,
      };
    }
  }

  if (
    research?.pesticideAnswer &&
    (classifyPesticideQuery(facts.rawText).isBroadList ||
      classifyPesticideQuery(facts.rawText).wantsFullList ||
      isGenericRegulatoryRefusal(payload.preliminaryAssessment))
  ) {
    payload = {
      ...payload,
      preliminaryAssessment: applyPesticideAnswerToText({
        currentText: payload.preliminaryAssessment,
        answer: research.pesticideAnswer,
      }),
      nextQuestion: isGenericRegulatoryRefusal(payload.nextQuestion)
        ? ""
        : payload.nextQuestion,
    };
  } else if (research?.pesticideChecks.some((item) => !item.verified && item.farmerNote)) {
    const note = research.pesticideChecks[0]?.farmerNote;
    if (note && !payload.preliminaryAssessment.includes(note)) {
      payload = {
        ...payload,
        preliminaryAssessment: `${payload.preliminaryAssessment}\n\n${note}`,
      };
    }
  } else if (research?.pesticideChecks[0] && !research.pesticideChecks[0].verified) {
    payload = {
      ...payload,
      preliminaryAssessment: sanitizeUnverifiedPesticideClaims(
        payload.preliminaryAssessment,
        {
          country: research.pesticideChecks[0].country || country || "your country",
          activeIngredient: research.pesticideChecks[0].activeIngredient,
          tradeName: research.pesticideChecks[0].tradeName,
          verified: false,
          status: "unverified",
          localTradeNames: [],
          sourceName: research.pesticideChecks[0].sourceName,
          sourceUrl: research.pesticideChecks[0].sourceUrl,
          lastVerifiedAt: null,
          farmerMessage: research.pesticideChecks[0].farmerNote,
        },
      ),
    };
  }

  const market = research?.marketNotes[0];
  if (market?.priceText) {
    const marketLine = `${market.sourceName} reports a ${market.priceType} figure of ${market.priceText}. This is not assumed to be a farmgate price.`;
    if (!payload.preliminaryAssessment.includes(market.priceText)) {
      payload = {
        ...payload,
        preliminaryAssessment: `${payload.preliminaryAssessment}\n\n${marketLine}`,
      };
    }
  }

  if (research?.farmerFallback && !payload.preliminaryAssessment.includes(research.farmerFallback)) {
    payload = {
      ...payload,
      preliminaryAssessment: `${payload.preliminaryAssessment}\n\n${research.farmerFallback}`,
    };
  }

  if (weatherRelevance === "central" && weatherRisks.length > 0) {
    const top = weatherRisks[0];
    for (const check of top.recommendedChecks.slice(0, 2)) {
      if (!payload.checksToday.includes(check)) {
        payload.checksToday = [...payload.checksToday, check];
      }
    }
  }

  const citations = research?.citations ?? [];
  const webSources =
    research?.pesticideAnswer?.sources && research.pesticideAnswer.sources.length > 0
      ? enrichCitations(research.pesticideAnswer.sources)
      : citations.length > 0
        ? enrichCitations(citations.map(citationToUiSource))
        : payload.webSources ?? [];

  payload = {
    ...payload,
    preliminaryAssessment:
      research?.pesticideAnswer &&
      (classifyPesticideQuery(facts.rawText).isBroadList ||
        classifyPesticideQuery(facts.rawText).wantsFullList)
        ? payload.preliminaryAssessment
        : stripCitedSourceNames(payload.preliminaryAssessment, webSources),
  };

  return {
    payload: {
      ...payload,
      regionalContext: emptyRegionalContext({
        country: resolvedCountry || country || null,
        district: resolvedArea,
        productDataAsOf,
        weatherDataAsOf,
      }),
      weatherRisks:
        weatherRelevance === "omit" ||
        weatherRelevance === "none" ||
        weatherRelevance === "supporting"
          ? []
          : weatherRisks,
      verifiedInputOptions,
      webCitations: citations,
      pesticideChecks: research?.pesticideChecks ?? [],
      researchUsed: Boolean(research?.used),
      researchFailed: Boolean(research?.failure),
      weatherRelevance,
      weatherBrief,
      webSources,
      sourceVerificationLine:
        research?.pesticideAnswer?.verificationLine ??
        sourceVerificationLine(webSources, country || facts.country),
      sourcesCollapsed: true,
      farmerLevel: facts.farmerLevel,
    },
    weatherDebug,
    retrievedWeatherSignals,
  };
}

function assistantPayloadFromText(options: {
  text: string;
  intent: string;
  questionCategory?: string;
  calculationType?: string | null;
  nextQuestion?: string;
  country?: string | null;
  district?: string | null;
}): AgronomicCasePayload {
  return {
    mode: "quick_help",
    stage: "assessment",
    questionId: "",
    questionType: "",
    nextQuestion: options.nextQuestion ?? "",
    quickReplies: [],
    preliminaryAssessment: options.text,
    severity: "unknown",
    checksToday: [],
    safeActionsNow: [],
    actionsToAvoid: [],
    photoRecommended: false,
    escalationRecommended: false,
    regionalContext: emptyRegionalContext({
      country: options.country ?? null,
      district: options.district ?? null,
    }),
    weatherRisks: [],
    verifiedInputOptions: [],
    internalMissingInformation: [],
    intent: options.intent,
    questionCategory: options.questionCategory ?? options.intent,
    calculationType: options.calculationType ?? null,
    webCitations: [],
    rankedCauses: [],
    pesticideChecks: [],
    researchUsed: false,
    researchFailed: false,
    askCountry: false,
    weatherRelevance: "omit",
    weatherBrief: null,
    webSources: [],
    likelyCauses: [],
    diagnosisWhy: null,
    whatWouldChangeDiagnosis: [],
    monitorNext: null,
    farmerLevel: null,
    sourceVerificationLine: null,
    sourcesCollapsed: true,
  };
}

function attachIntent(
  payload: AgronomicCasePayload,
  turn: ReturnType<typeof resolveTurnContext>,
): AgronomicCasePayload {
  const sanitizedAssessment = sanitizeFarmerFacingText(
    payload.preliminaryAssessment,
    turn.allowedCrops,
  );
  const sanitizedQuestion = sanitizeFarmerFacingText(
    payload.nextQuestion,
    turn.allowedCrops,
  );
  const sanitizedChecks = payload.checksToday.map((item) =>
    sanitizeFarmerFacingText(item, turn.allowedCrops),
  );
  const sanitizedActions = payload.safeActionsNow.map((item) =>
    sanitizeFarmerFacingText(item, turn.allowedCrops),
  );
  return applyOutputGuard(
    {
      ...payload,
      preliminaryAssessment: sanitizedAssessment,
      nextQuestion: sanitizedQuestion,
      checksToday: sanitizedChecks,
      safeActionsNow: sanitizedActions,
      intent: turn.classified.intent,
      questionCategory: turn.classified.questionCategory,
      calculationType: turn.classified.calculationType,
      weatherRelevance: payload.weatherRelevance ?? "omit",
      weatherBrief: payload.weatherBrief ?? null,
      webSources: payload.webSources ?? [],
      likelyCauses: payload.likelyCauses ?? [],
      diagnosisWhy: payload.diagnosisWhy ?? null,
      whatWouldChangeDiagnosis: payload.whatWouldChangeDiagnosis ?? [],
      monitorNext: payload.monitorNext ?? null,
      farmerLevel: payload.farmerLevel ?? turn.knownFacts.farmerLevel,
      sourceVerificationLine: payload.sourceVerificationLine ?? null,
      sourcesCollapsed: payload.sourcesCollapsed ?? true,
    },
    {
      userMessage: turn.knownFacts.rawText,
      crop: turn.knownFacts.crop,
      allowedCrops: turn.allowedCrops,
    },
  );
}

/**
 * Runs one Agronomic Case Engine turn via the OpenAI Responses API.
 */
export async function runAgronomicCase(options: {
  message: string;
  history?: CaseChatMessage[];
  previousResponseId?: string | null;
  mode?: CaseMode;
  profile?: CaseProfileContext | null;
  images?: CaseImageInput[];
  apiKey?: string | undefined;
  activeCase?: CaseActiveContext | null;
  /** Injected for automated tests — bypasses the network. */
  createResponse?: (
    params: Record<string, unknown>,
  ) => Promise<CaseModelResponse>;
  /** Skip live tool calls in unit tests when tools are asserted separately. */
    skipRegionalTools?: boolean;
  researchFn?: (options: {
    message: string;
    country?: string | null;
    crop?: string | null;
    issue?: string | null;
    intent?: IntentCategory | null;
  }) => Promise<WebResearchResult>;
}): Promise<AgronomicCaseResult> {
  const model = getOpenAIModel();
  const message = options.message.trim();
  const mode: CaseMode = options.mode ?? "quick_help";
  const images = (options.images ?? []).slice(0, 3);

  if (!message && images.length === 0) {
    return {
      ok: false,
      error: "Please type your farming question first.",
      status: 400,
      diagnosticCode: "INVALID_REQUEST",
      model,
      requestCompleted: false,
    };
  }

  const rawMessage =
    message ||
    "Please assess the uploaded crop photo(s). State only what you can observe.";
  const reference = resolveConversationReference({
    message: rawMessage,
    history: options.history ?? [],
  });
  const effectiveMessage = reference.isReference ? reference.resolvedMessage : rawMessage;

  // Mode switch via quick reply.
  const effectiveMode: CaseMode =
    /start full crop check/i.test(effectiveMessage) ? "full_crop_check" : mode;

  const turn = summarizeKnownFacts(
    options.history ?? [],
    effectiveMessage,
    options.profile,
    options.activeCase,
  );
  const classified = turn.classified;
  const history = (
    turn.resetHistory
      ? []
      : sliceHistoryForCurrentIntent(options.history ?? [], classified.intent)
  ).slice(-24);
  const previousResponseId = turn.resetHistory
    ? null
    : options.previousResponseId?.trim() || null;
  const questionsAskedBeforeThisTurn = countPriorAssistantQuestions(history);
  const knownFacts = turn.knownFacts;

  if (isCalculationIntent(classified.intent) || classified.calculationType) {
    const calc = tryFarmerCalculation(effectiveMessage);
    if (calc.handled) {
      const text = formatCalculationReply(calc);
      const payload = attachIntent(
        assistantPayloadFromText({
          text,
          intent: classified.intent,
          questionCategory: classified.questionCategory,
          calculationType: calc.handled ? calc.calculationType : classified.calculationType,
          country: knownFacts.country,
          district: knownFacts.district,
        }),
        turn,
      );
      return {
        ok: true,
        case: payload,
        responseId: `calc_${Date.now()}`,
        model: "farmer-calculator",
        diagnosticCode: "AI_READY",
        requestCompleted: true,
        questionsAsked: 0,
      };
    }
  }

  if (classified.intent === "cashflow" || classified.intent === "farm_business") {
    const cash = buildCashflowTurn({
      message: effectiveMessage,
      history,
    });
    const payload = attachIntent(
      assistantPayloadFromText({
        text: cash.farmerText,
        intent: "cashflow",
        questionCategory: "cashflow",
        nextQuestion: "",
        country: knownFacts.country,
        district: knownFacts.district,
      }),
      turn,
    );
    return {
      ok: true,
      case: payload,
      responseId: `cashflow_${Date.now()}`,
      model: "farmer-cashflow",
      diagnosticCode: "AI_READY",
      requestCompleted: true,
      questionsAsked: cash.missingField ? 1 : 0,
    };
  }

  const photoAlreadyRequested = historyAlreadyRequestedPhoto(history);

  const researchTopics = detectResearchTopics({
    message: effectiveMessage,
    intent: classified.intent,
    asksForProducts: knownFacts.asksForProducts,
    asksAboutWeather: knownFacts.asksAboutWeather,
  });
  const previousState = options.activeCase?.cropHealthState ?? null;
  const turnEvidence = extractObservedEvidence({
    facts: knownFacts,
    text: knownFacts.rawText || effectiveMessage,
    photoFindings: previousState?.photoFindings,
  });
  const turnMode = agronomicModeFor({ evidence: turnEvidence, facts: knownFacts });
  let rankedCauses: ReturnType<typeof rankDiagnosticCauses> = isDiagnosticIntent(classified.intent)
    ? gateRankedCausesForTurn({
        ranked: rankDiagnosticCauses(knownFacts.rawText || effectiveMessage, {
          crop: knownFacts.crop,
          facts: knownFacts,
          evidence: turnEvidence,
        }),
        evidence: turnEvidence,
        facts: knownFacts,
        state: previousState,
        stage: "prompt",
      })
    : [];

  const researchNeed = classifyResearchNeed({
    message: effectiveMessage,
    intent: classified.intent,
  });
  const askForCountry =
    shouldAskCountry({
      country: knownFacts.country,
      intent: classified.intent,
      asksForProducts: knownFacts.asksForProducts,
      asksAboutWeather: knownFacts.asksAboutWeather,
      researchNeed,
    }) ||
    Boolean(
      countryPromptIfNeeded({
        country: knownFacts.country,
        topics: researchTopics,
      }),
    );

  let research: ResearchResult | null = null;
  if (!options.skipRegionalTools && shouldRunWebResearch(researchTopics)) {
    const correlationId = newCorrelationId();
    research = await runCountryResearch({
      message: effectiveMessage,
      country: knownFacts.country,
      crop: knownFacts.crop,
      pestOrDisease: knownFacts.suspectedIssue,
      topics: researchTopics,
    });
    const event = recordWebResearchEvent({
      country: knownFacts.country,
      topics: researchTopics,
      used: research.used,
      failed: Boolean(research.failure),
      staleWarnings: research.staleWarnings.length,
      sourceNames: research.citations.map((item) => item.sourceName),
      correlationId,
    });
    void persistWebResearchEvent(event);
    if (research.failure) {
      logOps("web_research_failure", {
        route: "agronomy/runCase",
        stage: research.failure.stage,
        externalService: "web_search",
        errorType: research.failure.errorType,
        correlationId,
      });
      logStageFailure({
        correlationId,
        route: "agronomy/runCase",
        stage: research.failure.stage,
        externalService: "web_search",
        errorType: research.failure.errorType,
        message: research.failure.message,
      });
    }
  }

  let injectedResearch: WebResearchResult | null = null;
  if (options.researchFn) {
    injectedResearch = await options.researchFn({
      message: effectiveMessage,
      country: knownFacts.country,
      crop: knownFacts.crop,
      issue: knownFacts.suspectedIssue,
      intent: classified.intent,
    });
  }

  const pesticideQuery = classifyPesticideQuery(effectiveMessage);
  if (
    research?.pesticideAnswer &&
    (pesticideQuery.isBroadList ||
      pesticideQuery.wantsFullList ||
      reference.isReference ||
      pesticideQuery.kind === "broad_list" ||
      pesticideQuery.kind === "full_register")
  ) {
    const base = attachIntent(
      assistantPayloadFromText({
        text: research.pesticideAnswer.farmerText,
        intent:
          classified.intent === "other" ? "general_agriculture" : classified.intent,
        questionCategory: classified.questionCategory,
        country: knownFacts.country,
        district: knownFacts.district,
      }),
      turn,
    );
    const enriched = await enrichWithRegionalTools(
      base,
      knownFacts,
      research,
      classified.intent,
    );
    logWeatherDebug(enriched.weatherDebug);
    const payload = applyOutputGuard(enriched.payload, {
      userMessage: knownFacts.rawText,
      crop: knownFacts.crop,
      allowedCrops: turn.allowedCrops,
    });
    return {
      ok: true,
      case: payload,
      responseId: `pesticide_${Date.now()}`,
      model: "farmer-pesticide-research",
      diagnosticCode: "AI_READY",
      requestCompleted: true,
      questionsAsked: 0,
      weatherDebug: enriched.weatherDebug,
    };
  }

  const weatherRelevance = weatherRelevanceFor(knownFacts, classified.intent);

  const createResponse: (
    params: Record<string, unknown>,
  ) => Promise<CaseModelResponse> =
    options.createResponse ??
    (async (params) => {
      const openai = tryCreateOpenAIClient(options.apiKey);
      if (!openai.ok) {
        const diagnosticCode: AiDiagnosticCode =
          openai.reason === "OPENAI_KEY_MISSING" ||
          openai.reason === "OPENAI_KEY_FORMAT_INVALID"
            ? "OPENAI_KEY_MISSING"
            : "OPENAI_REQUEST_FAILED";
        logReason(diagnosticCode);
        const err = new Error(openai.error) as Error & {
          diagnosticCode: AiDiagnosticCode;
          status: number;
        };
        err.diagnosticCode = diagnosticCode;
        err.status = 503;
        throw err;
      }

      const response = (await openai.client.responses.create({
        ...(params as object),
        stream: false,
      } as Parameters<typeof openai.client.responses.create>[0])) as CaseModelResponse;

      return {
        id: response.id,
        model: response.model,
        output_text: response.output_text,
      };
    });

  const farmerContext = mergeFarmerContext(
    farmerContextFromText(
      `${history.map((item) => item.content).join("\n")}\n${effectiveMessage}`,
      options.profile,
    ),
    farmerContextFromText(effectiveMessage, options.profile),
  );
  if (knownFacts.country) {
    farmerContext.country = {
      value: knownFacts.country,
      confidence: farmerContext.country.confidence ?? "inferred",
    };
  }
  if (knownFacts.district) {
    farmerContext.region = {
      value: knownFacts.district,
      confidence: farmerContext.region.confidence ?? "inferred",
    };
  }
  if (knownFacts.farmerLevel) {
    farmerContext.farmerLevel = {
      value: knownFacts.farmerLevel,
      confidence: farmerContext.farmerLevel.confidence ?? "inferred",
    };
  }
  if (!turn.resetHistory && options.activeCase?.farmerProblemText) {
    const recurring = knownFacts.suspectedIssue || knownFacts.problemCategory;
    if (recurring) {
      farmerContext.commonRecurringIssues = [
        ...new Set([...farmerContext.commonRecurringIssues, recurring]),
      ];
    }
  }

  const instructions = buildCaseSystemInstructions({
    mode: effectiveMode,
    questionsAskedBeforeThisTurn,
    knownFactsSummary: knownFactsSummary(knownFacts),
    farmerContextSummary: farmerContextSummary(farmerContext),
    farmerLevel: knownFacts.farmerLevel,
    hasImages: images.length > 0,
    intent: classified.intent,
    cropLock: cropLockInstruction({
      crop: knownFacts.crop,
      allowedCrops: turn.allowedCrops,
      askForCrop: turn.askForCrop,
    }),
    askForCrop: turn.askForCrop,
    askForCountry,
    answerShape: `${modeAnswerGuide(turnMode)}\n\n${answerShapeForIntent(classified.intent, turnMode, {
      asksForSpray: knownFacts.asksForProducts,
    })}`,
    relevance: relevanceInstructions(
      rankTurnContext({
        intent: classified.intent,
        message: effectiveMessage,
        hasPhotos: images.length > 0,
        country: knownFacts.country,
        weatherAttached: weatherRelevance !== "omit",
        webResearchUsed: Boolean(research?.used),
      }),
    ),
    rankedCauses: rankedCausesForPrompt(rankedCauses, {
      observedPest: turnEvidence.observedPestLabel,
    }),
    researchNotes: [
      research ? researchNotesForPrompt(research) : "",
      isDiagnosticIntent(classified.intent)
        ? countryKnowledgeNotesForPrompt(
            countryKnowledgeHooks({
              country: knownFacts.country,
              purpose: knownFacts.asksForProducts
                ? "pesticide_registration"
                : "agronomic_guidance",
              crop: knownFacts.crop,
              pestOrDisease: knownFacts.suspectedIssue,
            }),
          )
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    photoAlreadyRequested,
  });

  const textFormat = {
    format: {
      type: "json_schema" as const,
      name: "agronomic_case_response",
      strict: true,
      schema: CASE_RESPONSE_JSON_SCHEMA as unknown as Record<string, unknown>,
    },
  };

  const turnContext = [
    `Farmer mode: ${effectiveMode}.`,
    `Intent: ${classified.intent}.`,
    `Follow-up questions already asked: ${questionsAskedBeforeThisTurn}.`,
    effectiveMode === "quick_help"
      ? "Answer now if you safely can. Ask one follow-up only if it would change the advice. If three follow-ups were already asked, give useful guidance now."
      : "Full crop check may continue collecting history one question at a time.",
    images.length > 0
      ? `Farmer attached ${images.length} photo(s). Describe only observable features. If blurry, distant, missing leaf underside, or missing root/stem base, say so and request a better photo.`
      : "No photo attached on this turn.",
    `Farmer message: ${effectiveMessage}`,
    reference.isReference
      ? `The farmer is asking about "${reference.referent}" from your previous message. Answer that directly. Do not ask them to clarify.`
      : "",
    cropLockInstruction({
      crop: knownFacts.crop,
      allowedCrops: turn.allowedCrops,
      askForCrop: turn.askForCrop,
    }),
    rankedCausesForPrompt(rankedCauses, {
      observedPest: turnEvidence.observedPestLabel,
    }),
    research ? researchNotesForPrompt(research) : "",
    askForCountry
      ? 'Country is required for this local question. Ask: "What country are you farming in?" Give general agronomy only until the country is known. Do not use Trinidad information for another country.'
      : "",
    weatherRelevance === "omit" || weatherRelevance === "none"
      ? "WEATHER GATE: Weather is not central to this question. Do not make weather or disease-pressure the main answer. Do not mention tomato early blight, late blight, or whitefly pressure unless the farmer named tomato and those pests."
      : weatherRelevance === "supporting"
        ? "WEATHER GATE: Weather is supporting context only. Answer the farmer's crop question first. You may add one short weather sentence at the end. Do not emit a 72-hour disease-pressure card. Do not mention tomato diseases unless the active crop is tomato."
        : weatherRelevance === "important"
          ? "WEATHER GATE: Weather materially affects this crop problem. Keep the crop diagnosis first, then explain the weather-linked risk for THIS crop and symptom only."
        : "WEATHER GATE: Weather or spray/plant timing is central. Prioritise the forecast in your answer.",
    "Never invent weather, registrations, prices, or product availability. Weather, if attached later, is supporting context only — never the lead of the answer.",
  ]
    .filter(Boolean)
    .join("\n");

  const userContent = buildUserContent(turnContext, images);

  const baseParams: Record<string, unknown> = {
    model,
    instructions,
    temperature: 0.3,
    max_output_tokens: Math.max(
      2800,
      responseTokenBudget({
        intent: classified.intent,
        farmerLevel: knownFacts.farmerLevel,
        diagnostic: isDiagnosticIntent(classified.intent),
      }),
    ),
    store: true,
    text: textFormat,
  };

  if (previousResponseId && images.length === 0) {
    baseParams.previous_response_id = previousResponseId;
    baseParams.input = [{ role: "user", content: userContent }];
  } else {
    baseParams.input = [
      ...history.map((item) => ({
        role: item.role,
        content: item.content,
      })),
      { role: "user" as const, content: userContent },
    ];
  }

  try {
    let response: CaseModelResponse;

    try {
      response = await createResponse(baseParams);
    } catch (error) {
      if (
        previousResponseId &&
        history.length > 0 &&
        error instanceof OpenAI.BadRequestError
      ) {
        const retryParams: Record<string, unknown> = {
          ...baseParams,
          previous_response_id: undefined,
          input: [
            ...history.map((item) => ({
              role: item.role,
              content: item.content,
            })),
            { role: "user" as const, content: userContent },
          ],
        };
        delete retryParams.previous_response_id;
        response = await createResponse(retryParams);
      } else {
        throw error;
      }
    }

    const rawText = response.output_text?.trim() ?? "";
    if (!rawText) {
      logReason("OPENAI_REQUEST_FAILED", { model, empty: true });
      return {
        ok: false,
        error: "The case engine returned an empty reply. Please try again.",
        status: 502,
        diagnosticCode: "OPENAI_REQUEST_FAILED",
        model: response.model || model,
        requestCompleted: true,
      };
    }

    let parsed: AgronomicCasePayload;
    let weatherDebug = emptyWeatherDebug({
      resolvedLocation: {
        country: knownFacts.country,
        farmingArea: knownFacts.district,
        coordinates: null,
      },
      providerResult: options.skipRegionalTools ? "skipped" : "skipped",
    });
    let retrievedWeatherSignals: AgronomicWeatherSignal[] = [];
    try {
      const safetyOptions = {
        mode: effectiveMode,
        questionsAskedBeforeThisTurn,
        knownFacts,
        intent: classified.intent,
        askForCrop: turn.askForCrop,
        researchNeed,
        askForCountry,
        photoAlreadyRequested,
        hasImages: images.length > 0,
      };
      const applyPlaybookAndGuards = (payload: AgronomicCasePayload) => {
        let next = attachIntent(
          {
            ...payload,
            rawModelCauses: collectRawModelCauses(payload),
          },
          turn,
        );
        next = applyDiagnosticPlaybook(next, {
          facts: knownFacts,
          farmerLevel: knownFacts.farmerLevel,
          intent: classified.intent,
          askForCrop: turn.askForCrop,
          researchNeed,
        });
        next.farmerLevel = knownFacts.farmerLevel;
        next.askCountry = askForCountry;
        next.askFarmingArea = shouldAskFarmingArea({
          farmingArea: knownFacts.district,
          district: knownFacts.district,
          country: knownFacts.country,
          weatherNeeded: weatherRelevance !== "omit" && weatherRelevance !== "none",
          weatherIsCentral: weatherRelevance === "central",
        });
        next.weatherRelevance = weatherRelevance;
        // Safety last so the playbook cannot re-enable a generic photo ask.
        return applyCommercialSafetyGuards(next, safetyOptions);
      };
      const shapePayload = (text: string) =>
        applyPlaybookAndGuards(parseCasePayload(extractJsonObject(text)));

      parsed = shapePayload(rawText);
      if (needsDiagnosisRewrite(parsed, { intent: classified.intent, facts: knownFacts })) {
        try {
          const rewriteResponse = await createResponse({
            ...baseParams,
            previous_response_id: undefined,
            instructions: `${String(baseParams.instructions ?? "")}\n\n${THIN_REWRITE_INSTRUCTION}`,
            input: [
              ...(Array.isArray(baseParams.input)
                ? (baseParams.input as Array<Record<string, unknown>>)
                : []),
              { role: "assistant", content: rawText },
              { role: "user", content: THIN_REWRITE_INSTRUCTION },
            ],
          });
          const rewriteText = rewriteResponse.output_text?.trim();
          if (rewriteText) {
            parsed = shapePayload(rewriteText);
            response = rewriteResponse;
          }
        } catch {
          // Keep the first shaped answer if the improvement pass fails.
        }
        if (needsDiagnosisRewrite(parsed, { intent: classified.intent, facts: knownFacts })) {
          parsed = applyPlaybookAndGuards(parsed);
        }
      }
      const allowTools =
        !options.skipRegionalTools &&
        (Boolean(knownFacts.crop) ||
          Boolean(research?.used) ||
          (weatherRelevance !== "omit" && weatherRelevance !== "none") ||
          knownFacts.asksAboutWeather) &&
        (isDiagnosticIntent(classified.intent) ||
          classified.intent === "market" ||
          knownFacts.asksForProducts ||
          knownFacts.asksForPesticideRegistration ||
          knownFacts.asksForMarket ||
          knownFacts.asksAboutWeather ||
          (weatherRelevance !== "omit" && weatherRelevance !== "none"));

      if (allowTools || research?.used) {
        const enriched = await enrichWithRegionalTools(
          parsed,
          knownFacts,
          research,
          classified.intent,
        );
        parsed = applyOutputGuard(enriched.payload, {
          userMessage: knownFacts.rawText,
          crop: knownFacts.crop,
          allowedCrops: turn.allowedCrops,
        });
        weatherDebug = enriched.weatherDebug;
        retrievedWeatherSignals = enriched.retrievedWeatherSignals;
        if (retrievedWeatherSignals.length > 0 && isDiagnosticIntent(classified.intent)) {
          const evidenceWithWeather = extractObservedEvidence({
            facts: knownFacts,
            text: knownFacts.rawText || effectiveMessage,
            weatherSignals: retrievedWeatherSignals,
            photoFindings: previousState?.photoFindings,
          });
          rankedCauses.splice(
            0,
            rankedCauses.length,
            ...gateRankedCausesForTurn({
              ranked: rankDiagnosticCauses(knownFacts.rawText || effectiveMessage, {
                crop: knownFacts.crop,
                facts: knownFacts,
                evidence: evidenceWithWeather,
              }),
              evidence: evidenceWithWeather,
              facts: knownFacts,
              state: previousState,
              stage: "prompt",
            }),
          );
        }
      } else {
        const webSources = enrichCitations(
          research?.pesticideAnswer?.sources?.length
            ? research.pesticideAnswer.sources
            : (research?.citations ?? []).map(citationToUiSource),
        );
        parsed = applyOutputGuard(
          {
            ...parsed,
            regionalContext: emptyRegionalContext({
              country: knownFacts.country,
              district: knownFacts.district,
            }),
            weatherRelevance,
            weatherBrief: parsed.weatherBrief ?? null,
            webSources,
            sourceVerificationLine:
              research?.pesticideAnswer?.verificationLine ??
              sourceVerificationLine(webSources, knownFacts.country),
            sourcesCollapsed: true,
            farmerLevel: knownFacts.farmerLevel,
          },
          {
            userMessage: knownFacts.rawText,
            crop: knownFacts.crop,
            allowedCrops: turn.allowedCrops,
          },
        );
        if (research?.pesticideAnswer) {
          parsed = {
            ...parsed,
            preliminaryAssessment: applyPesticideAnswerToText({
              currentText: parsed.preliminaryAssessment,
              answer: research.pesticideAnswer,
            }),
          };
        } else if (injectedResearch?.pesticide && !injectedResearch.pesticide.verified) {
          parsed = {
            ...parsed,
            preliminaryAssessment: sanitizeUnverifiedPesticideClaims(
              parsed.preliminaryAssessment,
              injectedResearch.pesticide,
            ),
          };
        }
        parsed = {
          ...parsed,
          preliminaryAssessment: research?.pesticideAnswer
            ? parsed.preliminaryAssessment
            : stripCitedSourceNames(parsed.preliminaryAssessment, webSources),
        };
      }
    } catch (parseError) {
      logReason("OPENAI_REQUEST_FAILED", {
        model,
        parseFailed: true,
        errorMessage: sanitizeErrorMessage(
          parseError instanceof Error ? parseError.message : "parse error",
        ),
      });
      return {
        ok: false,
        error: "The case engine returned an unreadable structured reply.",
        status: 502,
        diagnosticCode: "OPENAI_REQUEST_FAILED",
        model: response.model || model,
        requestCompleted: true,
      };
    }

    const questionsAsked =
      questionsAskedBeforeThisTurn +
      (parsed.nextQuestion &&
      (parsed.stage === "intake" || parsed.stage === "questioning")
        ? 1
        : 0);

    const weatherSignals = [
      ...new Set([...turnEvidence.weatherSignals, ...retrievedWeatherSignals]),
    ];
    const corrected = applyQualityCorrection(
      applyOutputGuard(parsed, {
        userMessage: knownFacts.rawText,
        crop: knownFacts.crop,
        allowedCrops: turn.allowedCrops,
      }),
      {
        facts: knownFacts,
        weatherSignals,
        ranked: rankedCauses,
        hasPhotos: images.length > 0,
        previousState,
      },
    );
    const attached = attachCropHealthState(
      corrected,
      knownFacts,
      images.length > 0,
      photoAlreadyRequested,
      previousState,
      message,
    );
    const farmerFacing = attached.payload;
    const usedRetrievedWeather =
      weatherDebug.providerResult === "success" &&
      retrievedWeatherSignals.length > 0 &&
      Boolean(
        (farmerFacing.weatherBrief &&
          (farmerFacing.weatherRelevance === "important" ||
            farmerFacing.weatherRelevance === "central" ||
            farmerFacing.weatherRelevance === "supporting")) ||
          /\b(wet|humid|rain|leaf-disease|damp)\b/i.test(
            `${farmerFacing.diagnosisWhy ?? ""} ${farmerFacing.preliminaryAssessment}`,
          ),
      );
    weatherDebug = {
      ...weatherDebug,
      materiallyChangedDiagnosis: usedRetrievedWeather,
    };
    logWeatherDebug(weatherDebug);

    return {
      ok: true,
      case: farmerFacing,
      responseId: response.id,
      model: response.model || model,
      diagnosticCode: "AI_READY",
      requestCompleted: true,
      questionsAsked,
      weatherDebug,
      causeDebug: attached.causeDebug,
    };
  } catch (error) {
    const withCode = error as Error & {
      diagnosticCode?: AiDiagnosticCode;
      status?: number;
    };
    if (withCode.diagnosticCode) {
      return {
        ok: false,
        error: withCode.message,
        status: withCode.status ?? 503,
        diagnosticCode: withCode.diagnosticCode,
        model,
        requestCompleted: false,
      };
    }

    const mapped = mapOpenAIFailure(error, model);
    const messageText =
      error instanceof Error ? error.message : "OpenAI request failed.";

    logReason(mapped.diagnosticCode, {
      model,
      errorName: error instanceof Error ? error.name : "Error",
      errorMessage: sanitizeErrorMessage(messageText),
      httpStatus:
        error instanceof OpenAI.APIError ? (error.status ?? null) : null,
    });

    return {
      ok: false,
      error: mapped.error,
      status: mapped.status,
      diagnosticCode: mapped.diagnosticCode,
      model,
      requestCompleted: true,
    };
  }
}
