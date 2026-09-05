import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import { emptyRegionalContext } from "@/lib/agronomy/case-schema";
import { runAgronomicCase } from "@/lib/agronomy/runCase";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { loadRegisteredFarmerContext } from "@/lib/beta/farmer-profile-context";
import type { AppIdentity } from "@/lib/beta/identity";
import { resetUsageStore } from "@/lib/beta/usage-store";
import { createFakeCaseSupabase } from "@/lib/cases/fake-supabase";
import {
  resetCaseStore,
  setCasePersistenceModeForTests,
  setCaseStoreAdminClientForTests,
} from "@/lib/cases/store";
import { FARMER_PERSISTENCE_DEGRADED } from "@/lib/beta/limits";
import { farmerPersistenceBanner } from "@/lib/chat/persistence-warning";
import { resetRateLimitStore } from "@/lib/security/rate-limit";

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    connection: vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/agronomy/runCase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agronomy/runCase")>(
    "@/lib/agronomy/runCase",
  );
  return {
    ...actual,
    runAgronomicCase: vi.fn(),
  };
});

vi.mock("@/lib/beta/auth-server", () => ({
  resolveIdentityFromRequest: vi.fn(),
}));

vi.mock("@/lib/beta/farmer-profile-context", () => ({
  loadRegisteredFarmerContext: vi.fn(async () => null),
}));

const GUEST_ID = "11111111-1111-4111-8111-111111111111";

function guestIdentity(): AppIdentity {
  return {
    kind: "guest",
    guestSessionId: GUEST_ID,
    authUserId: null,
    farmerProfileId: null,
    email: null,
    access: "guest",
  };
}

function casePayload(): AgronomicCasePayload {
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
  };
}

describe("POST /api/ai/case persistence", () => {
  const fake = createFakeCaseSupabase();
  const env = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, env);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.VERCEL_ENV = "production";
    fake.reset();
    resetCaseStore();
    resetUsageStore();
    resetRateLimitStore();
    setCaseStoreAdminClientForTests(fake);
    setCasePersistenceModeForTests("supabase");
    vi.mocked(resolveIdentityFromRequest).mockResolvedValue(guestIdentity());
    vi.mocked(loadRegisteredFarmerContext).mockResolvedValue(null);
    vi.mocked(runAgronomicCase).mockResolvedValue({
      ok: true,
      case: casePayload(),
      responseId: "resp_test_1",
      model: "gpt-4o",
      diagnosticCode: "AI_READY",
      requestCompleted: true,
      questionsAsked: 0,
    });
  });

  afterEach(() => {
    setCasePersistenceModeForTests(null);
    setCaseStoreAdminClientForTests(null);
    Object.assign(process.env, env);
    for (const key of Object.keys(process.env)) {
      if (!(key in env)) delete process.env[key];
    }
  });

  it("awaits one crop_cases insert and user + assistant case_messages inserts", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((message?: unknown) => {
      if (typeof message === "string") logs.push(message);
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/case", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "Tomato plants wilting in Couva after rain.",
          profile: { country: "Trinidad and Tobago", district: "Couva" },
        }),
      }),
    );

    spy.mockRestore();

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      caseId?: string;
      persistenceFailed?: boolean;
    };
    expect(body.caseId).toBeTruthy();
    expect(vi.mocked(runAgronomicCase).mock.calls).toHaveLength(1);

    const cropInserts = fake.db.crop_cases;
    const messageInserts = fake.db.case_messages;
    expect(cropInserts).toHaveLength(1);
    expect(messageInserts).toHaveLength(2);
    expect(cropInserts[0]?.id).toBe(body.caseId);
    expect(cropInserts[0]?.anonymous_session_id).toBe(GUEST_ID);
    expect(messageInserts.map((row) => row.role).sort()).toEqual(["assistant", "user"]);
    expect(messageInserts.every((row) => row.case_id === body.caseId)).toBe(true);

    expect(logs).toContain("CASE_PERSISTENCE_START");
    expect(logs).toContain("CASE_PERSISTENCE_SUPABASE");
    expect(logs).toContain(`CASE_CREATED id=${body.caseId}`);
    expect(logs).toContain(`CASE_MESSAGE_SAVED case=${body.caseId} role=user`);
    expect(logs).toContain(`CASE_MESSAGE_SAVED case=${body.caseId} role=assistant`);
    expect(body).toMatchObject({ persistenceFailed: false });
    expect(JSON.stringify(body)).not.toContain("Saving this chat");
    expect(
      farmerPersistenceBanner({
        persistenceFailed: body.persistenceFailed,
        caseId: body.caseId,
      }),
    ).toBeNull();
  });

  it("saves a registered farmer chat with user_id and no persistence warning", async () => {
    vi.mocked(resolveIdentityFromRequest).mockResolvedValue({
      kind: "registered",
      guestSessionId: GUEST_ID,
      authUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      farmerProfileId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      email: "farmer@example.com",
      access: "free_registered",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/case", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "My celery is burning from the edges.",
          profile: { country: "Guyana" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      caseId?: string;
      persistenceFailed?: boolean;
      case?: unknown;
    };
    expect(body.case).toBeTruthy();
    expect(body.caseId).toBeTruthy();
    expect(body.persistenceFailed).toBe(false);
    expect(fake.db.crop_cases[0]?.user_id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(fake.db.case_messages).toHaveLength(2);
    expect(
      farmerPersistenceBanner({
        persistenceFailed: body.persistenceFailed,
        caseId: body.caseId,
      }),
    ).toBeNull();
  });

  it("reuses the same case_id on a follow-up turn", async () => {
    const { POST } = await import("./route");
    const first = await POST(
      new Request("http://localhost/api/ai/case", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "My celery is burning from the edges.",
          profile: { country: "Trinidad and Tobago" },
        }),
      }),
    );
    const firstBody = (await first.json()) as { caseId?: string };
    expect(firstBody.caseId).toBeTruthy();

    const second = await POST(
      new Request("http://localhost/api/ai/case", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "The soil stays wet after watering.",
          caseId: firstBody.caseId,
          profile: { country: "Trinidad and Tobago" },
        }),
      }),
    );
    const secondBody = (await second.json()) as {
      caseId?: string;
      persistenceFailed?: boolean;
    };
    expect(second.status).toBe(200);
    expect(secondBody.persistenceFailed).toBe(false);
    expect(secondBody.caseId).toBe(firstBody.caseId);
    expect(fake.db.crop_cases).toHaveLength(1);
    expect(fake.db.case_messages).toHaveLength(4);
  });

  it("returns the answer and a persistence flag when crop_cases insert fails", async () => {
    const errors: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(
        args
          .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
          .join(" "),
      );
    });
    fake.failNextInsert.add("crop_cases");

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/case", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "My lettuce has brown edges.",
        }),
      }),
    );
    errorSpy.mockRestore();

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      case?: unknown;
      caseId?: string | null;
      persistenceFailed?: boolean;
      correlationId?: string;
      error?: string;
    };
    expect(body.case).toBeTruthy();
    expect(body.caseId).toBeNull();
    expect(body.persistenceFailed).toBe(true);
    expect(body.correlationId).toBeUndefined();
    expect(body.error).toBeUndefined();
    expect(fake.db.crop_cases).toHaveLength(0);
    expect(errors.some((line) => line.startsWith("CASE_PERSISTENCE_ERROR "))).toBe(true);
    expect(errors.some((line) => line.includes("stage_failure") || line.includes("[ops]"))).toBe(
      true,
    );
    expect(errors.some((line) => /fvm_[a-z0-9]+_[a-z0-9]+/i.test(line))).toBe(true);
    expect(
      farmerPersistenceBanner({
        persistenceFailed: body.persistenceFailed,
        caseId: body.caseId,
      }),
    ).toBe(FARMER_PERSISTENCE_DEGRADED);
  });

  it("returns the answer and a persistence flag when case_messages insert fails", async () => {
    fake.failNext.add("case_messages");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/case", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "My lettuce has brown edges.",
        }),
      }),
    );
    const body = (await response.json()) as {
      case?: unknown;
      caseId?: string | null;
      persistenceFailed?: boolean;
    };
    expect(response.status).toBe(200);
    expect(body.case).toBeTruthy();
    expect(body.caseId).toBeNull();
    expect(body.persistenceFailed).toBe(true);
    expect(fake.db.case_messages).toHaveLength(0);
  });

  it("does not report a persistence failure when only enrichment writes fail", async () => {
    fake.failNext.add("case_followups");
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/case", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "My lettuce has brown edges.",
        }),
      }),
    );
    const body = (await response.json()) as {
      caseId?: string;
      persistenceFailed?: boolean;
      case?: unknown;
    };
    expect(response.status).toBe(200);
    expect(body.case).toBeTruthy();
    expect(body.caseId).toBeTruthy();
    expect(body.persistenceFailed).toBe(false);
    expect(fake.db.crop_cases).toHaveLength(1);
    expect(fake.db.case_messages).toHaveLength(2);
    expect(
      farmerPersistenceBanner({
        persistenceFailed: body.persistenceFailed,
        caseId: body.caseId,
      }),
    ).toBeNull();
  });

  it("returns a caseId when Preview crop_cases is missing later columns such as business_metadata", async () => {
    fake.schemaMissingColumns.add("business_metadata");
    fake.schemaMissingColumns.add("conversation_intent");
    fake.schemaMissingColumns.add("question_category");
    fake.schemaMissingColumns.add("calculation_type");
    fake.schemaMissingColumns.add("case_type");
    fake.schemaMissingColumns.add("knowledge_state");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/case", {
        method: "POST",
        headers: { "content-type": "application/json", "x-fvm-debug": "1" },
        body: JSON.stringify({
          message: "What pesticides are available in Trinidad and Tobago",
          profile: { country: "Trinidad and Tobago" },
        }),
      }),
    );
    warnSpy.mockRestore();

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      caseId?: string | null;
      persistenceFailed?: boolean;
      persistenceError?: string | null;
    };
    expect(body.caseId).toBeTruthy();
    expect(body.persistenceFailed).toBe(false);
    expect(fake.db.crop_cases).toHaveLength(1);
    expect(fake.db.case_messages).toHaveLength(2);
    expect(fake.db.crop_cases[0]).not.toHaveProperty("business_metadata");
    expect(
      farmerPersistenceBanner({
        persistenceFailed: body.persistenceFailed,
        caseId: body.caseId,
      }),
    ).toBeNull();
  });

  it("uses the registered farmer country on a new session without assuming Trinidad", async () => {
    vi.mocked(resolveIdentityFromRequest).mockResolvedValue({
      kind: "registered",
      guestSessionId: GUEST_ID,
      authUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      farmerProfileId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      email: "farmer@example.com",
      access: "free_registered",
    });
    vi.mocked(loadRegisteredFarmerContext).mockResolvedValue({
      country: "Guyana",
      district: "Berbice",
      primaryCrops: ["celery"],
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/case", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "My celery is burning up.",
          profile: { country: "", district: "" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(loadRegisteredFarmerContext)).toHaveBeenCalledWith(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    const call = vi.mocked(runAgronomicCase).mock.calls.at(-1)?.[0] as {
      profile?: {
        country?: string | null;
        district?: string | null;
        locationConfidence?: string | null;
      };
    };
    expect(call.profile?.country).toBe("Guyana");
    expect(call.profile?.district).toBe("Berbice");
    expect(call.profile?.locationConfidence).toBe("profile_confirmed");
  });

  it("starts a guest session with unknown country", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/case", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "My lettuce has brown edges.",
          profile: { country: "", district: "" },
        }),
      }),
    );
    expect(response.status).toBe(200);
    const call = vi.mocked(runAgronomicCase).mock.calls.at(-1)?.[0] as {
      profile?: { country?: string | null; locationConfidence?: string | null };
    };
    expect(call.profile?.country).toBeNull();
    expect(call.profile?.locationConfidence).toBe("unknown");
  });

  it("does not carry a previous crop's country into a guest topic switch", async () => {
    const { POST } = await import("./route");
    const first = await POST(
      new Request("http://localhost/api/ai/case", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "I'm in Trinidad. My celery is burning from the edges.",
          profile: { country: "Trinidad and Tobago" },
        }),
      }),
    );
    const firstBody = (await first.json()) as { caseId?: string };
    expect(firstBody.caseId).toBeTruthy();

    const second = await POST(
      new Request("http://localhost/api/ai/case", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "My lettuce has brown edges.",
          caseId: firstBody.caseId,
          profile: { country: "", district: "" },
        }),
      }),
    );
    expect(second.status).toBe(200);
    const call = vi.mocked(runAgronomicCase).mock.calls.at(-1)?.[0] as {
      profile?: { country?: string | null };
      history?: unknown[];
      activeCase?: { crop?: string | null } | null;
    };
    expect(call.profile?.country).toBeNull();
    expect(call.history ?? []).toEqual([]);
    expect(call.activeCase).toBeNull();
  });

  it("fills an empty profile from the guest's last known country", async () => {
    const { POST } = await import("./route");
    const first = await POST(
      new Request("http://localhost/api/ai/case", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "My celery leaves are yellow in Guyana.",
          profile: { country: "Guyana", district: "Berbice" },
        }),
      }),
    );
    expect(first.status).toBe(200);

    vi.mocked(runAgronomicCase).mockClear();
    const second = await POST(
      new Request("http://localhost/api/ai/case", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "Help me prepare a cashflow for the bank",
          profile: {},
        }),
      }),
    );
    expect(second.status).toBe(200);
    expect(vi.mocked(runAgronomicCase).mock.calls).toHaveLength(1);
    const options = vi.mocked(runAgronomicCase).mock.calls[0]?.[0] as {
      profile?: { country?: string | null; district?: string | null };
    };
    expect(options.profile?.country).toBe("Guyana");
    expect(options.profile?.district).toBe("Berbice");
  });
});
