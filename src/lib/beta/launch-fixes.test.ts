import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { farmerSignupOtpResendParams, farmerSignupOtpVerifyParams } from "@/lib/auth/farmer-otp";
import { ensureFarmerProfileForUser } from "@/lib/auth/complete-farmer-auth";
import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import { staffLoginPathFor, isStaffLoginPath, STAFF_DASHBOARD_LOGIN_PATH } from "@/lib/staff/login-path";
import { safeStaffNextPath } from "@/lib/staff/next-path";

vi.mock("@/lib/supabase/helpers", () => ({
  tryCreateAdminClient: vi.fn(),
}));

function profileClient(options: {
  existing?: Record<string, unknown> | null;
  loadError?: { message: string } | null;
  inserted?: Record<string, unknown> | null;
  insertError?: { message: string } | null;
}) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: options.existing ?? null,
                  error: options.loadError ?? null,
                }),
              };
            },
          };
        },
        insert() {
          return {
            select() {
              return {
                maybeSingle: async () => ({
                  data: options.inserted ?? null,
                  error: options.insertError ?? null,
                }),
              };
            },
          };
        },
        update() {
          return {
            eq: async () => ({ error: null }),
          };
        },
      };
    },
    storage: {
      from() {
        return {
          createSignedUrl: async () => ({ data: null, error: null }),
        };
      },
    },
  };
}

describe("signup OTP type", () => {
  it("verifies signup email codes as type email, not a dual signup-then-email attempt", () => {
    const params = farmerSignupOtpVerifyParams(" Farmer@Example.com ", "123456");
    expect(params).toEqual({
      email: "farmer@example.com",
      token: "123456",
      type: "email",
    });
    expect(farmerSignupOtpResendParams("Farmer@Example.com")).toEqual({
      type: "signup",
      email: "farmer@example.com",
    });

    const verify = readFileSync(join(process.cwd(), "src/app/api/auth/verify/route.ts"), "utf8");
    expect(verify).toMatch(/farmerSignupOtpVerifyParams/);
    expect(verify).not.toMatch(/type:\s*"signup"/);
    expect(verify).not.toMatch(/type:\s*"email"/);
  });

  it("clears OTP digits after resend in the sign-in form", () => {
    const form = readFileSync(join(process.cwd(), "src/components/SignInForm.tsx"), "utf8");
    expect(form).toMatch(/setCode\(\["", "", "", "", "", ""\]\)/);
    expect(form).toMatch(/We sent a new code\. Enter that latest code/);
  });
});

describe("farmer profile upsert", () => {
  beforeEach(() => {
    vi.mocked(tryCreateAdminClient).mockReset();
  });

  it("creates a farmer_profiles row when a verified user does not have one yet", async () => {
    const inserted = {
      id: "profile-1",
      auth_user_id: "user-1",
      full_name: "Ada Farmer",
      email: "ada@example.com",
      country: null,
      region: null,
      district: null,
      farmer_type: null,
      primary_crops: [],
      farm_size: null,
      farm_size_unit: null,
      avatar_storage_path: null,
    };
    vi.mocked(tryCreateAdminClient).mockReturnValue({
      ok: true,
      client: profileClient({ existing: null, inserted }),
    } as never);

    const profile = await ensureFarmerProfileForUser({
      authUserId: "user-1",
      email: "ada@example.com",
      fullName: "Ada Farmer",
    });
    expect(profile?.id).toBe("profile-1");
    expect(profile?.email).toBe("ada@example.com");
    expect(profile?.country).toBeNull();
  });

  it("GET profile API upserts instead of returning a null profile", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/account/profile/route.ts"), "utf8");
    expect(route).toMatch(/ensureFarmerProfileForUser/);
    expect(route).not.toMatch(/loadFarmerAccountProfile/);
    const form = readFileSync(join(process.cwd(), "src/components/account/FarmerProfileForm.tsx"), "utf8");
    expect(form).toMatch(/status === "error"/);
    expect(form).toMatch(/Try again/);
    expect(form).not.toMatch(/message \|\| "Loading…"/);
  });
});

describe("staff dashboard sign-in separation", () => {
  it("keeps a dedicated /admin/login route and does not advertise it in farmer UI", () => {
    expect(isStaffLoginPath("/admin/login")).toBe(true);
    expect(staffLoginPathFor("/admin/insights")).toBe(STAFF_DASHBOARD_LOGIN_PATH);
    expect(safeStaffNextPath("/admin/insights")).toBe("/admin/insights");
    expect(safeStaffNextPath("/admin/login")).toBe("/admin/insights");

    const farmerUi = [
      "src/components/FarmerCaseChat.tsx",
      "src/components/SignInForm.tsx",
      "src/components/FarmerAccountMenu.tsx",
    ]
      .map((file) => readFileSync(join(process.cwd(), file), "utf8"))
      .join("\n");
    expect(farmerUi).not.toMatch(/\/staff\/login/);
    expect(farmerUi).not.toMatch(/\/admin\/login/);
    expect(farmerUi).not.toMatch(/Sign in to staff dashboard/);

    const nav = readFileSync(join(process.cwd(), "src/components/admin/AdminDashboardNav.tsx"), "utf8");
    for (const label of [
      "Overview",
      "Cases",
      "Trends",
      "Farmers",
      "Countries",
      "Questions",
      "Follow-ups",
      "Research Coverage",
    ]) {
      expect(nav).toContain(label);
    }

    const middleware = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
    expect(middleware).toMatch(/isStaffLoginPath/);
    const loginPage = readFileSync(join(process.cwd(), "src/app/admin/login/page.tsx"), "utf8");
    expect(loginPage).toMatch(/Staff dashboard sign-in/);
  });
});
