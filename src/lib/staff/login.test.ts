import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyStaffRow } from "@/lib/staff/auth";
import {
  isStaffLoginApiPath,
  isStaffLoginPath,
  STAFF_DASHBOARD_LOGIN_PATH,
  STAFF_LOGIN_API_PATH,
} from "@/lib/staff/login-path";
import {
  classifyStaffLoginAttempt,
  detectWrongSupabaseEnvironment,
  isSessionAuthCookieName,
  PREVIEW_SUPABASE_HOST,
  PRODUCTION_SUPABASE_HOST,
  staffLoginPublicError,
  supabaseHostFromUrl,
  type StaffLoginAttemptSnapshot,
} from "@/lib/staff/login-stages";

const ACTIVE_ROW = {
  id: "staff-1",
  auth_user_id: "staff-user",
  full_name: "Ada",
  email: "ada@fvmltd.example",
  role: "agronomist",
  is_active: true,
};

function snapshot(
  overrides: Partial<StaffLoginAttemptSnapshot>,
): StaffLoginAttemptSnapshot {
  return {
    supabaseHost: PREVIEW_SUPABASE_HOST,
    vercelEnv: "preview",
    signInError: null,
    userId: "staff-user",
    hasSession: true,
    writtenCookieNames: [`sb-gcojtfrdjczrvzieynzj-auth-token`],
    cookieWriteError: null,
    hydratedUserId: "staff-user",
    staffLookupError: null,
    staffRowAuthUserId: "staff-user",
    staffActive: true,
    staffLinked: true,
    ...overrides,
  };
}

describe("staff login stage classification", () => {
  it("names invalid credentials separately from missing config", () => {
    expect(
      classifyStaffLoginAttempt(
        snapshot({ signInError: "Invalid login credentials", userId: null, hasSession: false }),
      ).stage,
    ).toBe("invalid_credentials");
    expect(staffLoginPublicError("invalid_credentials")).toBe(
      "Invalid email or password.",
    );
  });

  it("detects auth success without a user", () => {
    expect(
      classifyStaffLoginAttempt(snapshot({ userId: null })).stage,
    ).toBe("auth_success_no_user");
  });

  it("detects auth success without a session", () => {
    expect(
      classifyStaffLoginAttempt(snapshot({ hasSession: false })).stage,
    ).toBe("auth_success_no_session");
  });

  it("detects a missing session cookie on the Preview domain", () => {
    expect(
      classifyStaffLoginAttempt(
        snapshot({ writtenCookieNames: [], cookieWriteError: null }),
      ).stage,
    ).toBe("session_cookie_not_persisted");
    expect(isSessionAuthCookieName("sb-gcojtfrdjczrvzieynzj-auth-token.0")).toBe(
      true,
    );
    expect(isSessionAuthCookieName("sb-gcojtfrdjczrvzieynzj-auth-token-code-verifier")).toBe(
      false,
    );
  });

  it("detects staff lookup failure and inactive staff", () => {
    expect(
      classifyStaffLoginAttempt(
        snapshot({ staffLookupError: "relation staff_profiles does not exist" }),
      ).stage,
    ).toBe("staff_lookup_failed");
    expect(
      classifyStaffLoginAttempt(
        snapshot({ staffActive: false, staffLinked: false }),
      ).stage,
    ).toBe("staff_inactive");
  });

  it("flags Preview talking to Production Supabase", () => {
    expect(
      detectWrongSupabaseEnvironment({
        supabaseHost: PRODUCTION_SUPABASE_HOST,
        vercelEnv: "preview",
      }),
    ).toBe(true);
    expect(
      classifyStaffLoginAttempt(
        snapshot({
          supabaseHost: PRODUCTION_SUPABASE_HOST,
          staffLinked: false,
          staffActive: null,
          staffRowAuthUserId: null,
        }),
      ).stage,
    ).toBe("wrong_supabase_environment");
  });

  it("detects a hydrated session for a different user", () => {
    expect(
      classifyStaffLoginAttempt(
        snapshot({ hydratedUserId: "someone-else" }),
      ).stage,
    ).toBe("redirect_session_hydration");
  });

  it("completes when every stage matches the same staff auth user", () => {
    expect(classifyStaffLoginAttempt(snapshot({})).stage).toBe("complete");
  });

  it("parses the Preview Supabase host without leaking keys", () => {
    expect(
      supabaseHostFromUrl("https://gcojtfrdjczrvzieynzj.supabase.co"),
    ).toBe(PREVIEW_SUPABASE_HOST);
  });
});

describe("staff row mapping", () => {
  it("keeps auth_user_id as the staff link and rejects inactive rows", () => {
    expect(classifyStaffRow(ACTIVE_ROW, "staff-user").ok).toBe(true);
    expect(
      classifyStaffRow({ ...ACTIVE_ROW, is_active: false }, "staff-user"),
    ).toEqual({ ok: false, reason: "staff_inactive" });
    expect(classifyStaffRow(ACTIVE_ROW, "farmer-user")).toEqual({
      ok: false,
      reason: "staff_not_linked",
    });
  });

  it("accepts a matching Auth UUID and denies a farmer with no staff row", () => {
    const staffUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const farmerUuid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(
      classifyStaffRow(
        { ...ACTIVE_ROW, id: "row-1", auth_user_id: staffUuid },
        staffUuid,
      ).ok,
    ).toBe(true);
    expect(classifyStaffRow(null, farmerUuid)).toEqual({
      ok: false,
      reason: "staff_not_linked",
    });
    expect(
      classifyStaffRow(
        { ...ACTIVE_ROW, id: staffUuid, auth_user_id: null },
        staffUuid,
      ),
    ).toEqual({ ok: false, reason: "staff_not_linked" });
  });
});

describe("staff login route wiring", () => {
  it("keeps /admin/login public and posts to /api/staff/login", () => {
    expect(isStaffLoginPath(STAFF_DASHBOARD_LOGIN_PATH)).toBe(true);
    expect(isStaffLoginApiPath(STAFF_LOGIN_API_PATH)).toBe(true);

    const middleware = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
    expect(middleware).toMatch(/isStaffPublicPath/);

    const form = readFileSync(
      join(process.cwd(), "src/components/staff/StaffLoginForm.tsx"),
      "utf8",
    );
    expect(form).toMatch(/STAFF_LOGIN_API_PATH/);
    expect(form).toMatch(/PasswordField/);
    expect(form).toMatch(/window\.location\.assign/);
    expect(form).toMatch(/Forgot password\?/);
    expect(form).not.toMatch(/signInWithPassword/);

    const passwordField = readFileSync(
      join(process.cwd(), "src/components/PasswordField.tsx"),
      "utf8",
    );
    expect(passwordField).toMatch(/Show password/);
    expect(passwordField).toMatch(/Hide password/);
    expect(passwordField).toMatch(/useState\(false\)/);

    const client = readFileSync(join(process.cwd(), "src/lib/supabase/client.ts"), "utf8");
    expect(client).toMatch(/process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
    expect(client).toMatch(/process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    expect(client).not.toMatch(/getSupabasePublicEnv/);
  });
});
