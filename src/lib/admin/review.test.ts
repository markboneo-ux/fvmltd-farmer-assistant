import { describe, expect, it } from "vitest";
import { applyStaffReview } from "./review";

const base = {
  diagnosisConfirmed: false,
  diagnosisIncorrect: false,
  needsReview: false,
  includeInTrendLearning: true,
  knowledgeState: "raw" as const,
  caseStatus: "open" as const,
};

describe("staff review patches", () => {
  it("does not clear include-in-learning when marking resolved", () => {
    const next = applyStaffReview(base, { resolved: true });
    expect(next.caseStatus).toBe("resolved");
    expect(next.includeInTrendLearning).toBe(true);
    expect(next.diagnosisConfirmed).toBe(false);
  });

  it("marks incorrect diagnoses as rejected and excluded from trends", () => {
    const next = applyStaffReview(
      { ...base, diagnosisConfirmed: true },
      { diagnosisIncorrect: true, includeInTrendLearning: false },
    );
    expect(next.diagnosisIncorrect).toBe(true);
    expect(next.diagnosisConfirmed).toBe(false);
    expect(next.includeInTrendLearning).toBe(false);
    expect(next.knowledgeState).toBe("rejected");
  });

  it("keeps confirmed diagnosis when staff only flags needs review", () => {
    const next = applyStaffReview(
      { ...base, diagnosisConfirmed: true, knowledgeState: "validated" },
      { needsReview: true },
    );
    expect(next.diagnosisConfirmed).toBe(true);
    expect(next.needsReview).toBe(true);
    expect(next.caseStatus).toBe("human_review");
    expect(next.knowledgeState).toBe("validated");
  });
});
