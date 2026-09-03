import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildInsights, classifyTrend } from "@/lib/admin/insights";
import { applyCommercialSafetyGuards, extractKnownFacts } from "@/lib/agronomy/tomato-protocol";
import { shouldInvokeProductTool, shouldInvokeWeatherTool } from "@/lib/agronomy/tool-policy";
import { emptyRegionalContext, type AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import {
  evaluateUsage,
  getUsageLimits,
  GUEST_LIMIT_MESSAGE,
  setUsageLimitOverrides,
} from "@/lib/beta/limits";
import {
  evaluateConversationGate,
  persistConversationTurn,
} from "@/lib/beta/conversation";
import { grantEntitlement, resetEntitlements, resolveAccess } from "@/lib/beta/entitlements";
import { farmerFacingError } from "@/lib/beta/farmer-error";
import type { AppIdentity } from "@/lib/beta/identity";
import { isUuid } from "@/lib/beta/identity";
import { countUsage, resetUsageStore } from "@/lib/beta/usage-store";
import { extractStructuredFacts } from "@/lib/cases/extract";
import { shouldBlockDestructiveAction } from "@/lib/cases/destructive";
import { parseFollowUpOutcome, scheduleFollowUpDate } from "@/lib/cases/followups";
import { getSimilarCases } from "@/lib/cases/similar";
import {
  assertCaseOwned,
  canAccessPhoto,
  createCropCase,
  linkGuestCasesToUser,
  listCaseMessages,
  listFollowups,
  recordFollowupOutcome,
  resetCaseStore,
  addCaseFollowup,
  addCasePhoto,
  updateCaseFromConversation,
} from "@/lib/cases/store";
import { getMainWebsiteUrl } from "@/lib/config/urls";
import {
  CONTROLLED_BETA_PROMO_CODE,
  redeemPromoCode,
  resetPromoStore,
  validatePromoCode,
} from "@/lib/promo/server";
import {
  getVerifiedRegionalInputs,
  resetCatalogueStoreToSeed,
} from "@/lib/regional-inputs/catalogue";
import { NO_VERIFIED_PRODUCT_MESSAGE } from "@/lib/regional-inputs/types";
import {
  checkCombinedRateLimit,
  RATE_LIMITS,
  resetRateLimitStore,
} from "@/lib/security/rate-limit";

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

beforeEach(() => {
  resetCaseStore();
  resetUsageStore();
  resetPromoStore();
  resetEntitlements();
  resetRateLimitStore();
  resetCatalogueStoreToSeed();
  setUsageLimitOverrides(null);
});

describe("controlled beta — farmer journey and safety", () => {
  it("1. guest can start without registration", () => {
    const identity = guest();
    expect(identity.kind).toBe("guest");
    const gate = evaluateConversationGate({ identity, next: "message" });
    expect(gate.ok).toBe(true);
  });

  it("2. home gardener language stays simple", () => {
    const facts = extractKnownFacts("My backyard tomato plants look sick");
    expect(facts.userType).toBe("home_gardener");
    const instructions = readFileSync(
      join(process.cwd(), "src/lib/agronomy/system-instructions.ts"),
      "utf8",
    );
    expect(instructions).toMatch(/short sentences/);
    expect(instructions).toMatch(/Do not talk down/);
  });

  it("3. commercial grower is recognised from acreage", () => {
    const facts = extractKnownFacts("My Ruby tomato in Couva is stunted across about 3 acres.");
    expect(facts.userType).toBe("commercial_grower");
    expect(facts.farmerScale).toBe("commercial");
    expect(facts.areaPlanted).toMatch(/3 acres/);
  });

  it("4. vague wilt does not trigger crop destruction", () => {
    const check = shouldBlockDestructiveAction({
      recommendation: "Dump the wilted plants and abandon the field.",
      observedFacts: ["plants are wilting"],
      confidence: "unknown",
    });
    expect(check.blocked).toBe(true);
    expect(check.farmerMessage).toMatch(/Before removing plants/);

    const guarded = applyCommercialSafetyGuards(
      payload({
        stage: "questioning",
        preliminaryAssessment: "Plants are wilting.",
        safeActionsNow: ["Destroy all wilted plants now"],
      }),
      {
        mode: "quick_help",
        questionsAskedBeforeThisTurn: 0,
        knownFacts: extractKnownFacts("My tomato plants are wilting"),
      },
    );
    expect(guarded.safeActionsNow.join(" ")).not.toMatch(/destroy all/i);
    expect(guarded.preliminaryAssessment).toMatch(/Before removing plants|wilting/i);
  });

  it("5. farmer image metadata is accepted and limited to 3", async () => {
    const { CASE_IMAGE_MAX_COUNT, validateCaseImageMeta } = await import(
      "@/lib/chat/case-images"
    );
    expect(CASE_IMAGE_MAX_COUNT).toBe(3);
    expect(
      validateCaseImageMeta({ name: "leaf.jpg", type: "image/jpeg", size: 120_000 }).ok,
    ).toBe(true);
  });

  it("6. saved images stay private and owner-scoped", () => {
    const record = createCropCase({
      anonymousSessionId: "11111111-1111-4111-8111-111111111111",
      message: "Tomato wilt",
    });
    const photo = addCasePhoto({
      caseId: record.id,
      ownerSessionId: record.anonymousSessionId,
      storagePath: `${record.anonymousSessionId}/${record.id}/a.jpg`,
      mimeType: "image/jpeg",
      fileSizeBytes: 1000,
    });
    expect(photo.publicUrl).toBeNull();
    expect(
      canAccessPhoto(photo, { anonymousSessionId: "22222222-2222-4222-8222-222222222222" }),
    ).toBe(false);
    expect(canAccessPhoto(photo, { anonymousSessionId: record.anonymousSessionId })).toBe(true);
  });

  it("7–8. structured case is created and updated from natural speech", () => {
    const facts = extractStructuredFacts(
      "My Ruby tomato in Couva is stunted across about 3 acres.",
    );
    expect(facts.crop).toBe("tomato");
    expect(facts.variety).toBe("Ruby");
    expect(facts.district).toBe("Couva");
    expect(facts.problemCategory).toBe("stunting");
    expect(facts.area).toMatch(/3 acres/);
    expect(facts.fieldDistribution).toBe("broad");

    const created = createCropCase({
      anonymousSessionId: "11111111-1111-4111-8111-111111111111",
      message: "My Ruby tomato in Couva is stunted across about 3 acres.",
    });
    const updated = updateCaseFromConversation(
      created.id,
      "The soil stays very wet after watering.",
    );
    expect(updated?.crop).toBe("tomato");
    expect(updated?.variety).toBe("Ruby");
    expect(updated?.district).toBe("Couva");
    expect(updated?.drainage).toMatch(/wet/i);
  });

  it("9. product lookup stays off for unrelated questions", () => {
    const facts = extractKnownFacts("Tomatoes stunted");
    expect(shouldInvokeProductTool(facts)).toBe(false);
  });

  it("10. farmer-facing product lookup rejects test catalogue records", () => {
    const hidden = getVerifiedRegionalInputs({
      country: "Trinidad and Tobago",
      crop: "tomato",
      issue: "whiteflies",
      forFarmerDisplay: true,
    });
    expect(hidden.options).toEqual([]);
    expect(hidden.unmatchedMessage).toBe(NO_VERIFIED_PRODUCT_MESSAGE);
  });

  it("11. country-specific product filtering still works on the internal catalogue", () => {
    const jamaica = getVerifiedRegionalInputs({
      country: "Jamaica",
      crop: "tomato",
      issue: "whiteflies",
      forFarmerDisplay: false,
    });
    expect(jamaica.options).toEqual([]);
    const trinidad = getVerifiedRegionalInputs({
      country: "Trinidad and Tobago",
      crop: "tomato",
      issue: "whiteflies",
      forFarmerDisplay: false,
    });
    expect(trinidad.options.length).toBeGreaterThan(0);
  });

  it("12. weather is used only when relevant", () => {
    expect(shouldInvokeWeatherTool(extractKnownFacts("What fertilizer should I buy?"))).toBe(
      false,
    );
    expect(
      shouldInvokeWeatherTool(extractKnownFacts("Leaf spots after heavy rain and humid weather")),
    ).toBe(true);
  });

  it("13–14. guest usage increments and hits configurable limits", () => {
    setUsageLimitOverrides({
      guest_max_messages: 2,
      guest_max_cases: 1,
      guest_max_image_analyses: 1,
    });
    const identity = guest();
    persistConversationTurn({
      identity,
      userMessage: "Tomato wilt",
      assistantText: "Let us check the stem.",
      payload: payload(),
    });
    expect(countUsage({ guestSessionId: identity.guestSessionId }).messages).toBe(1);
    persistConversationTurn({
      identity,
      userMessage: "Still wilting",
      assistantText: "Send a closer photo.",
      payload: payload(),
    });
    const gate = evaluateConversationGate({ identity, next: "message" });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe("guest_limit");
    expect(GUEST_LIMIT_MESSAGE).toMatch(/Create a free account/);
  });

  it("15–19. guest can register and guest cases link to the new account", () => {
    const identity = guest();
    const persisted = persistConversationTurn({
      identity,
      userMessage: "Tomato whiteflies",
      assistantText: "Look under the leaves.",
      payload: payload(),
    });
    const linked = linkGuestCasesToUser(identity.guestSessionId, "user-1");
    expect(linked).toBe(1);
    expect(assertCaseOwned(persisted.caseId, { userId: "user-1" })?.userId).toBe("user-1");
    expect(resolveAccess({ authUserId: "user-1" })).toBe("free_registered");
  });

  it("16–18. email / Google / Apple auth paths exist as relative routes", () => {
    const signup = readFileSync(join(process.cwd(), "src/app/api/auth/signup/route.ts"), "utf8");
    const signin = readFileSync(join(process.cwd(), "src/components/SignInForm.tsx"), "utf8");
    const callback = readFileSync(join(process.cwd(), "src/app/auth/callback/route.ts"), "utf8");
    expect(signup).toMatch(/signUp/);
    expect(signin).toMatch(/Continue with Google/);
    expect(signin).toMatch(/Continue with Apple/);
    expect(signin).toMatch(/signInWithOAuth/);
    expect(callback).toMatch(/exchangeCodeForSession/);
    expect(callback).not.toMatch(/vercel\.app/);
  });

  it("20. registered free limit is larger than guest and enforced", () => {
    const limits = getUsageLimits();
    expect(limits.registered_free_messages).toBeGreaterThan(limits.guest_max_messages);
    const decision = evaluateUsage({
      access: "free_registered",
      used: { messages: limits.registered_free_messages, cases: 0, imageAnalyses: 0 },
      next: "message",
    });
    expect(decision.ok).toBe(false);
    expect(decision.reason).toBe("registered_free_limit");
  });

  it("21–23. upgrade click is recorded and FVM promo is server-side only", () => {
    const { recordUsageEvent, funnelStats } = require("@/lib/beta/usage-store") as typeof import("@/lib/beta/usage-store");
    recordUsageEvent({
      guestSessionId: "11111111-1111-4111-8111-111111111111",
      authUserId: "user-1",
      kind: "upgrade_click",
      caseId: null,
    });
    expect(funnelStats().upgradeClicks).toBe(1);

    const clientChat = readFileSync(join(process.cwd(), "src/components/FarmerCaseChat.tsx"), "utf8");
    expect(clientChat).not.toMatch(/["']FVM["']/);
    expect(validatePromoCode("FVM").ok).toBe(true);
    expect(validatePromoCode("WRONG").ok).toBe(false);
    const redeemed = redeemPromoCode(CONTROLLED_BETA_PROMO_CODE, "user:user-1");
    expect(redeemed.ok).toBe(true);
    grantEntitlement("user:user-1", "promo", "promo");
    expect(resolveAccess({ authUserId: "user-1" })).toBe("promo");
  });

  it("24. follow-up outcome is stored", () => {
    const created = createCropCase({
      anonymousSessionId: "11111111-1111-4111-8111-111111111111",
      message: "Tomato leaf spot",
    });
    const follow = addCaseFollowup({
      caseId: created.id,
      userId: null,
      anonymousSessionId: created.anonymousSessionId,
      followUpDate: scheduleFollowUpDate("high"),
      askedAt: null,
      outcome: null,
      actionTaken: null,
      notes: null,
      followUpPhotoId: null,
      newSeverity: null,
      optedOut: false,
    });
    const saved = recordFollowupOutcome({
      followupId: follow.id,
      outcome: parseFollowUpOutcome("Improved")!,
      actionTaken: "Removed lower leaves",
      notes: "Looks better",
    });
    expect(saved?.outcome).toBe("improved");
    expect(saved?.actionTaken).toMatch(/Removed lower leaves/);
  });

  it("25–26. similar-case retrieval ranks reviewed/outcome cases higher", () => {
    const weak = createCropCase({
      anonymousSessionId: "a",
      message: "Tomato wilt in Couva",
    });
    const strong = createCropCase({
      anonymousSessionId: "b",
      message: "Tomato wilt in Couva after rain",
    });
    updateCaseFromConversation(strong.id, "reviewed", {
      agronomistReviewed: true,
      diagnosisConfirmed: true,
    });
    addCaseFollowup({
      caseId: strong.id,
      userId: null,
      anonymousSessionId: "b",
      followUpDate: new Date().toISOString(),
      askedAt: null,
      outcome: null,
      actionTaken: null,
      notes: null,
      followUpPhotoId: null,
      newSeverity: null,
      optedOut: false,
    });
    recordFollowupOutcome({
      followupId: listFollowups(strong.id)[0].id,
      outcome: "improved",
    });
    const ranked = getSimilarCases({
      country: "Trinidad and Tobago",
      district: "Couva",
      crop: "tomato",
      symptoms: ["wilting"],
      problemCategory: "wilting",
    });
    expect(ranked[0]?.caseId).toBe(strong.id);
    expect(ranked[0]?.score).toBeGreaterThan(
      ranked.find((item) => item.caseId === weak.id)?.score ?? 0,
    );
    expect(ranked[0]?.farmerFacingSummary).not.toMatch(/anonymousSessionId|user-|_@/);
  });

  it("27. admin insights aggregate cases", () => {
    persistConversationTurn({
      identity: guest(),
      userMessage: "Whiteflies on tomato in Couva",
      assistantText: "Check the underside of leaves.",
      payload: payload(),
    });
    const insights = buildInsights();
    expect(insights.activity.cases).toBe(1);
    expect(insights.agronomy.problemsByCrop[0]?.label).toBe("tomato");
  });

  it("28. /admin/insights is staff-protected", () => {
    const page = readFileSync(join(process.cwd(), "src/app/admin/insights/page.tsx"), "utf8");
    const api = readFileSync(join(process.cwd(), "src/app/api/admin/insights/route.ts"), "utf8");
    const middleware = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
    expect(page).toMatch(/getStaffSession/);
    expect(api).toMatch(/requireStaffApi/);
    expect(middleware).toMatch(/\/admin/);
  });

  it("29. one user cannot access another user's records", () => {
    const a = createCropCase({
      userId: "user-a",
      message: "Tomato wilt",
    });
    expect(assertCaseOwned(a.id, { userId: "user-b" })).toBeNull();
    expect(assertCaseOwned(a.id, { userId: "user-a" })?.id).toBe(a.id);
  });

  it("30. rate limiting functions", () => {
    const first = checkCombinedRateLimit({
      rule: { ...RATE_LIMITS.promo, max: 1 },
      sessionId: "s1",
      ip: "1.1.1.1",
    });
    const second = checkCombinedRateLimit({
      rule: { ...RATE_LIMITS.promo, max: 1 },
      sessionId: "s1",
      ip: "1.1.1.1",
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  it("31–32. OpenAI and service-role keys are absent from client files", () => {
    const clientFiles = [
      "src/components/FarmerCaseChat.tsx",
      "src/components/GuestAIChat.tsx",
      "src/components/SignInForm.tsx",
      "src/app/page.tsx",
      "src/lib/supabase/client.ts",
    ];
    for (const file of clientFiles) {
      const text = readFileSync(join(process.cwd(), file), "utf8");
      expect(text).not.toMatch(/OPENAI_API_KEY/);
      expect(text).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(text).not.toMatch(/sk-[A-Za-z0-9]/);
    }
  });

  it("33. mobile/safe-area classes are present", () => {
    const chat = readFileSync(join(process.cwd(), "src/components/FarmerCaseChat.tsx"), "utf8");
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(chat).toMatch(/h-dvh/);
    expect(chat).toMatch(/safe-area-inset-bottom/);
    expect(chat).toMatch(/min-h-11/);
    expect(layout).toMatch(/overflow-x-hidden/);
    expect(layout).toMatch(/viewportFit/);
  });

  it("34. root route serves the guest chat", () => {
    const page = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
    expect(page).toMatch(/GuestAIChat/);
  });

  it("35. production build config stays relative and domain-agnostic", () => {
    expect(getMainWebsiteUrl()).toMatch(/farmersvaluemart\.com/);
    const chat = readFileSync(join(process.cwd(), "src/components/FarmerCaseChat.tsx"), "utf8");
    expect(chat).toMatch(/fetch\("\/api\/ai\/case"/);
    expect(chat).not.toMatch(/vercel\.app/);
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
  });

  it("persists conversation messages for a crop case", () => {
    const persisted = persistConversationTurn({
      identity: guest(),
      userMessage: "Celery leaf spot after humid weather",
      assistantText: "Check the lower leaves.",
      payload: payload(),
    });
    expect(listCaseMessages(persisted.caseId)).toHaveLength(2);
  });

  it("does not stop an active diagnostic case solely because the limit is reached", () => {
    setUsageLimitOverrides({ guest_max_messages: 1, guest_max_cases: 1, guest_max_image_analyses: 1 });
    const identity = guest();
    persistConversationTurn({
      identity,
      userMessage: "Urgent wilt across the field",
      assistantText: "Check the stem first.",
      payload: payload({ severity: "high", stage: "questioning" }),
    });
    const gate = evaluateConversationGate({ identity, next: "message" });
    expect(gate.ok).toBe(false);
    expect(gate.allowFinishActiveCase).toBe(true);
  });

  it("maps technical failures to a simple farmer error", () => {
    expect(farmerFacingError("OPENAI_API_KEY missing")).toMatch(/trouble with that right now/i);
  });

  it("never classifies a verified outbreak from AI counts alone", () => {
    expect(
      classifyTrend({
        currentCount: 20,
        previousCount: 1,
        sameDistrict: true,
      }),
    ).not.toBe("verified_outbreak");
  });
});
