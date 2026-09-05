import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { persistConversationTurn } from "@/lib/beta/conversation";
import type { AppIdentity } from "@/lib/beta/identity";
import { emptyRegionalContext } from "@/lib/agronomy/case-schema";
import { buildInsights } from "./insights";
import {
  getCropCase,
  resetCaseStore,
  setCasePersistenceModeForTests,
  updateCaseReview,
} from "@/lib/cases/store";
import { ingestCaseForTrends } from "@/lib/trends/ingest";
import { listCaseTrends } from "@/lib/trends/store";
import { resetUsageStore } from "@/lib/beta/usage-store";
import { recordResearchEvent, resetResearchLog } from "@/lib/research/log";
import { canExposeTrend } from "@/lib/trends/engine";

function guest(id: string): AppIdentity {
  return {
    kind: "guest",
    guestSessionId: id,
    authUserId: null,
    farmerProfileId: null,
    email: null,
    access: "guest",
  };
}

function registered(id: string): AppIdentity {
  return {
    kind: "registered",
    guestSessionId: "guest-linked",
    authUserId: id,
    farmerProfileId: null,
    email: "farmer@example.com",
    access: "free_registered",
  };
}

const payload = {
  mode: "quick_help" as const,
  stage: "assessment" as const,
  questionId: "",
  questionType: "" as const,
  preliminaryAssessment: "Check the lower leaves closely.",
  severity: "medium" as const,
  nextQuestion: "",
  quickReplies: [],
  checksToday: ["Look under a few leaves"],
  safeActionsNow: ["Wait and watch for one day"],
  actionsToAvoid: [],
  photoRecommended: false,
  escalationRecommended: false,
  regionalContext: emptyRegionalContext(),
  weatherRisks: [],
  verifiedInputOptions: [],
  internalMissingInformation: [],
};

async function report(id: string, message: string) {
  return persistConversationTurn({
    identity: guest(id),
    userMessage: message,
    assistantText: "Check the leaf underside.",
    payload,
    profile: { country: "Trinidad and Tobago", district: "Couva" },
  });
}

describe("admin dashboard metrics", () => {
  beforeEach(() => {
    setCasePersistenceModeForTests("memory");
    resetCaseStore();
    resetUsageStore();
    resetResearchLog();
  });

  afterEach(() => {
    setCasePersistenceModeForTests(null);
  });

  it("counts messages, crops, and guest vs registered users", async () => {
    await persistConversationTurn({
      identity: guest("11111111-1111-4111-8111-111111111111"),
      userMessage: "My celery leaves are yellowing",
      assistantText: "Check older leaves first.",
      payload,
      profile: { country: "Trinidad and Tobago", district: "Couva" },
    });
    await persistConversationTurn({
      identity: registered("22222222-2222-4222-8222-222222222222"),
      userMessage: "Tomato whiteflies",
      assistantText: "Look under the leaves.",
      payload,
      profile: { country: "Trinidad and Tobago", district: "Couva" },
    });
    recordResearchEvent({
      caseId: null,
      usedWeb: true,
      need: "market_prices",
      sources: ["NAMDEVCO NAMIS market data"],
      failures: [],
      outdatedSources: [],
    });

    const insights = await buildInsights();
    expect(insights.summary.totalMessages).toBeGreaterThanOrEqual(4);
    expect(insights.summary.totalCropCases).toBe(2);
    expect(insights.summary.uniqueGuestSessions).toBe(1);
    expect(insights.summary.registeredUsers).toBe(1);
    expect(insights.activity.guestCases).toBe(1);
    expect(insights.activity.registeredCases).toBe(1);
    expect(insights.agronomy.problemsByCrop.some((row) => row.label === "celery")).toBe(true);
    expect(insights.agronomy.problemsByCrop.some((row) => row.label === "tomato")).toBe(true);
    expect(insights.webResearch.answersUsingWeb).toBe(1);
    expect(insights.cases.every((item) => !("email" in item))).toBe(true);
  });

  it("requires multiple unique farmers for a trend and ignores excluded cases", async () => {
    const one = await report("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Cucumber leaf spot in Couva");
    expect((await listCaseTrends()).filter(canExposeTrend)).toHaveLength(0);

    await report("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Cucumber leaf spot in Couva");
    expect((await listCaseTrends()).filter(canExposeTrend)).toHaveLength(0);

    const three = await report("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "Cucumber leaf spot in Couva");
    expect((await listCaseTrends()).filter(canExposeTrend).length).toBeGreaterThan(0);

    await updateCaseReview(one.caseId, { excludeFromLearning: true, diagnosisIncorrect: true });
    await ingestCaseForTrends((await getCropCase(three.caseId))!);
    expect((await listCaseTrends()).filter(canExposeTrend)).toHaveLength(0);
  });
});
