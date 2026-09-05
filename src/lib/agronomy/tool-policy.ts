import type { KnownFarmerFacts } from "./tomato-protocol";

/**
 * Weather and product catalogues stay available, but must not decorate
 * every generic chat turn.
 */

export function shouldInvokeWeatherTool(facts: KnownFarmerFacts): boolean {
  const text = facts.rawText.toLowerCase();
  if (/\bno spots?\b/.test(text) && /\byellow/.test(text) && !facts.asksAboutWeather) {
    return false;
  }

  if (facts.asksAboutWeather) return true;

  const weatherRelevantProblem =
    /\b(leaf\s+(spot|disease|blight)|blight|cercospora|mildew|mould|mold|sooty|humid|humidity|wet\s+soil|waterlog|heavy\s+rain|rainfall|rainy|heat\s+stress|too\s+hot|leaf\s+wet|dew\b)\b/.test(
      text,
    ) || facts.suspectedIssue === "foliar fungal disease";

  return (
    weatherRelevantProblem ||
    /\b(weather|forecast|disease\s+pressure)\b/.test(text) ||
    /\bcould this weather\b/.test(text) ||
    /\bwhy am i suddenly seeing more\b/.test(text)
  );
}

export function shouldInvokeProductTool(facts: KnownFarmerFacts): boolean {
  return facts.asksForProducts;
}
