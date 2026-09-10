import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import {
  evaluateUsage,
  FREE_LIMIT_HEADING,
  getUsageLimits,
  limitsForAccess,
  setUsageLimitOverrides,
} from "@/lib/beta/limits";
import { grantEntitlement, resetEntitlements, resolveAccess } from "@/lib/beta/entitlements";
import { claimGuestHistoryForUser } from "@/lib/beta/claim-guest";
import type { AppIdentity } from "@/lib/beta/identity";
import { persistConversationTurn } from "@/lib/beta/conversation";
import { emptyRegionalContext, type AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import {
  addCaseFollowup,
  addCasePhoto,
  assertCaseOwned,
  listCaseMessages,
  listFollowups,
  resetCaseStore,
  setCasePersistenceModeForTests,
} from "@/lib/cases/store";
import { scheduleFollowUpDate } from "@/lib/cases/followups";
import { countUsage, recordUsageEvent, resetUsageStore, transferGuestUsageToUser } from "@/lib/beta/usage-store";
import {
  CONTROLLED_BETA_PROMO_CODE,
  redeemPromoCode,
  resetPromoStore,
  validatePromoCode,
} from "@/lib/promo/server";
import { PROMO_LOGIN_REQUIRED } from "@/lib/promo/server";
import { listFarmerCases } from "@/lib/beta/account";
import { mapStaffUser } from "@/lib/staff/auth";

function guest(id = "11111111-1111-4111-8111-111111111111"): AppIdentity {
  return {
    kind: "guest",
    guestSessionId: id,
    authUserId: null,
    farmerProfileId: null,
    email: null,
    access: "guest",
  };
}

function payload(): AgronomicCasePayload {
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

beforeEach(() => {
  setCasePersistenceModeForTests("memory");
  resetCaseStore();
  resetUsageStore();
  resetPromoStore();
  resetEntitlements();
  setUsageLimitOverrides(null);
});

describe("farmer account / access flow", () => {
  it("guest can chat without login", async () => {
    const identity = guest();
    const persisted = await persistConversationTurn({
      identity,
      userMessage: "Tomato wilt after rain",
      assistantText: "Check the stem.",
      payload: payload(),
    });
    expect(persisted.createdNewCase).toBe(true);
    expect(await listCaseMessages(persisted.caseId)).toHaveLength(2);
    expect(identity.kind).toBe("guest");
  });

  it("farmer menu shows login and create account when logged out", () => {
    const chat = readFileSync(join(process.cwd(), "src/components/FarmerCaseChat.tsx"), "utf8");
    expect(chat).toMatch(/Continue as Guest/);
    expect(chat).toMatch(/>[\s]*Log in/);
    expect(chat).toMatch(/Create Free Account/);
    expect(chat).toMatch(/href="\/privacy"/);
    expect(chat).toMatch(/href="\/terms"/);
    expect(chat).not.toMatch(/\/staff\/login/);
    expect(chat).not.toMatch(/href="\/admin/);
  });

  it("farmer menu shows My Cases, Follow-ups, Account, and Log out when signed in", () => {
    const chat = readFileSync(join(process.cwd(), "src/components/FarmerCaseChat.tsx"), "utf8");
    expect(chat).toMatch(/My Cases/);
    expect(chat).toMatch(/Follow-ups/);
    expect(chat).toMatch(/href="\/account"/);
    expect(chat).toMatch(/Log out/);
  });

  it("email signup and login routes exist", () => {
    const signup = readFileSync(join(process.cwd(), "src/app/api/auth/signup/route.ts"), "utf8");
    const login = readFileSync(join(process.cwd(), "src/app/api/auth/login/route.ts"), "utf8");
    const logout = readFileSync(join(process.cwd(), "src/app/api/auth/logout/route.ts"), "utf8");
    expect(signup).toMatch(/signUp/);
    expect(login).toMatch(/signInWithPassword/);
    expect(logout).toMatch(/signOut/);
  });

  it("links guest cases, photos, follow-ups, and usage when creating an account", async () => {
    const identity = guest();
    const persisted = await persistConversationTurn({
      identity,
      userMessage: "Pepper leaf curl",
      assistantText: "Look under the leaves.",
      payload: payload(),
    });
    await addCasePhoto({
      caseId: persisted.caseId,
      ownerSessionId: identity.guestSessionId,
      storagePath: `${identity.guestSessionId}/${persisted.caseId}/leaf.jpg`,
      mimeType: "image/jpeg",
      fileSizeBytes: 1200,
    });
    await addCaseFollowup({
      caseId: persisted.caseId,
      userId: null,
      anonymousSessionId: identity.guestSessionId,
      followUpDate: scheduleFollowUpDate("medium"),
      askedAt: null,
      outcome: null,
      actionTaken: null,
      notes: null,
      followUpPhotoId: null,
      newSeverity: null,
      optedOut: false,
    });
    expect(countUsage({ guestSessionId: identity.guestSessionId }).messages).toBe(1);

    const linked = await claimGuestHistoryForUser(identity.guestSessionId, "user-linked");
    expect(linked.casesLinked).toBe(1);
    const owned = await assertCaseOwned(persisted.caseId, { userId: "user-linked" });
    expect(owned?.userId).toBe("user-linked");
    expect(owned?.anonymousSessionId).toBe(identity.guestSessionId);
    const follows = await listFollowups(persisted.caseId);
    expect(follows[0]?.userId).toBe("user-linked");
    expect(countUsage({ authUserId: "user-linked" }).messages).toBe(1);
    expect(await listCaseMessages(persisted.caseId)).toHaveLength(2);

    const again = await claimGuestHistoryForUser(identity.guestSessionId, "user-linked");
    expect(again.casesLinked).toBe(0);
  });

  it("does not show another user's cases in My Cases", async () => {
    const a = await persistConversationTurn({
      identity: { ...guest("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), authUserId: "user-a", kind: "registered", access: "free_registered" },
      userMessage: "My tomato is wilting",
      assistantText: "Check the stem.",
      payload: payload(),
    });
    await persistConversationTurn({
      identity: { ...guest("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"), authUserId: "user-b", kind: "registered", access: "free_registered" },
      userMessage: "Celery spots",
      assistantText: "Check the older leaves.",
      payload: payload(),
    });
    const mine = await listFarmerCases({
      kind: "registered",
      guestSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      authUserId: "user-a",
      farmerProfileId: null,
      email: "a@example.com",
      access: "free_registered",
    });
    expect(mine.map((item) => item.id)).toEqual([a.caseId]);
    expect(await assertCaseOwned(a.caseId, { userId: "user-b" })).toBeNull();
  });

  it("FVM promo redemption grants FVM Beta with configurable allowances", () => {
    const limits = getUsageLimits();
    expect(limits.fvm_beta_messages).toBe(500);
    expect(limits.fvm_beta_cases).toBe(50);
    expect(limits.fvm_beta_image_analyses).toBe(100);
    expect(limits.fvm_beta_voice_messages).toBe(100);
    expect(validatePromoCode("FVM").ok).toBe(true);
    const redeemed = redeemPromoCode(CONTROLLED_BETA_PROMO_CODE, "user:user-1");
    expect(redeemed.ok).toBe(true);
    if (!redeemed.ok) throw new Error("expected redeem");
    expect(redeemed.entitlement).toBe("fvm_beta");
    grantEntitlement("user:user-1", redeemed.entitlement, "promo");
    expect(resolveAccess({ authUserId: "user-1" })).toBe("fvm_beta");
    const caps = limitsForAccess("fvm_beta");
    expect(caps.messages).toBe(500);
    expect(caps.cases).toBe(50);
    expect(caps.imageAnalyses).toBe(100);
    expect(caps.voiceMessages).toBe(100);
  });

  it("rejects invalid promo codes and prevents reuse", () => {
    expect(validatePromoCode("WRONG").ok).toBe(false);
    const first = redeemPromoCode(CONTROLLED_BETA_PROMO_CODE, "user:user-1");
    expect(first.ok).toBe(true);
    const second = redeemPromoCode(CONTROLLED_BETA_PROMO_CODE, "user:user-1");
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error("expected reuse rejection");
    expect(second.reason).toBe("already_redeemed");
  });

  it("promo redemption requires a logged-in farmer", async () => {
    vi.resetModules();
    vi.doMock("@/lib/beta/auth-server", () => ({
      resolveIdentityFromRequest: vi.fn(async () => guest()),
    }));
    const { POST } = await import("@/app/api/promo/redeem/route");
    const response = await POST(
      new Request("http://localhost/api/promo/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "ANY" }),
      }),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error?: string; loginRequired?: boolean };
    expect(body.loginRequired).toBe(true);
    expect(body.error).toBe(PROMO_LOGIN_REQUIRED);
    vi.doUnmock("@/lib/beta/auth-server");
    vi.resetModules();
  });

  it("registered-free limits are enforced and FVM-beta limits are higher but finite", () => {
    const limits = getUsageLimits();
    const registered = evaluateUsage({
      access: "free_registered",
      used: { messages: limits.registered_free_messages, cases: 0, imageAnalyses: 0, voiceMessages: 0 },
      next: "message",
    });
    expect(registered.ok).toBe(false);
    const betaOk = evaluateUsage({
      access: "fvm_beta",
      used: { messages: limits.registered_free_messages, cases: 0, imageAnalyses: 0, voiceMessages: 0 },
      next: "message",
    });
    expect(betaOk.ok).toBe(true);
    const betaHit = evaluateUsage({
      access: "fvm_beta",
      used: { messages: limits.fvm_beta_messages, cases: 0, imageAnalyses: 0, voiceMessages: 0 },
      next: "message",
    });
    expect(betaHit.ok).toBe(false);
    if (betaHit.ok) throw new Error("expected fvm beta limit");
    expect(betaHit.reason).toBe("fvm_beta_limit");
    expect(FREE_LIMIT_HEADING).toBe("You've reached your free limit.");
  });

  it("admin access stays separate from farmer login", () => {
    const farmer = mapStaffUser(
      {
        id: "staff-1",
        auth_user_id: "other-staff",
        full_name: "Ada",
        email: "ada@fvmltd.example",
        role: "agronomist",
        is_active: true,
      },
      "farmer-user-id",
    );
    expect(farmer).toBeNull();

    const insights = readFileSync(join(process.cwd(), "src/app/admin/insights/page.tsx"), "utf8");
    const middleware = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
    const chat = readFileSync(join(process.cwd(), "src/components/FarmerCaseChat.tsx"), "utf8");
    expect(insights).toMatch(/getStaffSession/);
    expect(middleware).toMatch(/\/admin/);
    expect(chat).not.toMatch(/Staff sign in|\/staff\/login/);
  });

  it("farmer user cannot open the admin dashboard without staff_profiles", async () => {
    vi.resetModules();
    vi.doMock("@/lib/staff/auth", () => ({
      requireStaffApi: vi.fn(async () => ({
        ok: false,
        response: NextResponse.json(
          { error: "This account is not an active FVMLTD staff member." },
          { status: 403 },
        ),
      })),
    }));
    const { GET } = await import("@/app/api/admin/insights/route");
    const response = await GET(new Request("http://localhost/api/admin/insights"));
    expect(response.status).toBe(403);
    vi.doUnmock("@/lib/staff/auth");
    vi.resetModules();
  });

  it("voice and photo turns still persist with the crop case", async () => {
    const identity = guest();
    const photo = await persistConversationTurn({
      identity,
      userMessage: "Here is a leaf photo",
      assistantText: "I can see spotting on the older leaves.",
      payload: payload(),
      imageCount: 1,
      inputMode: "photo",
    });
    const voice = await persistConversationTurn({
      identity,
      caseId: photo.caseId,
      userMessage: "The spots are spreading",
      assistantText: "Keep the leaves dry tonight.",
      payload: payload(),
      inputMode: "voice",
    });
    expect(voice.caseId).toBe(photo.caseId);
    expect(await listCaseMessages(photo.caseId)).toHaveLength(4);
    expect(countUsage({ guestSessionId: identity.guestSessionId }).imageAnalyses).toBe(1);
    expect(countUsage({ guestSessionId: identity.guestSessionId }).voiceMessages).toBe(1);
  });

  it("does not put the promo code in client source", () => {
    const clientFiles = [
      "src/components/FarmerCaseChat.tsx",
      "src/components/LoginForm.tsx",
      "src/components/SignInForm.tsx",
      "src/components/AccountView.tsx",
    ];
    for (const file of clientFiles) {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      expect(text).not.toMatch(/["']FVM["']/);
      expect(text).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    }
  });

  it("usage transfer does not double-count after login", () => {
    const guestId = "11111111-1111-4111-8111-111111111111";
    recordUsageEvent({
      guestSessionId: guestId,
      authUserId: null,
      kind: "message",
      caseId: null,
    });
    transferGuestUsageToUser(guestId, "user-1");
    expect(countUsage({ guestSessionId: guestId, authUserId: "user-1" }).messages).toBe(1);
  });
});
