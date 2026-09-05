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
  return weatherToolFromRelevance({
    message: facts.rawText,
    facts,
    intent,
  });
}

export function chemicalManagementRelevant(facts: KnownFarmerFacts): boolean {
  if (facts.asksForProducts) return true;
  return /\b(what (can|should|do) i spray|spray for (this|it|the)|chemical (control|programme|program|to use))\b/i.test(
    facts.rawText,
  );
}

export function shouldInvokeProductTool(facts: KnownFarmerFacts): boolean {
  return chemicalManagementRelevant(facts);
}
