import { describe, expect, it } from "vitest";
import {
  inferQuestionType,
  quickRepliesForType,
  QUICK_REPLIES_BY_TYPE,
  reconcileQuickReplies,
  repliesMatchQuestion,
} from "./question-types";

describe("question-types deterministic quick replies", () => {
  it("maps soil questions to soil buttons only", () => {
    expect(inferQuestionType("What soil type is the crop in?")).toBe(
      "soil_type",
    );
    expect(quickRepliesForType("soil_type")).toEqual(
      QUICK_REPLIES_BY_TYPE.soil_type,
    );
    expect(quickRepliesForType("soil_type")).toEqual([
      "Clay",
      "Loam",
      "Sandy",
      "Raised-bed mix",
      "Soilless medium",
      "Not sure",
    ]);
  });

  it("maps field distribution questions", () => {
    expect(
      inferQuestionType(
        "Are they affecting a few plants, patches, or most of the field?",
      ),
    ).toBe("field_distribution");
    expect(quickRepliesForType("field_distribution")).toContain("Few plants");
    expect(quickRepliesForType("field_distribution")).not.toContain("Clay");
  });

  it("returns no buttons for unsupported open questions", () => {
    expect(inferQuestionType("What variety are you growing?")).toBe("open");
    expect(quickRepliesForType("open")).toEqual([]);
  });

  it("derives lesion-appearance chips from the exact follow-up, not stale location chips", () => {
    const question = "Are the spots small with dark centres or do they have rings?";
    expect(inferQuestionType(question)).toBe("lesion_appearance");
    expect(repliesMatchQuestion(question, QUICK_REPLIES_BY_TYPE.symptom_location)).toBe(
      false,
    );
    const reconciled = reconcileQuickReplies({
      question,
      quickReplies: QUICK_REPLIES_BY_TYPE.symptom_location,
      questionType: "symptom_location",
    });
    expect(reconciled.questionType).toBe("lesion_appearance");
    expect(reconciled.quickReplies).toEqual([
      "Small dark-centred spots",
      "Rings / target-like spots",
      "Water-soaked spots",
      "Something else",
      "Not sure",
    ]);
    expect(reconciled.quickReplies.join(" ")).not.toMatch(/Lower leaves/);
  });
});
