import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistConversationTurn } from "@/lib/beta/conversation";
import type { AppIdentity } from "@/lib/beta/identity";
import { emptyRegionalContext, type AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import { createFakeCaseSupabase } from "@/lib/cases/fake-supabase";
import {
  addCaseMessage,
  CasePersistenceError,
  createCropCase,
  getCropCase,
  listCaseMessages,
  listCropCases,
  logCasePersistenceBackend,
  resetCaseStore,
  setCasePersistenceModeForTests,
  setCaseStoreAdminClientForTests,
} from "@/lib/cases/store";
import { resetUsageStore } from "@/lib/beta/usage-store";
import {
  isProductionRuntime,
  isSupabaseAdminConfigured,
  resolveCasePersistenceMode,
} from "@/lib/cases/persistence";

const GUEST_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

function guest(id = GUEST_ID): AppIdentity {
  return {
    kind: "guest",
    guestSessionId: id,
    authUserId: null,
    farmerProfileId: null,
    email: null,
    access: "guest",
  };
}

function registered(userId = USER_ID): AppIdentity {
  return {
    kind: "registered",
    guestSessionId: GUEST_ID,
    authUserId: userId,
    farmerProfileId: null,
    email: "farmer@example.com",
    access: "free_registered",
  };
}

function payload(overrides: Partial<AgronomicCasePayload> = {}): AgronomicCasePayload {
  return {
    mode: "quick_help",
    stage: "assessment",
    questionId: "",
    questionType: "",
    preliminaryAssessment: "Check the lower leaves closely.",
    severity: "medium",
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
    ...overrides,
  };
}

describe("Supabase case persistence layer", () => {
  const fake = createFakeCaseSupabase();
  const env = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, env);
    fake.reset();
    resetCaseStore();
    resetUsageStore();
    setCaseStoreAdminClientForTests(fake);
    setCasePersistenceModeForTests("supabase");
  });

  afterEach(() => {
    setCasePersistenceModeForTests(null);
    setCaseStoreAdminClientForTests(null);
    Object.assign(process.env, env);
    for (const key of Object.keys(process.env)) {
      if (!(key in env)) delete process.env[key];
    }
  });

  it("guest message creates crop_cases and case_messages rows through the persistence layer", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((message?: unknown) => {
      if (typeof message === "string") logs.push(message);
    });

    const persisted = await persistConversationTurn({
      identity: guest(),
      userMessage: "My tomato plants in Couva are wilting after rain.",
      assistantText: "Check whether the stem is brown and the soil is staying wet.",
      payload: payload(),
    });

    spy.mockRestore();
    expect(logs).toContain("case_persistence=supabase");
    expect(persisted.createdNewCase).toBe(true);
    expect(fake.db.crop_cases).toHaveLength(1);
    expect(fake.db.case_messages).toHaveLength(2);

    const cropCase = fake.db.crop_cases[0];
    expect(cropCase.anonymous_session_id).toBe(GUEST_ID);
    expect(cropCase.user_id).toBeNull();
    expect(cropCase.crop).toBe("tomato");
    expect(String(cropCase.farmer_problem_text)).toMatch(/wilting/i);

    const roles = fake.db.case_messages.map((row) => row.role).sort();
    expect(roles).toEqual(["assistant", "user"]);
    expect(fake.db.case_messages.every((row) => row.case_id === cropCase.id)).toBe(true);
    expect(fake.db.case_observations).toHaveLength(1);
    expect(fake.db.case_assessments).toHaveLength(1);
    expect(fake.db.case_actions.length).toBeGreaterThan(0);
    expect(fake.db.case_followups).toHaveLength(1);
  });

  it("continues an existing conversation from persisted Supabase rows, not process memory", async () => {
    const first = await persistConversationTurn({
      identity: guest(),
      userMessage: "Tomato wilt",
      assistantText: "Check the stem.",
      payload: payload(),
    });
    expect(fake.db.crop_cases).toHaveLength(1);
    resetCaseStore();
    expect(await listCropCases()).toHaveLength(1);

    const second = await persistConversationTurn({
      identity: guest(),
      caseId: first.caseId,
      userMessage: "The soil stays wet after watering.",
      assistantText: "Hold off on more water today.",
      payload: payload(),
    });

    expect(second.caseId).toBe(first.caseId);
    expect(second.createdNewCase).toBe(false);
    expect(fake.db.crop_cases).toHaveLength(1);
    expect(fake.db.case_messages).toHaveLength(4);
    const stored = await listCaseMessages(first.caseId);
    expect(stored.map((item) => item.content)).toEqual([
      "Tomato wilt",
      "Check the stem.",
      "The soil stays wet after watering.",
      "Hold off on more water today.",
    ]);
  });

  it("stores registered farmer cases with user_id", async () => {
    await persistConversationTurn({
      identity: registered(),
      userMessage: "Pepper leaves have holes",
      assistantText: "Look for caterpillars under a few leaves.",
      payload: payload(),
    });
    expect(fake.db.crop_cases[0]?.user_id).toBe(USER_ID);
    expect(fake.db.crop_cases[0]?.anonymous_session_id).toBe(GUEST_ID);
  });

  it("does not silently fall back to memory when Supabase writes fail", async () => {
    fake.failNext.add("crop_cases");
    await expect(
      createCropCase({
        anonymousSessionId: GUEST_ID,
        message: "Tomato wilt",
      }),
    ).rejects.toBeInstanceOf(CasePersistenceError);
    expect(fake.db.crop_cases).toHaveLength(0);
    setCasePersistenceModeForTests("memory");
    expect(await listCropCases()).toHaveLength(0);
  });

  it("loads a case from the persistence layer after memory is cleared", async () => {
    const created = await createCropCase({
      anonymousSessionId: GUEST_ID,
      message: "Celery leaf spot",
    });
    await addCaseMessage({
      caseId: created.id,
      role: "user",
      content: "Celery leaf spot",
    });
    resetCaseStore();
    const loaded = await getCropCase(created.id);
    expect(loaded?.id).toBe(created.id);
    expect(loaded?.anonymousSessionId).toBe(GUEST_ID);
    expect(await listCaseMessages(created.id)).toHaveLength(1);
  });
});

describe("case persistence mode", () => {
  const env = { ...process.env };

  afterEach(() => {
    setCasePersistenceModeForTests(null);
    Object.assign(process.env, env);
    for (const key of Object.keys(process.env)) {
      if (!(key in env)) delete process.env[key];
    }
  });

  it("uses memory as the explicit test fallback", () => {
    setCasePersistenceModeForTests(null);
    delete process.env.CASE_PERSISTENCE;
    delete process.env.VERCEL_ENV;
    expect(resolveCasePersistenceMode()).toBe("memory");
  });

  it("never chooses memory in production when Supabase is configured", () => {
    setCasePersistenceModeForTests(null);
    process.env.VERCEL_ENV = "production";
    process.env.CASE_PERSISTENCE = "memory";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    expect(isProductionRuntime()).toBe(true);
    expect(isSupabaseAdminConfigured()).toBe(true);
    expect(resolveCasePersistenceMode()).toBe("supabase");
    expect(logCasePersistenceBackend()).toBe("supabase");
  });
});
