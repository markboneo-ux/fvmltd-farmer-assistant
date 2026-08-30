import type { KnownFarmerFacts } from "./tomato-protocol";

/**
 * Weather and product catalogues stay available, but must not decorate
 * every generic chat turn.
 */

export function shouldInvokeWeatherTool(facts: KnownFarmerFacts): boolean {
  if (facts.asksAboutWeather) return true;

  const text = facts.rawText.toLowerCase();
  return (
    /\b(weather|forecast|humidity|humid|dew\b|leaf\s+disease|disease\s+pressure|heavy\s+rain|rainfall|rainy)\b/.test(
      text,
    ) ||
    /\bcould this weather\b/.test(text) ||
    /\bwhy am i suddenly seeing more\b/.test(text)
  );
}

export function shouldInvokeProductTool(facts: KnownFarmerFacts): boolean {
  return facts.asksForProducts;
}
