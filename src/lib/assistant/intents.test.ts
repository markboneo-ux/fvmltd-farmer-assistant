import { describe, expect, it } from "vitest";
import {
  classifyFarmerIntent,
  resolveConversationIntent,
  shouldStartNewCase,
} from "./intents";

describe("farmer intent classifier", () => {
  it("classifies a crop problem", () => {
    const result = classifyFarmerIntent("My pepper plants are wilting");
    expect(result.intent).toBe("crop_problem");
    expect(result.caseType).toBe("crop_problem");
  });

  it("classifies cashflow requests", () => {
    expect(classifyFarmerIntent("Help me prepare a cashflow for the bank").intent).toBe(
      "cashflow",
    );
    expect(classifyFarmerIntent("Help me make a cashflow for my farm").intent).toBe(
      "cashflow",
    );
  });

  it("classifies simple farm maths", () => {
    expect(classifyFarmerIntent("How much will 18 bags at $240 cost?").intent).toBe(
      "simple_math",
    );
    expect(
      classifyFarmerIntent("If I sell 1,250 lb at $8 per lb, what is the revenue?").intent,
    ).toBe("simple_math");
    expect(
      classifyFarmerIntent("I harvested 48 bags at 22 kg each, how many kg?").intent,
    ).toBe("simple_math");
  });

  it("classifies fertilizer rate questions as nutrition with a calculation type", () => {
    const result = classifyFarmerIntent("How much fertilizer do I need for 2 acres?");
    expect(result.intent).toBe("nutrition");
    expect(result.calculationType).toBe("fertilizer_rate");
  });

  it("starts a new case when the topic leaves a tomato problem", () => {
    expect(
      shouldStartNewCase({
        message: "Help me make a cashflow for my farm",
        activeCrop: "tomato",
        activeIntent: "crop_problem",
      }),
    ).toBe(true);
    expect(
      shouldStartNewCase({
        message: "My cucumber leaves have spots",
        activeCrop: "tomato",
        activeIntent: "pest_disease",
      }),
    ).toBe(true);
    expect(
      shouldStartNewCase({
        message: "The soil stays wet after watering.",
        activeCrop: "tomato",
        activeIntent: "crop_problem",
      }),
    ).toBe(false);
  });

  it("keeps cashflow answers on the same case", () => {
    expect(
      shouldStartNewCase({
        message: "Hot pepper on 2 acres",
        activeCrop: null,
        activeIntent: "cashflow",
      }),
    ).toBe(false);
    expect(classifyFarmerIntent("Hot pepper on 2 acres").intent).not.toBe("cashflow");
    expect(
      shouldStartNewCase({
        message: "My pepper plants are wilting",
        activeCrop: null,
        activeIntent: "cashflow",
      }),
    ).toBe(true);
  });

  it("inherits cashflow intent while the farmer is answering", () => {
    const turn = resolveConversationIntent({
      message: "Hot pepper on 2 acres",
      activeIntent: "cashflow",
    });
    expect(turn.intent).toBe("cashflow");
  });
});
