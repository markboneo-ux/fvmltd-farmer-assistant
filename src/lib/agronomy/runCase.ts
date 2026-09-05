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
} from "@/lib/assistant/farmer-context";
import {
  isCalculationIntent,
  isDiagnosticIntent,
  type IntentCategory,
} from "@/lib/assistant/intents";
import { applyDiagnosticPlaybook } from "@/lib/agronomy/diagnosis";
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
import { classifyResearchNeed, shouldUseWebResearch } from "@/lib/research/should-research";
import { formatResearchBriefForModel, runWebResearch } from "@/lib/research/run";
import { sanitizeUnverifiedPesticideClaims } from "@/lib/research/pesticides";
import {
  enrichCitations,
  sourceVerificationLine,
  stripCitedSourceNames,
} from "@/lib/research/citations";
import type { WebResearchResult } from "@/lib/research/types";
import { getForecast } from "@/lib/weather/get-forecast";
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
import {
  applyCommercialSafetyGuards,
  countPriorAssistantQuestions,
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
};

export type CaseActiveContext = {
  crop?: string | null;
  conversationIntent?: string | null;
  farmerProblemText?: string | null;
  country?: string | null;
  district?: string | null;
  farmerLevel?: string | null;
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
          country: activeCase.country ?? null,
          district: activeCase.district ?? null,
          farmerLevel: activeCase.farmerLevel ?? null,
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
  if (facts.country) lines.push(`- country/island: ${facts.country}`);
  else lines.push("- country: unknown — do not assume Trinidad and Tobago");
  if (facts.district) lines.push(`- district/region: ${facts.district}`);
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
  if (facts.stuntedWholeField) lines.push("- stunted across whole field: yes");
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

async function enrichWithRegionalTools(
  payload: AgronomicCasePayload,
  facts: KnownFarmerFacts,
  intent?: string | null,
  research?: WebResearchResult | null,
): Promise<AgronomicCasePayload> {
  const country = facts.country?.trim() || "";
  const crop = facts.crop;
  const issue = facts.suspectedIssue || "general crop problem";
  const relevance = weatherRelevanceFor(facts, intent as IntentCategory | null);

  const shouldFetchWeather =
    Boolean(country) && shouldInvokeWeatherTool(facts, intent as IntentCategory | null);
  const shouldFetchInputs =
    Boolean(country) && Boolean(crop) && shouldInvokeProductTool(facts);

  let weatherRisks: WeatherRiskOption[] = [];
  let weatherDataAsOf: string | null = null;
  let productDataAsOf: string | null = null;
  let verifiedInputOptions: VerifiedInputDisplay[] = [];
  let weatherBrief: string | null = payload.weatherBrief ?? null;
  const weatherRelevance: WeatherRelevanceLevel = relevance;

  if (shouldFetchWeather) {
    try {
      const forecast = await getForecast({
        country,
        district: facts.district,
      });
      weatherDataAsOf = forecast.retrievedAt;
      if (relevance === "central") {
        weatherBrief = formatForecastTimingBrief(forecast);
      } else if (relevance === "supporting") {
        weatherBrief = formatSupportingWeatherNote({
          wetOrHumid: forecastLooksWetOrHumid(forecast),
          heat: forecastLooksHot(forecast),
          rainLikely: (forecast.daily[0]?.rainfallMm ?? 0) >= 2,
        });
      }
      if (crop) {
        const weather = await getWeatherDiseaseRisk({
          country,
          district: facts.district,
          crop,
          productionSystem: facts.productionSystem,
          recentSymptoms: facts.suspectedIssue,
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
    } catch {
      // Weather is optional supporting context — never fail the farmer reply.
    }
  }

  if (shouldFetchInputs && crop) {
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

  // Supporting weather must not take over "what to check".
  if (relevance === "central" && weatherRisks.length > 0) {
    const top = weatherRisks[0];
    for (const check of top.recommendedChecks.slice(0, 2)) {
      if (!payload.checksToday.includes(check)) {
        payload.checksToday = [...payload.checksToday, check];
      }
    }
  }

  const webSources = enrichCitations(research?.citations ?? payload.webSources ?? []);
  if (research?.pesticide && !research.pesticide.verified) {
    payload = {
      ...payload,
      preliminaryAssessment: sanitizeUnverifiedPesticideClaims(
        payload.preliminaryAssessment,
        research.pesticide,
      ),
    };
  }

  payload = {
    ...payload,
    preliminaryAssessment: stripCitedSourceNames(payload.preliminaryAssessment, webSources),
  };

  return {
    ...payload,
    regionalContext: emptyRegionalContext({
      country: country || null,
      district: facts.district,
      productDataAsOf,
      weatherDataAsOf,
    }),
    weatherRisks: relevance === "omit" ? [] : weatherRisks,
    verifiedInputOptions,
    weatherRelevance,
    weatherBrief,
    webSources,
    sourceVerificationLine: sourceVerificationLine(webSources, country || facts.country),
    sourcesCollapsed: true,
    farmerLevel: facts.farmerLevel,
  };
}

function assistantPayloadFromText(options: {
  text: string;
  intent: string;
  questionCategory?: string;
  calculationType?: string | null;
  nextQuestion?: string;
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
    regionalContext: emptyRegionalContext(),
    weatherRisks: [],
    verifiedInputOptions: [],
    internalMissingInformation: [],
    intent: options.intent,
    questionCategory: options.questionCategory ?? options.intent,
    calculationType: options.calculationType ?? null,
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
  return {
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
  };
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
  /** Injected web research for tests. */
  researchFn?: typeof runWebResearch;
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

  const effectiveMessage =
    message ||
    "Please assess the uploaded crop photo(s). State only what you can observe.";

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

  const researchNeed = classifyResearchNeed({
    message: effectiveMessage,
    intent: classified.intent,
  });
  const askForCountry = shouldAskCountry({
    country: knownFacts.country,
    intent: classified.intent,
    asksForProducts: knownFacts.asksForProducts,
    asksAboutWeather: knownFacts.asksAboutWeather,
    researchNeed,
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
  });

  const weatherRelevance = weatherRelevanceFor(knownFacts, classified.intent);
  let research: WebResearchResult | null = null;
  if (!options.skipRegionalTools || options.researchFn) {
    if (shouldUseWebResearch({ message: effectiveMessage, intent: classified.intent })) {
      const run = options.researchFn ?? runWebResearch;
      research = await run({
        message: effectiveMessage,
        country: knownFacts.country,
        crop: knownFacts.crop,
        issue: knownFacts.suspectedIssue,
        intent: classified.intent,
      });
    }
  }

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
    cropLockInstruction({
      crop: knownFacts.crop,
      allowedCrops: turn.allowedCrops,
      askForCrop: turn.askForCrop,
    }),
    weatherRelevance === "omit"
      ? "WEATHER GATE: Weather is not central to this question. Do not make weather or disease-pressure the main answer."
      : weatherRelevance === "supporting"
        ? "WEATHER GATE: Weather is supporting context only. Answer the farmer's crop question first. You may add one short weather sentence at the end."
        : "WEATHER GATE: Weather or spray/plant timing is central. Prioritise the forecast in your answer.",
    research ? formatResearchBriefForModel(research) : "No web research was attached for this turn. Do not invent current prices, registrations, or programmes.",
    "Never invent weather conditions or product availability. The server attaches verified weather or product results only when those tools are relevant to this turn.",
  ]
    .filter(Boolean)
    .join("\n");

  const userContent = buildUserContent(turnContext, images);

  const baseParams: Record<string, unknown> = {
    model,
    instructions,
    temperature: 0.3,
    max_output_tokens: responseTokenBudget({
      intent: classified.intent,
      farmerLevel: knownFacts.farmerLevel,
      diagnostic: isDiagnosticIntent(classified.intent),
    }),
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
    try {
      parsed = applyCommercialSafetyGuards(
        parseCasePayload(extractJsonObject(rawText)),
        {
          mode: effectiveMode,
          questionsAskedBeforeThisTurn,
          knownFacts,
          intent: classified.intent,
          askForCrop: turn.askForCrop,
          researchNeed,
        },
      );
      parsed = attachIntent(parsed, turn);
      parsed = applyDiagnosticPlaybook(parsed, {
        facts: knownFacts,
        farmerLevel: knownFacts.farmerLevel,
        intent: classified.intent,
        askForCrop: turn.askForCrop,
        researchNeed,
      });
      parsed.farmerLevel = knownFacts.farmerLevel;

      const allowWeather =
        Boolean(knownFacts.country) &&
        shouldInvokeWeatherTool(knownFacts, classified.intent);
      const allowProducts =
        Boolean(knownFacts.country) &&
        Boolean(knownFacts.crop) &&
        shouldInvokeProductTool(knownFacts);
      const allowTools =
        !options.skipRegionalTools && (allowWeather || allowProducts || Boolean(research));

      if (allowTools) {
        parsed = await enrichWithRegionalTools(
          parsed,
          knownFacts,
          classified.intent,
          research,
        );
      } else {
        const webSources = enrichCitations(research?.citations ?? []);
        parsed = {
          ...parsed,
          regionalContext: emptyRegionalContext({
            country: knownFacts.country,
            district: knownFacts.district,
          }),
          weatherRelevance,
          weatherBrief: null,
          webSources,
          sourceVerificationLine: sourceVerificationLine(webSources, knownFacts.country),
          sourcesCollapsed: true,
          farmerLevel: knownFacts.farmerLevel,
        };
        if (research?.pesticide && !research.pesticide.verified) {
          parsed = {
            ...parsed,
            preliminaryAssessment: sanitizeUnverifiedPesticideClaims(
              parsed.preliminaryAssessment,
              research.pesticide,
            ),
          };
        }
        parsed = {
          ...parsed,
          preliminaryAssessment: stripCitedSourceNames(
            parsed.preliminaryAssessment,
            webSources,
          ),
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

    return {
      ok: true,
      case: parsed,
      responseId: response.id,
      model: response.model || model,
      diagnosticCode: "AI_READY",
      requestCompleted: true,
      questionsAsked,
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
