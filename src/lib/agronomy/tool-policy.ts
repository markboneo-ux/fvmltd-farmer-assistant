import type { IntentCategory } from "@/lib/assistant/intents";
import type { KnownFarmerFacts } from "./tomato-protocol";
import {
  assessWeatherRelevance,
  shouldInvokeWeatherTool as weatherToolFromRelevance,
  type WeatherRelevanceLevel,
} from "./weather-relevance";

/**
 * Weather and product catalogues stay available, but must not decorate
 * every generic chat turn.
 */
export function weatherRelevanceFor(
  facts: KnownFarmerFacts,
  intent?: IntentCategory | null,
): WeatherRelevanceLevel {
  return assessWeatherRelevance({
    message: facts.rawText,
    facts,
    intent,
  }).level;
}

export function shouldInvokeWeatherTool(
  facts: KnownFarmerFacts,
  intent?: IntentCategory | null,
): boolean {
  const text = facts.rawText.toLowerCase();
  if (/\bno spots?\b/.test(text) && /\byellow/.test(text) && !facts.asksAboutWeather) {
    return false;
  }
  return weatherToolFromRelevance({
    message: facts.rawText,
    facts,
    intent,
  });
}

export function shouldInvokeProductTool(facts: KnownFarmerFacts): boolean {
  return facts.asksForProducts;
}
