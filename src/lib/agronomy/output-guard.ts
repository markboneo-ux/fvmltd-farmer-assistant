/**
 * Hard farmer-facing output guard.
 * Tomato, tomato disease models, and product CTAs must not leak into live
 * answers unless the current crop/question actually supports them.
 */

import {
  mentionsTomato,
  stripUnmentionedCrop,
} from "@/lib/assistant/crops";
import type { AgronomicCasePayload, WeatherRelevanceLevel } from "./case-schema";
import type { WeatherRiskOption } from "./case-schema";

export const TOMATO_SPECIFIC_DISEASE =
  /\b(early blight|late blight|tomato yellow leaf curl|tylcv)\b/gi;

const SIMILAR_TOMATO_CASE =
  /\bwe have seen similar tomato(?:es)? (?:cases|reports)\b/gi;

const SIMILAR_ON_TOMATO =
  /\bwe have seen similar reports recently(?: in your area)?(?: on tomato(?:es)?)?\b/gi;

const FOLIAR_TOMATO_COMPLEX =
  /\bfoliar disease complex\s*\([^)]*blight[^)]*\)/gi;

const WHITEFLY_PRESSURE_PHRASE = /\bwhitefly population pressure\b/gi;

const PRODUCT_CTA =
  /\b(ask about products|see products|shop products|browse products)\b/i;

export type TomatoPermitContext = {
  userMessage: string;
  crop: string | null | undefined;
  allowedCrops?: string[];
};

export function tomatoIsPermitted(options: TomatoPermitContext): boolean {
  const crop = options.crop?.trim().toLowerCase() || null;
  if (crop === "tomato") return true;
  if ((options.allowedCrops ?? []).includes("tomato")) return true;
  if (mentionsTomato(options.userMessage)) return true;
  return false;
}

export function isProductCta(text: string): boolean {
  return PRODUCT_CTA.test(text);
}

export function normalizeWeatherRelevance(
  level: WeatherRelevanceLevel | null | undefined,
): WeatherRelevanceLevel {
  if (level === "none") return "omit";
  if (level === "omit" || level === "supporting" || level === "important" || level === "central") {
    return level;
  }
  return "omit";
}

export function shouldRenderWeatherRiskCard(
  level: WeatherRelevanceLevel | null | undefined,
): boolean {
  const normalized = normalizeWeatherRelevance(level);
  return normalized === "important" || normalized === "central";
}

export function isTomatoSpecificWeatherRisk(risk: Pick<WeatherRiskOption, "diseaseOrPest">): boolean {
  const text = risk.diseaseOrPest.toLowerCase();
  return (
    text.includes("early blight") ||
    text.includes("late blight") ||
    text.includes("foliar disease complex") ||
    text.includes("whitefly population")
  );
}

export function stripUnsupportedTomatoContent(
  text: string,
  permitted: boolean,
): string {
  if (!text) return text;
  if (permitted) return text;
  let next = text
    .replace(SIMILAR_TOMATO_CASE, "")
    .replace(SIMILAR_ON_TOMATO, "")
    .replace(FOLIAR_TOMATO_COMPLEX, "leaf disease pressure")
    .replace(TOMATO_SPECIFIC_DISEASE, "leaf disease")
    .replace(WHITEFLY_PRESSURE_PHRASE, "insect pressure");
  next = stripUnmentionedCrop(next, "tomato", []);
  return next.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
}

export function stripProductCtasFromList(items: string[]): string[] {
  return items.filter((item) => !isProductCta(item));
}

export function applyOutputGuard(
  payload: AgronomicCasePayload,
  options: TomatoPermitContext,
): AgronomicCasePayload {
  const permitted = tomatoIsPermitted(options);
  const strip = (value: string) => stripUnsupportedTomatoContent(value, permitted);
  const relevance = normalizeWeatherRelevance(payload.weatherRelevance);

  let weatherRisks = [...(payload.weatherRisks ?? [])];
  if (!permitted) {
    weatherRisks = weatherRisks.filter((risk) => !isTomatoSpecificWeatherRisk(risk));
  }
  if (!shouldRenderWeatherRiskCard(relevance)) {
    weatherRisks = [];
  }

  let weatherBrief = payload.weatherBrief
    ? strip(payload.weatherBrief)
    : payload.weatherBrief;
  if (weatherBrief && !permitted && isTomatoSpecificWeatherRisk({ diseaseOrPest: weatherBrief })) {
    weatherBrief = null;
  }

  const nextQuestion = strip(payload.nextQuestion);
  const assessment = strip(payload.preliminaryAssessment);

  return {
    ...payload,
    preliminaryAssessment: assessment,
    nextQuestion: isProductCta(nextQuestion) ? "" : nextQuestion,
    checksToday: payload.checksToday.map(strip).filter(Boolean),
    safeActionsNow: payload.safeActionsNow.map(strip).filter(Boolean),
    actionsToAvoid: payload.actionsToAvoid.map(strip).filter(Boolean),
    likelyCauses: (payload.likelyCauses ?? []).map(strip).filter(Boolean),
    diagnosisWhy: payload.diagnosisWhy ? strip(payload.diagnosisWhy) : payload.diagnosisWhy,
    admittedCauses: payload.admittedCauses,
    rawModelCauses: payload.rawModelCauses,
    whatWouldChangeDiagnosis: (payload.whatWouldChangeDiagnosis ?? []).map(strip).filter(Boolean),
    monitorNext: payload.monitorNext ? strip(payload.monitorNext) : payload.monitorNext,
    weatherBrief,
    weatherRisks,
    weatherRelevance: relevance,
    quickReplies: stripProductCtasFromList(payload.quickReplies).map(strip),
  };
}

export function similarCaseNoteIsAllowed(options: {
  note: string | null | undefined;
  crop: string | null | undefined;
  userMessage: string;
  allowedCrops?: string[];
}): string | null {
  const note = options.note?.trim() || "";
  if (!note) return null;
  const crop = options.crop?.trim().toLowerCase() || null;
  if (!crop) return null;
  if (!tomatoIsPermitted(options) && (mentionsTomato(note) || /early blight|late blight/i.test(note))) {
    return null;
  }
  if (/\btomato/i.test(note) && crop !== "tomato") {
    return null;
  }
  return note;
}
