import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  detectRecoveryLinkFormat,
  isRecoverySearchParams,
  isStaffRecoveryApiPath,
  isStaffRecoveryPath,
  parseRecoveryHash,
  recoveryHydrateBodyFromLocation,
  shouldRedirectToStaffReset,
  staffRecoveryRedirectTo,
  staffResetForwardUrl,
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
    expect(
      shouldRedirectToStaffReset({
        pathname: "/auth/callback",
        search: new URLSearchParams("code=abc"),
        hash: "",
      }),
    ).toBe(false);
  });

  it("detects code, token_hash, and hash-token recovery formats", () => {
    expect(
      detectRecoveryLinkFormat({
        search: new URLSearchParams("code=abc"),
        hash: "",
      }),
    ).toBe("pkce_code");
    expect(
      detectRecoveryLinkFormat({
        search: new URLSearchParams("token_hash=abc&type=recovery"),
        hash: "",
      }),
    ).toBe("token_hash");
    expect(
      detectRecoveryLinkFormat({
        search: new URLSearchParams(),
        hash: "#access_token=aaa&refresh_token=bbb&type=recovery",
      }),
    ).toBe("hash_tokens");
    expect(
      recoveryHydrateBodyFromLocation({
        search: new URLSearchParams("token_hash=abc&type=recovery"),
        hash: "",
      }).token_hash,
    ).toBe("abc");
    expect(isRecoverySearchParams(new URLSearchParams("token_hash=abc&type=recovery"))).toBe(
      true,
    );
    expect(isStaffRecoveryPath("/admin/reset-password")).toBe(true);
    expect(isStaffRecoveryApiPath("/api/staff/recover")).toBe(true);
    expect(isStaffRecoveryApiPath("/api/staff/reset-password")).toBe(true);
    expect(isStaffRecoveryApiPath("/api/staff/preview-diagnostics")).toBe(true);
  });

  it("forwards callback params to the staff reset page without exchanging them", () => {
    expect(
      staffResetForwardUrl(
        "https://preview.example",
        new URLSearchParams("token_hash=abc&type=recovery"),
      ),
    ).toBe("https://preview.example/admin/reset-password?token_hash=abc&type=recovery");
    expect(
      staffResetForwardUrl(
        "https://preview.example",
        new URLSearchParams("code=pkce-code&type=recovery"),
      ),
    ).toBe("https://preview.example/admin/reset-password?code=pkce-code&type=recovery");
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

  it("keeps recovery off the farmer UI and does not consume staff tokens in the callback", () => {
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
    expect(callback).toMatch(/staffResetForwardUrl/);
    expect(callback).toMatch(/isStaffRecovery/);
    expect(callback).toContain("Do not consume staff recovery tokens here.");
    expect(callback).toMatch(/exchangeCodeForSession/);

    const recover = readFileSync(join(process.cwd(), "src/app/api/staff/recover/route.ts"), "utf8");
    expect(recover).toMatch(/createImplicitAuthClient/);
    expect(recover).not.toMatch(/from \"@\/lib\/supabase\/server\"/);
    expect(recover).toMatch(/flowType: \"implicit\"/);

    const implicit = readFileSync(join(process.cwd(), "src/lib/supabase/implicit.ts"), "utf8");
    expect(implicit).toMatch(/flowType: \"implicit\"/);

    const farmerReset = readFileSync(
      join(process.cwd(), "src/app/api/auth/forgot-password/route.ts"),
      "utf8",
    );
    expect(farmerReset).toMatch(/createClient/);
    expect(farmerReset).toMatch(/\/signin\?mode=reset/);

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
    expect(resetForm).toMatch(/inspect_only/);
    expect(resetForm).toMatch(/Continue to set password/);
    expect(resetForm).not.toMatch(/exchangeCodeForSession/);
  });
});
