/**
 * Weather must support the farmer's question — never replace it.
 *
 * central: the question is about weather, spray/plant/harvest timing, rain, heat, or irrigation timing.
 * supporting: disease/water stress is in play and weather may raise pressure — mention briefly at the end.
 * omit: weather is not material (nutrition, market price, yellowing without wet/disease cues, etc.).
 */

import type { IntentCategory } from "@/lib/assistant/intents";
import {
  isBusinessIntent,
  isCalculationIntent,
} from "@/lib/assistant/intents";
import type { KnownFarmerFacts } from "./tomato-protocol";

export type WeatherRelevanceLevel = "omit" | "supporting" | "central";

export type WeatherRelevanceDecision = {
  level: WeatherRelevanceLevel;
  reasons: string[];
};

const CENTRAL_WEATHER_QUESTION =
  /\b(will it rain|is it (going to|gonna) rain|forecast|weather (today|tomorrow|this week)|rain before i spray|before i spray|spray tomorrow|when (can|should) i spray|too (wet|windy) to spray|plant(ing)? (before|after) (the )?rain|harvest(ing)? before (the )?rain|heat (wave|stress)|too hot to (spray|plant|work|harvest)|wind(y)? (for )?(spray|spraying)|irrigation (schedule|timing)|should i water|when (should|do) i irrigat)/i;

const EXPLICIT_WEATHER =
  /\b(weather|forecast|rainfall|rainy|humidity|humid weather|drought|dew point|leaf wetness)\b/i;

const DISEASE_PRESSURE =
  /\b(leaf\s+(spot|spots|blight)|blight|cercospora|mildew|mould|mold|sooty|anthracnose|rust\b|downy|powdery)\b/i;

const WATER_STRESS =
  /\b(waterlog|water-?logged|wet\s+soil|standing water|flood|drainage|overwater|underwater|wilt(ing)? after rain|heavy rain|too (wet|dry))\b/i;

const HEAT_STRESS =
  /\b(heat stress|sun scorch|sunburn|too hot|heat wave|wilting in the (mid)?day)\b/i;

const NUTRITION_WITHOUT_WEATHER =
  /\b(fertilizer|fertiliser|npk|urea|nutrient|deficiency|what (food|feed)|how much fertilizer)\b/i;

const MARKET_OR_PRICE =
  /\b(price|sell(ing)?|wholesale|retail|farmgate|market|how much (should|can) i (sell|charge)|cashflow|cash flow)\b/i;

function sprayTimingQuestion(text: string): boolean {
  return (
    /\b(spray|spraying|fungicide|insecticide|pesticide)\b/i.test(text) &&
    /\b(rain|tomorrow|today|weather|wind|wash off|before i)\b/i.test(text)
  );
}

export function assessWeatherRelevance(options: {
  message: string;
  facts?: Pick<KnownFarmerFacts, "asksAboutWeather" | "rawText" | "suspectedIssue"> | null;
  intent?: IntentCategory | null;
}): WeatherRelevanceDecision {
  const message = options.message.trim();
  const lower = message.toLowerCase();
  const combined = `${message}\n${options.facts?.rawText ?? ""}`;
  const reasons: string[] = [];
  const intent = options.intent ?? null;

  if (intent && (isBusinessIntent(intent) || isCalculationIntent(intent))) {
    return { level: "omit", reasons: ["business_or_calculation"] };
  }
  if (intent === "pricing" || MARKET_OR_PRICE.test(lower)) {
    if (!CENTRAL_WEATHER_QUESTION.test(lower) && !sprayTimingQuestion(lower)) {
      return { level: "omit", reasons: ["market_or_price"] };
    }
  }
  if (intent === "nutrition" || NUTRITION_WITHOUT_WEATHER.test(lower)) {
    if (
      !CENTRAL_WEATHER_QUESTION.test(lower) &&
      !WATER_STRESS.test(lower) &&
      !sprayTimingQuestion(lower)
    ) {
      return { level: "omit", reasons: ["nutrition_not_weather"] };
    }
  }

  if (CENTRAL_WEATHER_QUESTION.test(combined) || sprayTimingQuestion(combined)) {
    reasons.push("timing_or_forecast_question");
    return { level: "central", reasons };
  }

  if (options.facts?.asksAboutWeather && EXPLICIT_WEATHER.test(lower)) {
    reasons.push("farmer_asked_about_weather");
    return { level: "central", reasons };
  }

  if (intent === "weather") {
    reasons.push("weather_intent");
    return { level: "central", reasons };
  }

  if (HEAT_STRESS.test(combined) && !NUTRITION_WITHOUT_WEATHER.test(lower)) {
    reasons.push("heat_stress");
    return { level: "central", reasons };
  }

  if (intent === "irrigation" && /\b(schedule|when|timing|today|tomorrow)\b/i.test(lower)) {
    reasons.push("irrigation_timing");
    return { level: "central", reasons };
  }

  const foliar =
    DISEASE_PRESSURE.test(combined) ||
    options.facts?.suspectedIssue === "foliar fungal disease";
  const water = WATER_STRESS.test(combined);

  if (foliar) {
    reasons.push("disease_pressure");
    return { level: "supporting", reasons };
  }
  if (water) {
    reasons.push("water_stress");
    return { level: "supporting", reasons };
  }

  return { level: "omit", reasons: ["not_material"] };
}

export function shouldInvokeWeatherTool(options: {
  message: string;
  facts?: Pick<KnownFarmerFacts, "asksAboutWeather" | "rawText" | "suspectedIssue"> | null;
  intent?: IntentCategory | null;
}): boolean {
  return assessWeatherRelevance(options).level !== "omit";
}

/** One-line supporting note — never a diagnosis. */
export function formatSupportingWeatherNote(options: {
  wetOrHumid?: boolean;
  heat?: boolean;
  rainLikely?: boolean;
}): string {
  if (options.heat) {
    return "Also, it looks hot over the next few days, so heat stress may increase if plants are already weak.";
  }
  if (options.rainLikely || options.wetOrHumid) {
    return "Also, the next few days are wet/humid, so leaf disease pressure may increase.";
  }
  return "Also, local weather may affect how this problem develops over the next few days.";
}
