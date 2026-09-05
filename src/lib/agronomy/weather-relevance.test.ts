import { describe, expect, it } from "vitest";
import { classifyFarmerIntent } from "@/lib/assistant/intents";
import { extractKnownFacts } from "./tomato-protocol";
import { shouldInvokeWeatherTool } from "./tool-policy";
import {
  assessWeatherRelevance,
  formatSupportingWeatherNote,
} from "./weather-relevance";

describe("weather relevance gate", () => {
  it("does not turn a celery nutrient question into a weather answer", () => {
    const message = "What fertilizer should I use on celery?";
    const facts = extractKnownFacts(message);
    const intent = classifyFarmerIntent(message).intent;
    expect(intent).toBe("nutrition");
    expect(assessWeatherRelevance({ message, facts, intent }).level).toBe("omit");
    expect(shouldInvokeWeatherTool(facts, intent)).toBe(false);
  });

  it("does not attach weather to celery burning", () => {
    const message = "Why is my celery burning?";
    const facts = extractKnownFacts(message);
    const intent = classifyFarmerIntent(message).intent;
    expect(assessWeatherRelevance({ message, facts, intent }).level).toBe("omit");
    expect(shouldInvokeWeatherTool(facts, intent)).toBe(false);
  });

  it("does not attach weather to celery yellowing", () => {
    const message = "My celery leaves are yellowing";
    const facts = extractKnownFacts(message);
    const intent = classifyFarmerIntent(message).intent;
    expect(assessWeatherRelevance({ message, facts, intent }).level).toBe("omit");
    expect(shouldInvokeWeatherTool(facts, intent)).toBe(false);
  });

  it("does not discuss disease weather for a selling-price question", () => {
    const message = "How much should I sell celery for?";
    const facts = extractKnownFacts(message);
    const intent = classifyFarmerIntent(message).intent;
    expect(intent).toBe("pricing");
    expect(assessWeatherRelevance({ message, facts, intent }).level).toBe("omit");
    expect(shouldInvokeWeatherTool(facts, intent)).toBe(false);
  });

  it("prioritises weather when the farmer asks about rain before spraying", () => {
    const message = "Will it rain before I spray tomorrow?";
    const facts = extractKnownFacts(message);
    const intent = classifyFarmerIntent(message).intent;
    expect(assessWeatherRelevance({ message, facts, intent }).level).toBe("central");
    expect(shouldInvokeWeatherTool(facts, intent)).toBe(true);
  });

  it("treats leaf spots after rain as supporting weather, not the main answer", () => {
    const message = "Tomato leaf spots after heavy rain";
    const facts = extractKnownFacts(message);
    expect(assessWeatherRelevance({ message, facts }).level).toBe("supporting");
    expect(formatSupportingWeatherNote({ wetOrHumid: true })).toMatch(/wet\/humid/);
  });
});
