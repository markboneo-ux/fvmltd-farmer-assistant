import { describe, expect, it } from "vitest";
import {
  classifyStaffLookupError,
  sanitizeLookupError,
} from "@/lib/staff/lookup-error";
import {
  pkceVerifierCookieName,
  projectRefFromJwt,
  projectRefFromSupabaseUrl,
} from "@/lib/supabase/project-ref";
import { classifyStaffLoginAttempt } from "@/lib/staff/login-stages";
import { probeStaffPreview } from "@/lib/staff/preview-diagnostics";

function jwtWithRef(ref: string): string {
  const payload = Buffer.from(JSON.stringify({ ref, role: "service_role" })).toString(
    "base64url",
  );
  return `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.sig`;
}

describe("staff lookup error classification", () => {
  it("names permission, missing column, and invalid API key failures", () => {
    expect(classifyStaffLookupError("permission denied for table staff_profiles")).toBe(
      "permission_denied",
    );
    expect(
      classifyStaffLookupError(
        "Could not find the 'auth_user_id' column of 'staff_profiles' in the schema cache",
      ),
    ).toBe("missing_column");
    expect(classifyStaffLookupError("Invalid API key")).toBe("invalid_api_key");
    expect(
      classifyStaffLookupError("column staff_profiles.email does not exist"),
    ).toBe("missing_column");
    expect(
      classifyStaffLookupError(
        "Could not find the table 'public.case_trends' in the schema cache",
      ),
    ).toBe("missing_table");
    expect(
      classifyStaffLookupError(
        "Could not find a relationship between 'crop_checks' and 'farmer_profiles'",
      ),
    ).toBe("missing_table");
    expect(
      sanitizeLookupError("JWT eyJhbGciOiJIUzI1NiJ9.aaa for info@fvmltd.com"),
    ).not.toMatch(/info@fvmltd.com|eyJ/);
  });
});

describe("service role project ref", () => {
  it("compares the JWT ref to the Preview URL and never falls back to Production", () => {
    expect(projectRefFromSupabaseUrl("https://gcojtfrdjczrvzieynzj.supabase.co")).toBe(
      "gcojtfrdjczrvzieynzj",
    );
    expect(projectRefFromJwt(jwtWithRef("gcojtfrdjczrvzieynzj"))).toBe(
      "gcojtfrdjczrvzieynzj",
    );
    expect(projectRefFromJwt("sb_secret_not_a_jwt")).toBeNull();
    expect(pkceVerifierCookieName("gcojtfrdjczrvzieynzj")).toBe(
      "sb-gcojtfrdjczrvzieynzj-auth-token-code-verifier",
    );
    expect(
      classifyStaffLoginAttempt({
        supabaseHost: "gcojtfrdjczrvzieynzj.supabase.co",
        vercelEnv: "preview",
        signInError: null,
        userId: "staff-user",
        hasSession: true,
        writtenCookieNames: ["sb-gcojtfrdjczrvzieynzj-auth-token"],
        cookieWriteError: null,
        hydratedUserId: "staff-user",
        staffLookupError: "Invalid API key",
        staffLookupErrorClass: "invalid_api_key",
        staffRowAuthUserId: null,
        staffActive: null,
        staffLinked: false,
        serviceRoleRef: "qzycpoivwwecooscnnju",
        urlProjectRef: "gcojtfrdjczrvzieynzj",
      }).stage,
    ).toBe("service_role_project_mismatch");
  });
});

describe("preview staff diagnostics probe", () => {
  it("reports a missing staff row without leaking tokens", async () => {
    const result = await probeStaffPreview({
      supabaseUrl: "https://gcojtfrdjczrvzieynzj.supabase.co",
      serviceRoleKey: jwtWithRef("gcojtfrdjczrvzieynzj"),
      client: {
        from() {
          return {
            select() {
              return {
                limit: async () => ({ data: [], error: null }),
                eq() {
                  return {
                    maybeSingle: async () => ({ data: null, error: null }),
                  };
                },
                ilike() {
                  return {
                    maybeSingle: async () => ({ data: null, error: null }),
                  };
                },
              };
            },
          };
        },
        auth: {
          admin: {
            listUsers: async () => ({
              data: {
                users: [{ id: "auth-1", email: "info@fvmltd.com" }],
              },
              error: null,
            }),
          },
        },
      },
    });
    expect(result.authUserExists).toBe(true);
    expect(result.staffRowExists).toBe(false);
    expect(result.serviceRoleMatchesUrl).toBe(true);
    expect(result.staffProfilesReadable).toBe(true);
  });

  it("detects a matching active staff_profiles.auth_user_id", async () => {
    const result = await probeStaffPreview({
      supabaseUrl: "https://gcojtfrdjczrvzieynzj.supabase.co",
      serviceRoleKey: jwtWithRef("gcojtfrdjczrvzieynzj"),
      client: {
        from() {
          return {
            select() {
              return {
                limit: async () => ({ data: [], error: null }),
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: {
                        id: "row-1",
                        auth_user_id: "auth-1",
                        email: "info@fvmltd.com",
                        is_active: true,
                      },
                      error: null,
                    }),
                  };
                },
                ilike() {
                  return {
                    maybeSingle: async () => ({
                      data: {
                        id: "row-1",
                        auth_user_id: "auth-1",
                        email: "info@fvmltd.com",
                        is_active: true,
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
        auth: {
          admin: {
            listUsers: async () => ({
              data: { users: [{ id: "auth-1", email: "info@fvmltd.com" }] },
              error: null,
            }),
          },
        },
      },
    });
    expect(result.staffRowExists).toBe(true);
    expect(result.staffRowActive).toBe(true);
    expect(result.authUserIdMatchesStaffRow).toBe(true);
  });

  it("looks up the staff row by auth_user_id when the email column is missing", async () => {
    const result = await probeStaffPreview({
      supabaseUrl: "https://gcojtfrdjczrvzieynzj.supabase.co",
      serviceRoleKey: jwtWithRef("gcojtfrdjczrvzieynzj"),
      client: {
        from() {
          return {
            select(columns: string) {
              return {
                limit: async () => {
                  if (columns.includes("email")) {
                    return {
                      data: null,
                      error: { message: "column staff_profiles.email does not exist" },
                    };
                  }
                  return { data: [], error: null };
                },
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: { id: "row-1", auth_user_id: "auth-1", is_active: true },
                      error: null,
                    }),
                  };
                },
                ilike() {
                  return {
                    maybeSingle: async () => ({
                      data: null,
                      error: { message: "column staff_profiles.email does not exist" },
                    }),
                  };
                },
              };
            },
          };
        },
        auth: {
          admin: {
            listUsers: async () => ({
              data: { users: [{ id: "auth-1", email: "info@fvmltd.com" }] },
              error: null,
            }),
          },
        },
      },
    });
    expect(result.authUserExists).toBe(true);
    expect(result.hasEmailColumn).toBe(false);
    expect(result.staffRowExists).toBe(true);
    expect(result.authUserIdMatchesStaffRow).toBe(true);
  });
});
