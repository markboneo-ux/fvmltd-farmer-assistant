import { beforeEach, describe, expect, it } from "vitest";
import { emptyRegionalContext, type AgronomicCasePayload } from "./case-schema";
import { runAgronomicCase } from "./runCase";
import { mentionsTomato } from "@/lib/assistant/crops";
import { resetCatalogueStoreToSeed } from "@/lib/regional-inputs/catalogue";
import { setWeatherProviderForTests } from "@/lib/weather/get-forecast";
import { buildMockHumidRainyForecast } from "@/lib/weather/get-forecast";

function mockCase(
  overrides: Partial<AgronomicCasePayload> = {},
): AgronomicCasePayload {
  return {
    mode: "quick_help",
    stage: "assessment",
    questionId: "",
    questionType: "",
    preliminaryAssessment: "Farmer reported a crop problem.",
    severity: "unknown",
    nextQuestion: "",
    quickReplies: [],
    checksToday: [],
    safeActionsNow: [],
    actionsToAvoid: [],
    photoRecommended: false,
    escalationRecommended: false,
    regionalContext: emptyRegionalContext(),
    weatherRisks: [],
    verifiedInputOptions: [],
    internalMissingInformation: [],
    ...overrides,
  };
}

beforeEach(() => {
  resetCatalogueStoreToSeed();
  setWeatherProviderForTests({
    name: "mock-humid-rainy",
    async getForecast(location) {
      return buildMockHumidRainyForecast(location);
    },
  });
});

describe("general assistant regressions", () => {
  it("cucumber leaf spots do not mention tomato", async () => {
    let captured = "";
    const result = await runAgronomicCase({
      message: "My cucumber leaves have spots",
      skipRegionalTools: true,
      createResponse: async (params) => {
        captured = String(params.instructions) + String(params.input);
        return {
          id: "resp_cuke",
          output_text: JSON.stringify(
            mockCase({
              preliminaryAssessment:
                "Leaf spots on cucumber can come from fungus, water on the leaves, or nutrient stress. Check the underside of a few leaves and whether spots are on a few plants or across the bed.",
              nextQuestion: "Are the spots on a few plants, patches, or most of the crop?",
              checksToday: ["Look at the underside of affected cucumber leaves"],
              safeActionsNow: ["Keep water off the leaves as much as you can today"],
            }),
          ),
        };
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(captured.toLowerCase()).not.toMatch(/crop:\s*tomato/);
    expect(captured.toLowerCase()).not.toMatch(/active crop is tomato/);
    expect(mentionsTomato(result.case.preliminaryAssessment)).toBe(false);
    expect(mentionsTomato(result.case.nextQuestion)).toBe(false);
    expect(result.case.intent).toBe("crop_problem");
  });

  it("strips tomato if the model injects it on a cucumber case", async () => {
    const result = await runAgronomicCase({
      message: "My cucumber leaves have spots",
      skipRegionalTools: true,
      createResponse: async () => ({
        id: "resp_cuke_bad",
        output_text: JSON.stringify(
          mockCase({
            preliminaryAssessment: "This looks like tomato leaf spots.",
            nextQuestion: "Is it tomato or cucumber?",
          }),
        ),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mentionsTomato(result.case.preliminaryAssessment)).toBe(false);
    expect(mentionsTomato(result.case.nextQuestion)).toBe(false);
  });

  it("bag cost question does not mention tomato or start diagnosis", async () => {
    const result = await runAgronomicCase({
      message: "How much will 18 bags at $240 cost?",
      history: [{ role: "user", content: "Tomato whiteflies" }],
      activeCase: { crop: "tomato", conversationIntent: "pest_disease" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.intent).toBe("simple_math");
    expect(result.case.preliminaryAssessment).toMatch(/\$4,320/);
    expect(result.case.checksToday).toEqual([]);
    expect(mentionsTomato(result.case.preliminaryAssessment)).toBe(false);
  });

  it("cashflow request does not mention tomato", async () => {
    const result = await runAgronomicCase({
      message: "Help me make a cashflow for my farm",
      history: [{ role: "user", content: "My tomato plants are stunted" }],
      activeCase: { crop: "tomato", conversationIntent: "crop_problem" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.intent).toBe("cashflow");
    expect(mentionsTomato(result.case.preliminaryAssessment)).toBe(false);
    expect(result.case.checksToday).toEqual([]);
  });

  it("a genuine tomato follow-up keeps tomato context", async () => {
    let captured = "";
    const result = await runAgronomicCase({
      message: "The soil stays wet after watering.",
      history: [{ role: "user", content: "Tomato wilt" }],
      activeCase: { crop: "tomato", conversationIntent: "crop_problem" },
      skipRegionalTools: true,
      createResponse: async (params) => {
        captured = String(params.instructions);
        return {
          id: "resp_tomato_follow",
          output_text: JSON.stringify(
            mockCase({
              preliminaryAssessment:
                "On tomato, soil that stays wet after watering can stress roots and add to wilting. Check drainage before adding fertilizer.",
              nextQuestion: "Are the wet spots in a low part of the field?",
            }),
          ),
        };
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(captured.toLowerCase()).toMatch(/tomato/);
    expect(result.case.preliminaryAssessment.toLowerCase()).toMatch(/tomato/);
  });

  it("resets unrelated history when the farmer changes crop", async () => {
    let capturedHistory = "";
    const result = await runAgronomicCase({
      message: "My cucumber leaves have spots",
      history: [
        { role: "user", content: "Tomato whiteflies" },
        { role: "assistant", content: "Are they on a few plants?" },
      ],
      skipRegionalTools: true,
      createResponse: async (params) => {
        capturedHistory = JSON.stringify(params.input);
        return {
          id: "resp_reset",
          output_text: JSON.stringify(
            mockCase({
              preliminaryAssessment: "Cucumber leaf spots need a close look at the leaf surface.",
            }),
          ),
        };
      },
    });
    expect(result.ok).toBe(true);
    expect(capturedHistory.toLowerCase()).not.toMatch(/tomato whiteflies/);
    expect(capturedHistory).not.toMatch(/"Tomato whiteflies"/);
  });
});
