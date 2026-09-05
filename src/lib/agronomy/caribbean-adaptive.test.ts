import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { emptyRegionalContext, type AgronomicCasePayload } from "./case-schema";
import { runAgronomicCase } from "./runCase";
import { extractKnownFacts, applyCommercialSafetyGuards } from "./tomato-protocol";
import { QUICK_REPLIES_BY_TYPE } from "./question-types";
import { resetCatalogueStoreToSeed } from "@/lib/regional-inputs/catalogue";
import { setWeatherProviderForTests } from "@/lib/weather/get-forecast";
import { buildMockHumidRainyForecast } from "@/lib/weather/get-forecast";
import { resolveTurnContext } from "@/lib/assistant/context";
import { farmerHistoryContent } from "@/lib/chat/visible-reply";
import {
  enrichCitations,
  sourceVerificationLine,
  stripCitedSourceNames,
} from "@/lib/research/citations";
import { persistConversationTurn } from "@/lib/beta/conversation";
import type { AppIdentity } from "@/lib/beta/identity";
import { resetCaseStore, setCasePersistenceModeForTests, listCaseMessages } from "@/lib/cases/store";
import { resetUsageStore } from "@/lib/beta/usage-store";
import { unverifiedRegistrationMessage } from "@/lib/research/types";

function mockCase(overrides: Partial<AgronomicCasePayload> = {}): AgronomicCasePayload {
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

function guest(): AppIdentity {
  return {
    kind: "guest",
    guestSessionId: "11111111-1111-4111-8111-111111111111",
    authUserId: null,
    farmerProfileId: null,
    email: null,
    access: "guest",
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
  resetCaseStore();
  resetUsageStore();
  setCasePersistenceModeForTests("memory");
});

describe("adaptive Caribbean assistant", () => {
  it("gives a technical user a deeper celery answer", async () => {
    let captured = "";
    const result = await runAgronomicCase({
      message:
        "Celery foliar necrosis in Trinidad. Differential for tip burn vs Cercospora. Check EC and FRAC if we need a fungicide.",
      skipRegionalTools: true,
      createResponse: async (params) => {
        captured = String(params.instructions);
        return {
          id: "resp_tech",
          output_text: JSON.stringify(
            mockCase({
              preliminaryAssessment: "Could be heat, nutrient imbalance or watering.",
            }),
          ),
        };
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(captured).toMatch(/TECHNICAL_USER|AGRONOMIST/);
    expect(captured).toMatch(/FRAC|physiology|do not oversimplify/i);
    expect(result.case.farmerLevel).toBe("TECHNICAL_USER");
    expect(result.case.likelyCauses?.join(" ")).toMatch(/EC|Cercospora|phytotoxicity/i);
    expect(result.case.preliminaryAssessment.toLowerCase()).not.toMatch(
      /^could be heat, nutrient imbalance or watering/,
    );
  });

  it("gives a home gardener a simpler celery answer", async () => {
    let captured = "";
    const result = await runAgronomicCase({
      message: "My backyard celery in pots on the porch is burning up.",
      skipRegionalTools: true,
      createResponse: async (params) => {
        captured = String(params.instructions);
        return {
          id: "resp_home",
          output_text: JSON.stringify(
            mockCase({
              preliminaryAssessment: "Could be heat, nutrient imbalance or watering.",
            }),
          ),
        };
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(captured).toMatch(/HOME_GARDENER/);
    expect(result.case.farmerLevel).toBe("HOME_GARDENER");
    expect(result.case.preliminaryAssessment.toLowerCase()).not.toMatch(/\bfrac\b|\bphytotoxicity\b|\bec\b/);
    expect(result.case.likelyCauses?.join(" ").toLowerCase()).toMatch(/watering|fertilizer|spray/);
  });

  it("retains country within a case and does not ask again", async () => {
    const first = resolveTurnContext({
      message: "My celery is burning up in Trinidad and Tobago.",
    });
    expect(first.knownFacts.country).toBe("Trinidad and Tobago");
    expect(first.knownFacts.crop).toBe("celery");

    const follow = resolveTurnContext({
      message: "The brown is starting at the leaf tips.",
      history: [
        { role: "user", content: "My celery is burning up in Trinidad and Tobago." },
        { role: "assistant", content: "Are the brown areas starting at the tips or as spots?" },
      ],
      activeCase: {
        crop: "celery",
        conversationIntent: "crop_problem",
        country: "Trinidad and Tobago",
      },
    });
    expect(follow.resetHistory).toBe(false);
    expect(follow.knownFacts.country).toBe("Trinidad and Tobago");
    expect(follow.knownFacts.crop).toBe("celery");
    expect(
      applyCommercialSafetyGuards(mockCase({
        stage: "questioning",
        nextQuestion: "What country are you farming in?",
        preliminaryAssessment: "Checking location.",
      }), {
        mode: "quick_help",
        questionsAskedBeforeThisTurn: 1,
        knownFacts: follow.knownFacts,
        intent: "crop_problem",
      }).nextQuestion.toLowerCase(),
    ).not.toMatch(/country/);
  });

  it("lets the farmer change country in the same case", () => {
    const follow = resolveTurnContext({
      message: "I moved the crop to Guyana.",
      history: [
        { role: "user", content: "My celery is burning up in Trinidad and Tobago." },
      ],
      profile: { country: "Trinidad and Tobago" },
      activeCase: {
        crop: "celery",
        conversationIntent: "crop_problem",
        country: "Trinidad and Tobago",
      },
    });
    expect(follow.knownFacts.country).toBe("Guyana");
    expect(follow.knownFacts.crop).toBe("celery");
  });

  it("does not assume Trinidad for a guest with no country", async () => {
    const result = await runAgronomicCase({
      message: "My celery is burning up.",
      skipRegionalTools: true,
      createResponse: async (params) => {
        expect(String(params.instructions)).toMatch(/do not assume Trinidad/i);
        expect(String(params.instructions)).toMatch(/country: unknown/i);
        return {
          id: "resp_no_country",
          output_text: JSON.stringify(
            mockCase({
              preliminaryAssessment: "Could be heat, nutrient imbalance or watering.",
            }),
          ),
        };
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.regionalContext.country).not.toBe("Trinidad and Tobago");
    expect(result.case.verifiedInputOptions).toEqual([]);
  });

  it("removes the permanent Ask about products button", () => {
    expect(QUICK_REPLIES_BY_TYPE.guidance_followup.join(" ").toLowerCase()).not.toMatch(
      /ask about products/,
    );
    const chat = readFileSync(
      join(process.cwd(), "src/components/ChatAssistantMessage.tsx"),
      "utf8",
    );
    expect(chat).not.toMatch(/Ask about products/);
    const guarded = applyCommercialSafetyGuards(
      mockCase({
        stage: "assessment",
        preliminaryAssessment: "Whiteflies need scouting first.",
        checksToday: ["Look under leaves"],
        safeActionsNow: ["Scout this morning"],
        quickReplies: ["Ask about products", "Start full crop check"],
      }),
      {
        mode: "quick_help",
        questionsAskedBeforeThisTurn: 1,
        knownFacts: extractKnownFacts("Tomato whiteflies"),
        intent: "pest_disease",
      },
    );
    expect(guarded.quickReplies.join(" ").toLowerCase()).not.toMatch(/ask about products/);
  });

  it("keeps sources collapsed and does not duplicate source names", () => {
    const chat = readFileSync(
      join(process.cwd(), "src/components/ChatAssistantMessage.tsx"),
      "utf8",
    );
    expect(chat).toMatch(/Sources used/);
    expect(chat).toMatch(/<details>/);
    const sources = enrichCitations([
      {
        name: "NAMDEVCO NAMIS market data",
        url: "https://namistt.com/",
        organization: "NAMDEVCO",
        category: "market_prices",
      },
    ]);
    expect(sourceVerificationLine(sources, "Trinidad and Tobago")).toMatch(
      /Trinidad and Tobago official sources/i,
    );
    const stripped = stripCitedSourceNames(
      "According to NAMDEVCO NAMIS market data celery is selling well.",
      sources,
    );
    expect(stripped.toLowerCase()).not.toMatch(/namdevco namis market data/);
    const history = farmerHistoryContent(
      mockCase({
        preliminaryAssessment: "Check drainage first.",
        webSources: sources,
      }),
    );
    expect(history).not.toMatch(/^Sources:/m);
    expect(history.toLowerCase()).not.toContain("namdevco");
  });

  it("gives celery burning a specific differential and does not let weather hijack it", async () => {
    const result = await runAgronomicCase({
      message: "Why is my celery burning?",
      profile: { country: "Trinidad and Tobago" },
      createResponse: async (params) => {
        expect(JSON.stringify(params.input)).toMatch(/WEATHER GATE: Weather is not central/);
        return {
          id: "resp_celery_burn",
          output_text: JSON.stringify(
            mockCase({
              preliminaryAssessment: "Could be heat, nutrient imbalance or watering.",
            }),
          ),
        };
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.case.weatherRelevance).toBe("omit");
    expect(result.case.weatherRisks).toEqual([]);
    expect(result.case.likelyCauses?.join(" ").toLowerCase()).toMatch(/root|potassium|spray/);
    expect(result.case.preliminaryAssessment.toLowerCase()).toMatch(/tips?|spots/);
    expect(result.case.preliminaryAssessment.toLowerCase()).not.toMatch(
      /72-hour|disease-pressure alert/,
    );
    expect(result.case.verifiedInputOptions).toEqual([]);
    expect(result.case.nextQuestion.toLowerCase()).toMatch(/tips?|edges?|spots/);
  });

  it("only attaches products when the farmer asks, and requires local verification", async () => {
    const silent = await runAgronomicCase({
      message: "Why is my celery burning?",
      profile: { country: "Trinidad and Tobago" },
      createResponse: async () => ({
        id: "resp_no_product",
        output_text: JSON.stringify(mockCase({ preliminaryAssessment: "Look at the leaf pattern." })),
      }),
    });
    expect(silent.ok).toBe(true);
    if (silent.ok) {
      expect(silent.case.verifiedInputOptions).toEqual([]);
    }

    const asked = await runAgronomicCase({
      message: "What fungicide is registered for celery in Guyana?",
      profile: { country: "Guyana" },
      skipRegionalTools: true,
      researchFn: async () => ({
        needed: "pesticide_registration",
        usedWeb: true,
        documents: [],
        citations: [],
        marketQuotes: [],
        pesticide: {
          country: "Guyana",
          activeIngredient: "azoxystrobin",
          tradeName: null,
          verified: false,
          status: "unverified",
          localTradeNames: [],
          sourceName: null,
          sourceUrl: null,
          lastVerifiedAt: null,
          farmerMessage: unverifiedRegistrationMessage("Guyana"),
        },
        brief: unverifiedRegistrationMessage("Guyana"),
        failures: [],
        outdatedSources: [],
      }),
      createResponse: async () => ({
        id: "resp_gy_product",
        output_text: JSON.stringify(
          mockCase({
            preliminaryAssessment: "Azoxystrobin is registered in Guyana for celery.",
          }),
        ),
      }),
    });
    expect(asked.ok).toBe(true);
    if (!asked.ok) return;
    expect(asked.case.verifiedInputOptions).toEqual([]);
    expect(asked.case.preliminaryAssessment).toMatch(/cannot confirm that this product is registered in Guyana/i);
  });

  it("keeps guest persistence and photo upload working", async () => {
    const photo = await runAgronomicCase({
      message: "Here is a photo of my celery.",
      images: [
        {
          mimeType: "image/jpeg",
          base64: "dGVzdGltYWdl",
          fileName: "celery.jpg",
        },
      ],
      skipRegionalTools: true,
      createResponse: async (params) => {
        const input = params.input as Array<{ content: unknown }>;
        const last = input[input.length - 1];
        expect(Array.isArray(last.content)).toBe(true);
        return {
          id: "resp_photo_celery",
          output_text: JSON.stringify(
            mockCase({
              preliminaryAssessment: "The photo is a bit distant, so this is a first look only.",
              photoRecommended: true,
            }),
          ),
        };
      },
    });
    expect(photo.ok).toBe(true);

    const persisted = await persistConversationTurn({
      identity: guest(),
      userMessage: "My celery is burning up in Trinidad and Tobago.",
      assistantText: "Check whether the burn starts at the tips.",
      payload: mockCase({
        preliminaryAssessment: "Check whether the burn starts at the tips.",
        likelyCauses: ["Root-zone stress"],
        farmerLevel: "SMALL_FARMER",
      }),
    });
    expect(await listCaseMessages(persisted.caseId)).toHaveLength(2);
  });
});
