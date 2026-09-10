import { describe, expect, it } from "vitest";
import { emptyRegionalContext } from "./case-schema";
import {
  applyOutputGuard,
  similarCaseNoteIsAllowed,
  stripUnsupportedTomatoContent,
  tomatoIsPermitted,
} from "./output-guard";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    mode: "quick_help" as const,
    stage: "assessment" as const,
    questionId: "",
    questionType: "" as const,
    nextQuestion: "Ask about products",
    quickReplies: ["Ask about products", "Few plants"],
    preliminaryAssessment:
      "We have seen similar tomato cases. Early blight / late blight pressure looks high.",
    severity: "medium" as const,
    checksToday: ["Look for late blight"],
    safeActionsNow: ["Scout tomato plants"],
    actionsToAvoid: [],
    photoRecommended: false,
    escalationRecommended: false,
    regionalContext: emptyRegionalContext(),
    weatherRisks: [
      {
        diseaseOrPest: "foliar disease complex (early blight / late blight pressure)",
        riskLevel: "high" as const,
        riskWindow: "next 72 hours",
        weatherDrivers: ["warm day and night temperatures"],
        cropStage: null,
        recommendedChecks: [],
        preventiveActions: [],
        confidence: "medium",
        dataSource: "test",
        generatedAt: new Date().toISOString(),
        disclaimer: "Weather-linked risk only — weather does not prove a diagnosis.",
      },
    ],
    verifiedInputOptions: [],
    internalMissingInformation: [],
    weatherRelevance: "supporting" as const,
    weatherBrief: "Conditions may favour early blight / late blight pressure.",
    ...overrides,
  };
}

describe("tomato output guard", () => {
  it("permits tomato only when the farmer named it or the crop is tomato", () => {
    expect(tomatoIsPermitted({ userMessage: "My celery is burning", crop: "celery" })).toBe(
      false,
    );
    expect(tomatoIsPermitted({ userMessage: "leaves burning", crop: null })).toBe(false);
    expect(tomatoIsPermitted({ userMessage: "Tomato wilt", crop: "tomato" })).toBe(true);
    expect(
      tomatoIsPermitted({
        userMessage: "The soil stays wet",
        crop: "tomato",
        allowedCrops: ["tomato"],
      }),
    ).toBe(true);
  });

  it("strips tomato, blight models, and similar-case tomato language", () => {
    const text = stripUnsupportedTomatoContent(
      "We have seen similar tomato cases. Early blight and late blight on tomato.",
      false,
    );
    expect(text.toLowerCase()).not.toMatch(/tomato/);
    expect(text.toLowerCase()).not.toMatch(/early blight|late blight/);
  });

  it("clears tomato weather cards and product CTAs for non-tomato crops", () => {
    const guarded = applyOutputGuard(payload(), {
      userMessage: "My celery outer leaves are burning.",
      crop: "celery",
      allowedCrops: ["celery"],
    });
    expect(guarded.preliminaryAssessment.toLowerCase()).not.toMatch(/tomato/);
    expect(guarded.preliminaryAssessment.toLowerCase()).not.toMatch(/early blight|late blight/);
    expect(guarded.weatherRisks).toEqual([]);
    expect(guarded.quickReplies.join(" ").toLowerCase()).not.toMatch(/ask about products/);
    expect(guarded.nextQuestion).toBe("");
  });

  it("keeps tomato language on a real tomato case", () => {
    const guarded = applyOutputGuard(
      payload({
        weatherRelevance: "important",
        preliminaryAssessment: "On tomato, leaf spots after rain can be foliar disease.",
        nextQuestion: "Are sticky leaves present?",
        quickReplies: ["Few plants"],
      }),
      {
        userMessage: "Tomato leaf spots after heavy rain",
        crop: "tomato",
        allowedCrops: ["tomato"],
      },
    );
    expect(guarded.preliminaryAssessment.toLowerCase()).toMatch(/tomato/);
    expect(guarded.weatherRisks.length).toBe(1);
  });

  it("drops similar-case notes that name tomato for a celery problem", () => {
    expect(
      similarCaseNoteIsAllowed({
        note: "We have seen similar tomato cases.",
        crop: "celery",
        userMessage: "My celery outer leaves are burning.",
        allowedCrops: ["celery"],
      }),
    ).toBeNull();
    expect(
      similarCaseNoteIsAllowed({
        note: "We have seen similar tomato cases.",
        crop: null,
        userMessage: "The leaves are burning.",
      }),
    ).toBeNull();
  });
});
