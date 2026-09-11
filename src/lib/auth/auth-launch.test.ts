import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  alreadyConfirmedResendError,
  classifySignUpData,
  EXISTING_ACCOUNT_MESSAGE,
  ghostResendDecision,
  isGhostExistingSignUp,
} from "@/lib/auth/signup-outcome";
import { farmerAuthError } from "@/lib/auth/farmer-auth-error";
import { authorizeStaffRecord } from "@/lib/staff/authorize";
import { isStaffPublicPath, STAFF_LOGIN_API_PATH } from "@/lib/staff/login-path";
import { safeStaffNextPath } from "@/lib/staff/next-path";

describe("existing signup classification", () => {
  it("treats empty identities and no session as a ghost existing account", () => {
    expect(isGhostExistingSignUp({ user: { identities: [] }, session: null })).toBe(true);
    expect(isGhostExistingSignUp({ user: { identities: null }, session: null })).toBe(true);
    expect(
      classifySignUpData({
        user: { identities: [{ id: "ident-1" }] },
        session: null,
      }),
    ).toBe("new_unverified");
    expect(
      classifySignUpData({
        user: { identities: [] },
        session: { access_token: "x" },
      }),
    ).toBe("authenticated");
  });

  it("sends already-confirmed resend errors to password login, not OTP", () => {
    expect(alreadyConfirmedResendError({ message: "Email already confirmed" })).toBe(true);
    expect(ghostResendDecision({ message: "Email already confirmed" })).toBe("verified");
    expect(ghostResendDecision(null)).toBe("unverified");
    expect(ghostResendDecision({ message: "over_email_send_rate_limit", status: 429 })).toBe(
      "rate_limited",
    );
    expect(farmerAuthError({ message: "User already registered" }).message).toBe(
      EXISTING_ACCOUNT_MESSAGE,
    );
  });
});

describe("staff login path", () => {
  const staffLogin = readFileSync(join(process.cwd(), "src/components/staff/StaffLoginForm.tsx"), "utf8");
  const staffLoginApi = readFileSync(join(process.cwd(), "src/app/api/staff/login/route.ts"), "utf8");
  const staffLoginHelper = readFileSync(join(process.cwd(), "src/lib/staff/login.ts"), "utf8");
  const middleware = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
  const client = readFileSync(join(process.cwd(), "src/lib/supabase/client.ts"), "utf8");

  it("authenticates staff on the server, not with the browser Supabase client", () => {
    expect(staffLogin).toMatch(/STAFF_LOGIN_API_PATH/);
    expect(staffLogin).not.toMatch(/createClient/);
    expect(staffLogin).toMatch(/window\.location\.assign/);
    expect(staffLogin).toMatch(/PasswordField/);
    expect(staffLoginApi).toMatch(/staffPasswordLogin/);
    expect(staffLoginHelper).toMatch(/signInWithPassword/);
    expect(staffLoginHelper).toMatch(/lookupStaffRowForAuthUser/);
    expect(staffLoginHelper).toMatch(/signOut/);
    expect(isStaffPublicPath(STAFF_LOGIN_API_PATH)).toBe(true);
    expect(middleware).toMatch(/isStaffLoginApiPath/);
    expect(safeStaffNextPath("/admin/insights")).toBe("/admin/insights");
    expect(client).toMatch(/process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
  });
});

describe("farmer password visibility and existing-account OTP", () => {
  const form = readFileSync(join(process.cwd(), "src/components/SignInForm.tsx"), "utf8");
  const passwordField = readFileSync(join(process.cwd(), "src/components/PasswordField.tsx"), "utf8");
  const signup = readFileSync(join(process.cwd(), "src/app/api/auth/signup/route.ts"), "utf8");
  const verify = readFileSync(join(process.cwd(), "src/app/api/auth/verify/route.ts"), "utf8");
  const resend = readFileSync(join(process.cwd(), "src/app/api/auth/resend/route.ts"), "utf8");

  it("defaults password fields to hidden and offers a show/hide toggle", () => {
    expect(passwordField).toMatch(/useState\(false\)/);
    expect(passwordField).toMatch(/Show password/);
    expect(passwordField).toMatch(/Hide password/);
    expect(form).toMatch(/id="signup-password"/);
    expect(form).toMatch(/id="login-password"/);
    expect(form).toMatch(/id="reset-password"/);
    expect(form).not.toMatch(/type="password"/);
  });

  it("does not send an existing verified account into a signup OTP screen", () => {
    expect(signup).toMatch(/classifyExistingEmail/);
    expect(signup).toMatch(/ghost_existing/);
    expect(signup).toMatch(/EXISTING_ACCOUNT_MESSAGE/);
    expect(form).toMatch(/existing_account/);
    expect(form).toMatch(/setMode\("login"\)/);
    expect(form).toMatch(/Forgot password\?/);
    expect(form).toMatch(/EXISTING_ACCOUNT_MESSAGE/);
  });

  it("clears OTP digits, waits before another resend, and maps rate limits", () => {
    expect(form).toMatch(/setCode\(\[\.\.\.EMPTY_OTP\]\)/);
    expect(form).toMatch(/Resend code in \$\{resendWaitSec\}s/);
    expect(form).toMatch(/OTP_RESEND_WAIT_MESSAGE/);
    expect(resend).toMatch(/OTP_RESEND_WAIT_MESSAGE/);
    expect(farmerAuthError({ message: "For security purposes, you can only request this after 60 seconds." }).code).toBe(
      "rate_limited",
    );
  });

  it("establishes a session after verification and hard-redirects into the farmer app", () => {
    expect(verify).toMatch(/sessionEstablished/);
    expect(form).toMatch(/window\.location\.assign\("\/"\)/);
    expect(form).not.toMatch(/router\.push/);
  });
});

describe("staff UUID diagnostic", () => {
  it("staff UUID matching an active row succeeds; farmer UUID with no row is denied", () => {
    const staffId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const farmerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const staff = authorizeStaffRecord(staffId, {
      id: "row-1",
      auth_user_id: staffId,
      full_name: "Staff Member",
      email: "staff@fvmltd.example",
      role: "admin",
      is_active: true,
    });
    expect(staff).toEqual({
      ok: true,
      staff: {
        id: "row-1",
        authUserId: staffId,
        fullName: "Staff Member",
        email: "staff@fvmltd.example",
        role: "admin",
        isActive: true,
      },
    });
    expect(authorizeStaffRecord(farmerId, null)).toEqual({
      ok: false,
      reason: "missing_staff_row",
    });
  });
});
