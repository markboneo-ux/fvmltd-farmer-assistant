import { describe, expect, it } from "vitest";
import { similarCaseHardGate, SIMILAR_CASE_UNIQUE_FARMER_THRESHOLD } from "./similar";
import { followUpDelayDays, followUpPromptForCase, shouldScheduleFollowUp } from "./followups";

describe("similar-case hard gate rules", () => {
  it("fails when crop is unknown or mismatched", () => {
    expect(
      similarCaseHardGate({
        currentCrop: null,
        retrievedCrop: "tomato",
        symptomSimilarity: 2,
        uniqueFarmerCount: 5,
      }),
    ).toBe(false);
    expect(
      similarCaseHardGate({
        currentCrop: "celery",
        retrievedCrop: "tomato",
        symptomSimilarity: 2,
        uniqueFarmerCount: 5,
      }),
    ).toBe(false);
  });

  it("passes only when crop, symptoms, and unique farmers match", () => {
    expect(
      similarCaseHardGate({
        currentCrop: "celery",
        retrievedCrop: "celery",
        symptomSimilarity: 1,
        uniqueFarmerCount: SIMILAR_CASE_UNIQUE_FARMER_THRESHOLD,
      }),
    ).toBe(true);
  });
});

describe("follow-up policy", () => {
  it("does not follow up math or cashflow", () => {
    expect(
      shouldScheduleFollowUp({
        caseType: "calculation",
        conversationIntent: "simple_math",
        crop: null,
        symptoms: [],
        severity: "unknown",
        humanEscalation: false,
      }),
    ).toBe(false);
    expect(
      shouldScheduleFollowUp({
        caseType: "farm_business",
        conversationIntent: "cashflow",
        crop: "celery",
        symptoms: [],
        severity: "unknown",
        humanEscalation: false,
      }),
    ).toBe(false);
  });

  it("schedules crop problems with the requested timing", () => {
    expect(followUpDelayDays("high")).toBe(1);
    expect(followUpDelayDays("medium")).toBe(3);
    expect(followUpDelayDays("low", { nutrition: true })).toBe(6);
    expect(
      followUpPromptForCase({
        crop: "celery",
        symptoms: ["leaf burn"],
        problemCategory: "leaf_damage",
        farmerProblemText: "burning",
      }),
    ).toMatch(/celery/i);
  });
});
