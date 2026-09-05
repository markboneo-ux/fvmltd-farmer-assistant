import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistConversationTurn } from "@/lib/beta/conversation";
import type { AppIdentity } from "@/lib/beta/identity";
import { emptyRegionalContext, type AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import { createFakeCaseSupabase } from "@/lib/cases/fake-supabase";
import {
  addCaseMessage,
  addCasePhoto,
  CasePersistenceError,
  createCropCase,
  getCropCase,
  listCaseMessages,
  listCasePhotos,
  listCropCases,
  logCasePersistenceBackend,
  resetCaseStore,
  setCasePersistenceModeForTests,
  setCaseStoreAdminClientForTests,
  updateCaseFromConversation,
} from "@/lib/cases/store";
import { getSimilarCases } from "@/lib/cases/similar";
import { ingestCaseForTrends } from "@/lib/trends/ingest";
import { listCaseTrends } from "@/lib/trends/store";
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
    expect(logs).toContain("CASE_PERSISTENCE_START");
    expect(logs).toContain("CASE_PERSISTENCE_SUPABASE");
    expect(logs).toContain("case_persistence=supabase");
    expect(persisted.createdNewCase).toBe(true);
    expect(fake.db.crop_cases).toHaveLength(1);
    expect(fake.db.case_messages).toHaveLength(2);

    const cropCase = fake.db.crop_cases[0];
    expect(logs).toContain(`CASE_CREATED id=${cropCase.id}`);
    expect(logs).toContain(`CASE_MESSAGE_SAVED case=${cropCase.id} role=user`);
    expect(logs).toContain(`CASE_MESSAGE_SAVED case=${cropCase.id} role=assistant`);
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

  it("still saves the chat when follow-up or trend enrichment fails", async () => {
    fake.failNext.add("case_followups");
    const persisted = await persistConversationTurn({
      identity: guest(),
      userMessage: "My lettuce has brown edges.",
      assistantText: "Check whether the brown starts at the tips.",
      payload: payload(),
    });
    expect(persisted.createdNewCase).toBe(true);
    expect(fake.db.crop_cases).toHaveLength(1);
    expect(fake.db.case_messages).toHaveLength(2);
    expect(fake.db.case_messages.every((row) => row.case_id === persisted.caseId)).toBe(true);
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

  it("continues the same guest case across serverless memory resets without a client caseId", async () => {
    const first = await persistConversationTurn({
      identity: guest(),
      userMessage: "Tomato wilt",
      assistantText: "Check the stem.",
      payload: payload(),
    });
    resetCaseStore();

    const second = await persistConversationTurn({
      identity: guest(),
      userMessage: "The soil stays wet after watering.",
      assistantText: "Hold off on more water today.",
      payload: payload(),
    });

    expect(second.caseId).toBe(first.caseId);
    expect(second.createdNewCase).toBe(false);
    expect(fake.db.crop_cases).toHaveLength(1);
    expect(fake.db.case_messages).toHaveLength(4);
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
    const errors: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((message?: unknown) => {
      if (typeof message === "string") errors.push(message);
    });
    fake.failNext.add("crop_cases");
    await expect(
      createCropCase({
        anonymousSessionId: GUEST_ID,
        message: "Second attempt",
      }),
    ).rejects.toBeInstanceOf(CasePersistenceError);
    errorSpy.mockRestore();
    expect(errors.some((line) => line.startsWith("CASE_PERSISTENCE_ERROR "))).toBe(
      true,
    );
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

  it("starts a new case when the farmer changes to cashflow and still persists guest data", async () => {
    const first = await persistConversationTurn({
      identity: guest(),
      userMessage: "Tomato wilt",
      assistantText: "Check the stem.",
      payload: payload(),
    });
    const second = await persistConversationTurn({
      identity: guest(),
      caseId: first.caseId,
      userMessage: "Help me make a cashflow for my farm",
      assistantText: "What crop or enterprise is this cashflow for?",
      payload: payload({
        preliminaryAssessment: "I can help you build a practical cashflow.",
        checksToday: [],
        safeActionsNow: [],
      }),
    });
    expect(second.createdNewCase).toBe(true);
    expect(second.caseId).not.toBe(first.caseId);
    expect(fake.db.crop_cases).toHaveLength(2);
    expect(fake.db.case_messages.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps guest photo records on the case", async () => {
    const persisted = await persistConversationTurn({
      identity: guest(),
      userMessage: "Here is a photo of the leaf.",
      assistantText: "The photo helps. I will look at the affected area.",
      payload: payload(),
      imageCount: 1,
    });
    await addCasePhoto({
      caseId: persisted.caseId,
      ownerSessionId: GUEST_ID,
      storagePath: `${GUEST_ID}/${persisted.caseId}/leaf.jpg`,
      mimeType: "image/jpeg",
      fileSizeBytes: 1200,
    });
    const photos = await listCasePhotos(persisted.caseId);
    expect(photos).toHaveLength(1);
    expect(photos[0]?.ownerSessionId).toBe(GUEST_ID);
    expect(photos[0]?.storagePath).toContain(persisted.caseId);
  });

  it("does not treat a rejected case as trusted similar knowledge", async () => {
    const rejected = await createCropCase({
      anonymousSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      message: "Cucumber leaf spots in Couva",
    });
    await updateCaseFromConversation(rejected.id, "incorrect", {
      agronomistReviewed: true,
      diagnosisConfirmed: false,
      knowledgeState: "rejected",
    });
    const trusted = await createCropCase({
      anonymousSessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      message: "Cucumber leaf spots in Couva after rain",
    });
    await updateCaseFromConversation(trusted.id, "reviewed", {
      agronomistReviewed: true,
      diagnosisConfirmed: true,
      knowledgeState: "validated",
    });
    const ranked = await getSimilarCases({
      country: "Trinidad and Tobago",
      district: "Couva",
      crop: "cucumber",
      symptoms: ["leaf spot"],
      problemCategory: "leaf_spot",
    });
    expect(ranked.some((item) => item.caseId === rejected.id)).toBe(false);
    expect(ranked[0]?.caseId).toBe(trusted.id);
  });

  it("does not create an established trend from one guest case", async () => {
    const created = await persistConversationTurn({
      identity: guest(),
      userMessage: "Cucumber leaves have spots in Couva",
      assistantText: "Check the underside of a few leaves.",
      payload: payload(),
    });
    const trend = await ingestCaseForTrends((await getCropCase(created.caseId))!);
    expect(trend).toBeNull();
    expect(await listCaseTrends()).toHaveLength(0);
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
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(resolveCasePersistenceMode()).toBe("memory");
  });

  it("never chooses memory when Supabase env vars are present, even on preview", () => {
    setCasePersistenceModeForTests(null);
    process.env.VERCEL_ENV = "preview";
    process.env.CASE_PERSISTENCE = "memory";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    expect(isProductionRuntime()).toBe(false);
    expect(isSupabaseAdminConfigured()).toBe(true);
    expect(resolveCasePersistenceMode()).toBe("supabase");
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
