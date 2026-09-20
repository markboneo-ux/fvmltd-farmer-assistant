import { describe, expect, it } from "vitest";
import { caseReviewPriority, sortCasesNeedingReview } from "./cases-needing-review";
import { learningWeight, knowledgeStateFromCase } from "@/lib/assistant/knowledge";
import {
  FOLLOWED_RECOMMENDATION_OPTIONS,
  FOLLOWUP_OPTIONS,
  parseFollowedRecommendation,
} from "@/lib/cases/followups";

describe("cases needing review", () => {
  it("prioritises low-confidence, worsening, and high-consequence cases", () => {
    const ranked = sortCasesNeedingReview(
      [
        {
          id: "low",
          confidence: "low" as const,
          severity: "unknown" as const,
          humanEscalation: false,
          needsReview: false,
          possibleCauses: ["maybe fungus"],
          symptoms: ["leaf spot"],
          crop: "lettuce",
          farmerProblemText: "brown edges",
          caseStatus: "open" as const,
          businessMetadata: { cropHealthState: { diagnosticConfidence: "possible" } },
          agronomistReviewed: false,
        },
        {
          id: "worse",
          confidence: "medium" as const,
          severity: "high" as const,
          humanEscalation: true,
          needsReview: false,
          possibleCauses: ["wilt"],
          symptoms: ["wilting"],
          crop: "tomato",
          farmerProblemText: "sudden wilt, plants dying across the whole field",
          caseStatus: "human_review" as const,
          businessMetadata: null,
          agronomistReviewed: false,
        },
      ],
      (item) =>
        caseReviewPriority(item, {
          outcome: item.id === "worse" ? "worse" : null,
        }),
    );
    expect(ranked[0]?.id).toBe("worse");
    expect(ranked[0]?.review.reasons).toEqual(
      expect.arrayContaining(["worsening", "high_consequence"]),
    );
  });
});

describe("learning weights", () => {
  it("does not treat an unconfirmed AI diagnosis as fact", () => {
    expect(
      knowledgeStateFromCase({
        agronomistReviewed: false,
        diagnosisConfirmed: false,
        knowledgeState: "raw",
      }),
    ).toBe("raw");
    expect(
      learningWeight({
        agronomistReviewed: false,
        diagnosisConfirmed: false,
        knowledgeState: "raw",
      }),
    ).toBe(2);
    expect(
      learningWeight({
        agronomistReviewed: true,
        diagnosisConfirmed: true,
        outcome: "improved",
      }),
    ).toBeGreaterThan(50);
  });
});

describe("follow-up outcome and recommendation adherence", () => {
  it("keeps Improved / About the same / Worse / Solved and whether they followed advice", () => {
    expect([...FOLLOWUP_OPTIONS]).toEqual([
      "Improved",
      "About the same",
      "Worse",
      "Solved",
    ]);
    expect([...FOLLOWED_RECOMMENDATION_OPTIONS]).toEqual([
      "Yes, I followed it",
      "Partly",
      "Not yet",
    ]);
    expect(parseFollowedRecommendation("Yes, I followed it")).toBe("Yes, I followed it");
  });
});
