import { describe, expect, it } from "vitest";
import {
  aggregateCluster,
  canExposeTrend,
  oneCaseCannotEstablish,
  scoreTrend,
} from "./engine";
import type { TrendClusterInput } from "./types";

function member(overrides: Partial<TrendClusterInput>): TrendClusterInput {
  return {
    caseId: "c1",
    sessionKey: "s1",
    country: "Trinidad and Tobago",
    region: "Couva",
    crop: "cucumber",
    variety: null,
    symptoms: ["leaf spot"],
    suspectedIssue: "leaf_spot",
    createdAt: "2026-09-01T00:00:00.000Z",
    agronomistReviewed: false,
    diagnosisConfirmed: false,
    positiveOutcome: false,
    rejected: false,
    ...overrides,
  };
}

describe("trend engine", () => {
  it("does not create a trend from one unique case", () => {
    const trend = aggregateCluster([member({ caseId: "c1", sessionKey: "s1" })]);
    expect(trend).toBeNull();
  });

  it("requires multiple unique sessions before exposing a trend", () => {
    const sameFarmerTwice = aggregateCluster([
      member({ caseId: "c1", sessionKey: "guest-a" }),
      member({ caseId: "c2", sessionKey: "guest-a" }),
    ]);
    expect(sameFarmerTwice).toBeNull();

    const twoFarmers = aggregateCluster([
      member({ caseId: "c1", sessionKey: "guest-a" }),
      member({ caseId: "c2", sessionKey: "guest-b", createdAt: "2026-09-02T00:00:00.000Z" }),
    ]);
    expect(twoFarmers).not.toBeNull();
    expect(twoFarmers && canExposeTrend(twoFarmers)).toBe(true);
    expect(twoFarmers?.trendStatus).toBe("emerging");
    expect(oneCaseCannotEstablish(twoFarmers)).toBe(true);
  });

  it("one case cannot create an established trend", () => {
    const scored = scoreTrend({
      uniqueSessionCount: 1,
      caseCount: 1,
      reviewedCaseCount: 1,
      confirmedCaseCount: 1,
      positiveOutcomeCount: 1,
      staffReviewed: false,
      rejected: false,
    });
    expect(scored.status).not.toBe("established");
    const trend = aggregateCluster([
      member({
        agronomistReviewed: true,
        diagnosisConfirmed: true,
        positiveOutcome: true,
      }),
    ]);
    expect(trend).toBeNull();
  });

  it("rejected or incorrect cases do not become trusted knowledge", () => {
    const trend = aggregateCluster([
      member({ caseId: "c1", sessionKey: "a", rejected: true }),
      member({ caseId: "c2", sessionKey: "b", rejected: true }),
    ]);
    expect(trend).toBeNull();
  });

  it("reviewed and confirmed cases rank higher than raw reports", () => {
    const raw = scoreTrend({
      uniqueSessionCount: 4,
      caseCount: 4,
      reviewedCaseCount: 0,
      confirmedCaseCount: 0,
      positiveOutcomeCount: 0,
      staffReviewed: false,
      rejected: false,
    });
    const reviewed = scoreTrend({
      uniqueSessionCount: 4,
      caseCount: 4,
      reviewedCaseCount: 3,
      confirmedCaseCount: 2,
      positiveOutcomeCount: 2,
      staffReviewed: false,
      rejected: false,
    });
    expect(reviewed.confidenceScore).toBeGreaterThan(raw.confidenceScore);
    expect(reviewed.status === "established" || reviewed.status === "recurring").toBe(
      true,
    );
  });
});
