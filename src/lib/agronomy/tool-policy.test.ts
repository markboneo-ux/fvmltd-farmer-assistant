import { describe, expect, it } from "vitest";
import { extractKnownFacts } from "./tomato-protocol";
import { shouldInvokeProductTool, shouldInvokeWeatherTool } from "./tool-policy";

describe("regional tool policy", () => {
  it("does not invoke weather or products for a generic stunt report", () => {
    const facts = extractKnownFacts("Tomatoes stunted");
    expect(shouldInvokeWeatherTool(facts)).toBe(false);
    expect(shouldInvokeProductTool(facts)).toBe(false);
  });

  it("invokes weather risk when the farmer asks about weather", () => {
    const facts = extractKnownFacts("Could this weather cause disease?");
    expect(facts.asksAboutWeather).toBe(true);
    expect(shouldInvokeWeatherTool(facts)).toBe(true);
    expect(shouldInvokeProductTool(facts)).toBe(false);
  });

  it("does not invoke products for an unrelated wilt question", () => {
    const facts = extractKnownFacts("My tomato plants are wilting");
    expect(shouldInvokeProductTool(facts)).toBe(false);
  });

  it("invokes verified products only when the farmer asks what to use", () => {
    const facts = extractKnownFacts(
      "What can I use for this in Trinidad?",
    );
    expect(facts.asksForProducts).toBe(true);
    expect(shouldInvokeProductTool(facts)).toBe(true);
  });
});
