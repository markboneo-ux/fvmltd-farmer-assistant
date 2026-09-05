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
    const body = (await response.json()) as { caseId?: string };
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
});
