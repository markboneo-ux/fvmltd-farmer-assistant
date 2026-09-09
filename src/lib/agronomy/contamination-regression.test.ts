import { beforeEach, describe, expect, it } from "vitest";
import { emptyRegionalContext, type AgronomicCasePayload } from "./case-schema";
import { runAgronomicCase } from "./runCase";
import { mentionsTomato } from "@/lib/assistant/crops";
import { resetCatalogueStoreToSeed } from "@/lib/regional-inputs/catalogue";
import { setWeatherProviderForTests, buildMockHumidRainyForecast } from "@/lib/weather/get-forecast";
import {
  createCropCase,
  resetCaseStore,
  setCasePersistenceModeForTests,
  updateCaseFromConversation,
} from "@/lib/cases/store";
import { getSimilarCases } from "@/lib/cases/similar";
import { similarCaseHint } from "@/lib/beta/conversation";
import { resetUsageStore } from "@/lib/beta/usage-store";
import { applyOutputGuard } from "./output-guard";

function tomatoLeak(text: string) {
  const lower = text.toLowerCase();
  return {
    tomato: /\btomato(es)?\b/.test(lower),
    blight: /early blight|late blight/.test(lower),
    similar: /we have seen similar tomato/.test(lower),
    products: /ask about products/.test(lower),
  };
}

function assertZeroTomato(payload: AgronomicCasePayload) {
  const blob = [
    payload.preliminaryAssessment,
    payload.nextQuestion,
    payload.weatherBrief ?? "",
    ...(payload.checksToday ?? []),
    ...(payload.safeActionsNow ?? []),
    ...(payload.likelyCauses ?? []),
    ...payload.quickReplies,
    ...payload.weatherRisks.map((item) => item.diseaseOrPest),
  ].join("\n");
  const leak = tomatoLeak(blob);
  expect(leak.tomato).toBe(false);
  expect(leak.blight).toBe(false);
  expect(leak.similar).toBe(false);
  expect(leak.products).toBe(false);
  expect(payload.quickReplies.join(" ")).not.toMatch(/ask about products/i);
  expect(
    payload.weatherRisks.some((item) => /early blight|late blight|whitefly population/i.test(item.diseaseOrPest)),
  ).toBe(false);
}

function mockCase(overrides: Partial<AgronomicCasePayload> = {}): AgronomicCasePayload {
  return {
    mode: "quick_help",
    stage: "assessment",
    questionId: "q_1_guidance_followup",
    questionType: "guidance_followup",
    preliminaryAssessment:
      "We have seen similar tomato cases. Early blight / late blight pressure looks high over the next 72 hours.",
    severity: "medium",
    nextQuestion: "Ask about products",
    quickReplies: ["Ask about products", "Upload a photo"],
    checksToday: ["Look for late blight on tomato"],
    safeActionsNow: ["Spray for tomato blight"],
    actionsToAvoid: [],
    photoRecommended: false,
    escalationRecommended: false,
    regionalContext: emptyRegionalContext(),
    weatherRisks: [
      {
        diseaseOrPest: "foliar disease complex (early blight / late blight pressure)",
        riskLevel: "high",
        riskWindow: "next 72 hours",
        weatherDrivers: ["warm day and night temperatures"],
        cropStage: null,
        recommendedChecks: [],
        preventiveActions: [],
        confidence: "medium",
        dataSource: "test",
        generatedAt: new Date().toISOString(),
        disclaimer: "Weather does not prove a diagnosis.",
      },
    ],
    verifiedInputOptions: [],
    internalMissingInformation: [],
    weatherRelevance: "supporting",
    weatherBrief: "Conditions may favour early blight / late blight.",
    ...overrides,
  };
}

beforeEach(() => {
  resetCatalogueStoreToSeed();
  resetCaseStore();
  resetUsageStore();
  setCasePersistenceModeForTests("memory");
  setWeatherProviderForTests({
    name: "mock-humid-rainy",
    async getForecast(location) {
      return buildMockHumidRainyForecast(location);
    },
  });
});

async function runWithLeak(message: string, profile?: { country: string }) {
  return runAgronomicCase({
    message,
    profile: profile ?? { country: "Trinidad and Tobago" },
    createResponse: async () => ({
      id: "leak",
      output_text: JSON.stringify(mockCase()),
    }),
  });
}

describe("live screenshot tomato contamination", () => {
  it.each([
    ["My celery outer leaves are burning.", "celery"],
    ["My lettuce has brown edges.", "lettuce"],
    ["My sweet pepper leaves look pale.", "pepper"],
    ["My cucumber vines are yellowing.", "cucumber"],
    ["The leaves are burning and dropping.", "unknown"],
    ["Help me make a cashflow for the bank", "cashflow"],
  ])("%s has zero tomato", async (message) => {
    const result = await runWithLeak(message);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    assertZeroTomato(result.case);
    expect(mentionsTomato(result.case.preliminaryAssessment)).toBe(false);
  });

  it("keeps tomato on a valid tomato case", async () => {
    const result = await runAgronomicCase({
      message: "Tomato leaf spots after heavy rain",
      profile: { country: "Trinidad and Tobago", district: "Chaguanas" },
      createResponse: async () => ({
        id: "tomato-ok",
        output_text: JSON.stringify(
          mockCase({
            preliminaryAssessment:
              "On tomato, leaf spots after rain can be foliar disease. Confirm lesions, how many plants are affected, and whether older leaves are worse before spraying.",
            nextQuestion: "Are the spots on a few plants or most of the field?",
            quickReplies: ["Few plants", "Patches"],
            weatherRelevance: "important",
          }),
        ),
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.preliminaryAssessment.toLowerCase()).toMatch(/tomato/);
    expect(result.case.quickReplies.join(" ")).not.toMatch(/ask about products/i);
  });
});

describe("similar-case hard gate", () => {
  it("never shows tomato similar cases for celery or unknown crop", async () => {
    const tomato = await createCropCase({
      anonymousSessionId: "11111111-1111-4111-8111-111111111111",
      message: "Tomato wilt after rain",
      profile: { country: "Trinidad and Tobago", district: "Couva" },
    });
    await updateCaseFromConversation(tomato.id, "reviewed", {
      agronomistReviewed: true,
      diagnosisConfirmed: true,
      knowledgeState: "validated",
    });
    const ranked = await getSimilarCases({
      crop: "celery",
      country: "Trinidad and Tobago",
      district: "Couva",
      symptoms: ["leaf burn"],
    });
    expect(ranked.some((item) => item.caseId === tomato.id)).toBe(false);
    expect(ranked.every((item) => !/tomato/i.test(item.farmerFacingSummary))).toBe(true);

    const unknown = await getSimilarCases({
      crop: null,
      symptoms: ["leaf burn", "wilting"],
    });
    expect(unknown).toEqual([]);

    const celeryCase = await createCropCase({
      anonymousSessionId: "22222222-2222-4222-8222-222222222222",
      message: "My celery outer leaves are burning.",
      profile: { country: "Trinidad and Tobago" },
    });
    expect(await similarCaseHint(celeryCase.id)).toBeNull();
  });
});

describe("output guard strips product CTA", () => {
  it("removes Ask about products from live payloads", () => {
    const guarded = applyOutputGuard(mockCase(), {
      userMessage: "My celery outer leaves are burning.",
      crop: "celery",
      allowedCrops: ["celery"],
    });
    expect(guarded.quickReplies.join(" ")).not.toMatch(/ask about products/i);
    expect(guarded.nextQuestion).not.toMatch(/ask about products/i);
  });
});
