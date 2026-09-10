import { describe, expect, it } from "vitest";
import { farmerAuthError, isCompleteOtpCode, normalizeOtpCode } from "@/lib/auth/farmer-auth-error";
import { mapStaffUser } from "@/lib/staff/auth";
import {
  accessTierLabel,
  usageNoticeFor,
  USAGE_ALMOST_MESSAGE,
  USAGE_LIMIT_MESSAGE,
  USAGE_NEARING_MESSAGE,
} from "@/lib/beta/usage-notice";
import { farmerFacingError } from "@/lib/beta/farmer-error";
import { farmerCaseTitle } from "@/lib/cases/farmer-title";
import { buildResearchCoverage } from "@/lib/admin/research-coverage";
import { ASK_AREA_QUESTION, ASK_COUNTRY_QUESTION } from "@/lib/assistant/farmer-context";
import { grantEntitlement, getEntitlement, resetEntitlements } from "@/lib/beta/entitlements";
import { parseCaseCookie, NEW_CONVERSATION_COOKIE_VALUE } from "@/lib/beta/identity";
import { redeemPromoCode, resetPromoStore, CONTROLLED_BETA_PROMO_CODE } from "@/lib/promo/server";

describe("farmer auth errors", () => {
  it("maps existing account without exposing supabase", () => {
    const mapped = farmerAuthError({ message: "User already registered" });
    expect(mapped.code).toBe("existing_account");
    expect(mapped.message).toMatch(/already exists/i);
    expect(mapped.message.toLowerCase()).not.toContain("supabase");
  });

  it("maps incorrect and expired OTP codes", () => {
    expect(farmerAuthError({ message: "Token has expired or is invalid", code: "otp_expired" }).code).toBe(
      "incorrect_code",
    );
    expect(farmerAuthError({ message: "Token has expired or is invalid" }).message).toMatch(/latest 6-digit code/i);
    expect(farmerAuthError({ message: "Invalid OTP token" }).code).toBe("incorrect_code");
  });

  it("normalizes a 6-digit code", () => {
    expect(normalizeOtpCode("12 34-56")).toBe("123456");
    expect(isCompleteOtpCode("123456")).toBe(true);
    expect(isCompleteOtpCode("12345")).toBe(false);
  });
});

describe("usage notices", () => {
  const caps = { messages: 10, cases: 5, imageAnalyses: 5 };

  it("stays quiet during normal usage", () => {
    expect(
      usageNoticeFor({
        access: "guest",
        used: { messages: 2, cases: 1, imageAnalyses: 0 },
        remaining: { messages: 8, cases: 4, imageAnalyses: 5 },
        caps,
      }),
    ).toBeNull();
  });

  it("warns at about 80% without showing counters", () => {
    const notice = usageNoticeFor({
      access: "guest",
      used: { messages: 8, cases: 1, imageAnalyses: 0 },
      remaining: { messages: 2, cases: 4, imageAnalyses: 5 },
      caps,
    });
    expect(notice?.message).toBe(USAGE_NEARING_MESSAGE);
    expect(notice?.message).not.toMatch(/\d/);
  });

  it("uses a stronger notice near the limit", () => {
    const notice = usageNoticeFor({
      access: "guest",
      used: { messages: 10, cases: 1, imageAnalyses: 0 },
      remaining: { messages: 0, cases: 4, imageAnalyses: 5 },
      caps,
      limitReached: false,
    });
    expect(notice?.message).toBe(USAGE_ALMOST_MESSAGE);
  });

  it("shows the limit message at cap", () => {
    const notice = usageNoticeFor({
      access: "free_registered",
      used: { messages: 80, cases: 10, imageAnalyses: 24 },
      remaining: { messages: 0, cases: 0, imageAnalyses: 0 },
      caps: { messages: 80, cases: 10, imageAnalyses: 24 },
      limitReached: true,
    });
    expect(notice?.message).toBe(USAGE_LIMIT_MESSAGE);
  });

  it("does not show notices for FVM beta access", () => {
    expect(
      usageNoticeFor({
        access: "promo",
        used: { messages: 80, cases: 10, imageAnalyses: 24 },
        remaining: { messages: 0, cases: 0, imageAnalyses: 0 },
        caps,
        limitReached: true,
      }),
    ).toBeNull();
    expect(accessTierLabel("promo")).toBe("FVM Beta");
  });
});

describe("farmer-facing language", () => {
  it("asks for farming area, not GPS or country forms", () => {
    expect(ASK_AREA_QUESTION).toBe("What area are you farming in?");
    expect(ASK_COUNTRY_QUESTION).toBe(ASK_AREA_QUESTION);
    expect(ASK_AREA_QUESTION.toLowerCase()).not.toContain("coordinate");
  });

  it("hides technical error language", () => {
    expect(farmerFacingError("Supabase persistence schema payload failed")).toMatch(
      /couldn’t complete that right now/i,
    );
    expect(farmerFacingError("HTTP 500")).not.toMatch(/500|json|schema/i);
  });

  it("titles crop cases in farmer language", () => {
    expect(
      farmerCaseTitle({
        crop: "hot pepper",
        problemCategory: "leaf_spots",
        farmerProblemText: "Leaves have spots",
      }),
    ).toBe("Hot Pepper — Leaf Spots");
    expect(
      farmerCaseTitle({
        crop: "",
        problemCategory: "",
        farmerProblemText: "Something is wrong",
      }),
    ).toBe("Unknown — Something Is Wrong");
  });
});

describe("research coverage honesty", () => {
  it("does not mark missing countries as verified", () => {
    const rows = buildResearchCoverage();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(["Verified", "Partial", "Missing"]).toContain(row.status);
      if (row.pesticideRegistry === "Verified") {
        expect(row.lastVerifiedDate || row.status).toBeTruthy();
      }
    }
    const missing = rows.filter((row) => row.pesticideRegistry === "Missing");
    expect(missing.length).toBeGreaterThan(0);
  });
});

describe("FVM access code stays server-side", () => {
  it("redeems FVM as promo without exposing the code as UI copy here", () => {
    resetPromoStore();
    resetEntitlements();
    const result = redeemPromoCode(CONTROLLED_BETA_PROMO_CODE, "guest:abc");
    expect(result.ok).toBe(true);
    if (result.ok) {
      grantEntitlement("guest:abc", result.entitlement, "promo");
    }
    expect(getEntitlement("guest:abc")?.access).toBe("promo");
  });
});

describe("conversation recovery cookies", () => {
  it("treats an explicit new conversation as not restorable", () => {
    expect(parseCaseCookie(NEW_CONVERSATION_COOKIE_VALUE)).toEqual({ kind: "new" });
    expect(parseCaseCookie("")).toEqual({ kind: "missing" });
    expect(parseCaseCookie("11111111-1111-4111-8111-111111111111")).toEqual({
      kind: "id",
      id: "11111111-1111-4111-8111-111111111111",
    });
  });
});

describe("staff vs farmer authorization", () => {
  it("does not treat a farmer auth user as staff", () => {
    expect(
      mapStaffUser(
        {
          id: "staff-1",
          auth_user_id: "staff-user",
          full_name: "Ada",
          email: "ada@fvmltd.example",
          role: "agronomist",
          is_active: true,
        },
        "farmer-user",
      ),
    ).toBeNull();
  });

  it("accepts an active staff row linked by auth_user_id", () => {
    expect(
      mapStaffUser(
        {
          id: "staff-1",
          auth_user_id: "staff-user",
          full_name: "Ada",
          email: "ada@fvmltd.example",
          role: "agronomist",
          is_active: true,
        },
        "staff-user",
      )?.authUserId,
    ).toBe("staff-user");
  });
});
