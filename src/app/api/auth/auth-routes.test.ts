import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppIdentity } from "@/lib/beta/identity";
import { resetEntitlements } from "@/lib/beta/entitlements";
import { resetUsageStore } from "@/lib/beta/usage-store";
import { resetPromoStore } from "@/lib/promo/server";
import { resetCaseStore, setCasePersistenceModeForTests } from "@/lib/cases/store";

const guestIdentity: AppIdentity = {
  kind: "guest",
  guestSessionId: "11111111-1111-4111-8111-111111111111",
  authUserId: null,
  farmerProfileId: null,
  email: null,
  access: "guest",
};

const signInWithPassword = vi.fn();
const signUp = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/beta/auth-server", () => ({
  resolveIdentityFromRequest: vi.fn(async () => guestIdentity),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword,
      signUp,
      signOut,
    },
  })),
}));

describe("farmer email auth routes", () => {
  beforeEach(() => {
    setCasePersistenceModeForTests("memory");
    resetCaseStore();
    resetUsageStore();
    resetPromoStore();
    resetEntitlements();
    signInWithPassword.mockReset();
    signUp.mockReset();
    signOut.mockReset();
  });

  it("email login succeeds and returns ok", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: "user-login" } },
      error: null,
    });
    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "farmer@example.com", password: "password1" }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
    expect(signInWithPassword).toHaveBeenCalled();
  });

  it("email signup succeeds", async () => {
    signUp.mockResolvedValue({
      data: { user: { id: "user-signup" }, session: { access_token: "t" } },
      error: null,
    });
    const { POST } = await import("@/app/api/auth/signup/route");
    const response = await POST(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "farmer@example.com", password: "password1" }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok?: boolean; needsEmailConfirm?: boolean };
    expect(body.ok).toBe(true);
    expect(body.needsEmailConfirm).toBe(false);
  });

  it("logout signs the farmer out", async () => {
    signOut.mockResolvedValue({ error: null });
    const { POST } = await import("@/app/api/auth/logout/route");
    const response = await POST();
    expect(response.status).toBe(200);
    expect(signOut).toHaveBeenCalled();
  });
});
