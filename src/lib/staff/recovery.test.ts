import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isRecoverySearchParams,
  isStaffRecoveryApiPath,
  isStaffRecoveryPath,
  parseRecoveryHash,
  shouldRedirectToStaffReset,
  staffRecoveryRedirectTo,
  staffResetLocation,
  validateStaffPassword,
} from "@/lib/staff/recovery";

describe("staff password recovery", () => {
  it("sends recovery hashes that landed on the farmer home to the staff reset page", () => {
    expect(
      shouldRedirectToStaffReset({
        pathname: "/",
        search: new URLSearchParams(),
        hash: "#access_token=aaa&refresh_token=bbb&type=recovery",
      }),
    ).toBe(true);
    expect(
      staffResetLocation("", "#access_token=aaa&type=recovery"),
    ).toBe("/admin/reset-password#access_token=aaa&type=recovery");
    expect(parseRecoveryHash("#type=recovery&access_token=aaa").type).toBe("recovery");
  });

  it("does not steal farmer magic-link or ordinary home visits", () => {
    expect(
      shouldRedirectToStaffReset({
        pathname: "/signin",
        search: new URLSearchParams("mode=reset"),
        hash: "#access_token=aaa&type=recovery",
      }),
    ).toBe(false);
    expect(
      shouldRedirectToStaffReset({
        pathname: "/",
        search: new URLSearchParams(),
        hash: "",
      }),
    ).toBe(false);
    expect(
      shouldRedirectToStaffReset({
        pathname: "/admin/reset-password",
        search: new URLSearchParams("type=recovery"),
        hash: "",
      }),
    ).toBe(false);
  });

  it("treats token_hash recovery query params as staff reset", () => {
    const search = new URLSearchParams("token_hash=abc&type=recovery");
    expect(isRecoverySearchParams(search)).toBe(true);
    expect(isStaffRecoveryPath("/admin/reset-password")).toBe(true);
    expect(isStaffRecoveryApiPath("/api/staff/recover")).toBe(true);
    expect(isStaffRecoveryApiPath("/api/staff/reset-password")).toBe(true);
  });

  it("validates the new password without exposing supabase wording", () => {
    expect(validateStaffPassword("short", "short").ok).toBe(false);
    expect(validateStaffPassword("longenough", "different")).toEqual({
      ok: false,
      error: "The two passwords do not match.",
    });
    expect(validateStaffPassword("longenough", "longenough")).toEqual({ ok: true });
  });

  it("builds the recovery redirect on the current Preview origin", () => {
    expect(
      staffRecoveryRedirectTo("https://fvmltd-farmer-assistant-nxmi-git-cursor-final-pre-6352bc-fvmltd.vercel.app"),
    ).toBe(
      "https://fvmltd-farmer-assistant-nxmi-git-cursor-final-pre-6352bc-fvmltd.vercel.app/admin/reset-password",
    );
  });

  it("keeps recovery off the farmer UI and callback does not complete farmer auth for recovery", () => {
    const farmerUi = [
      "src/components/FarmerCaseChat.tsx",
      "src/components/SignInForm.tsx",
      "src/components/FarmerAccountMenu.tsx",
    ]
      .map((file) => readFileSync(join(process.cwd(), file), "utf8"))
      .join("\n");
    expect(farmerUi).not.toMatch(/\/admin\/reset-password/);
    expect(farmerUi).not.toMatch(/Sign in to staff dashboard/);

    const callback = readFileSync(join(process.cwd(), "src/app/auth/callback/route.ts"), "utf8");
    expect(callback).toMatch(/type === "recovery"/);
    expect(callback).toMatch(/STAFF_RESET_PASSWORD_PATH/);
    expect(callback).toContain("if (isStaffRecovery) {");
    expect(callback).toContain("return NextResponse.redirect(resetUrl);");

    const login = readFileSync(
      join(process.cwd(), "src/components/staff/StaffLoginForm.tsx"),
      "utf8",
    );
    expect(login).toMatch(/Forgot password\?/);
    expect(login).toMatch(/STAFF_RECOVER_API_PATH/);

    const resetForm = readFileSync(
      join(process.cwd(), "src/components/staff/StaffResetPasswordForm.tsx"),
      "utf8",
    );
    expect(resetForm).toMatch(/STAFF_RESET_PASSWORD_API_PATH/);
    expect(resetForm).toMatch(/updateUser/);
  });
});
