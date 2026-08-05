import { describe, expect, it } from "vitest";
import {
  inferQuestionType,
  quickRepliesForType,
  QUICK_REPLIES_BY_TYPE,
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
});
