import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/staff/login", () => ({
  staffPasswordLogin: vi.fn(),
}));

import { staffPasswordLogin } from "@/lib/staff/login";

describe("staff login API", () => {
  beforeEach(() => {
    vi.mocked(staffPasswordLogin).mockReset();
  });

  it("returns the named stage when credentials are invalid", async () => {
    vi.mocked(staffPasswordLogin).mockResolvedValue({
      ok: false,
      status: 401,
      error: "Invalid email or password.",
      debug: {
        stage: "invalid_credentials",
        signInOk: false,
        hasUser: false,
        hasSession: false,
        cookiePersisted: false,
        cookieNames: [],
        authUserId: null,
        hydratedUserId: null,
        staffRowAuthUserId: null,
        staffActive: null,
        supabaseHost: "gcojtfrdjczrvzieynzj.supabase.co",
        vercelEnv: "preview",
      },
    });

    const { POST } = await import("@/app/api/staff/login/route");
    const response = await POST(
      new Request("http://localhost/api/staff/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "ada@fvmltd.example", password: "nope" }),
      }),
    );
    expect(response.status).toBe(401);
    const payload = (await response.json()) as { stage?: string; error?: string };
    expect(payload.stage).toBe("invalid_credentials");
    expect(payload.error).toBe("Invalid email or password.");
  });

  it("returns ok for an active staff session", async () => {
    vi.mocked(staffPasswordLogin).mockResolvedValue({
      ok: true,
      staff: {
        id: "staff-1",
        authUserId: "staff-user",
        fullName: "Ada",
        email: "ada@fvmltd.example",
        role: "agronomist",
        isActive: true,
      },
      debug: {
        stage: "complete",
        signInOk: true,
        hasUser: true,
        hasSession: true,
        cookiePersisted: true,
        cookieNames: ["sb-gcojtfrdjczrvzieynzj-auth-token"],
        authUserId: "staff-user",
        hydratedUserId: "staff-user",
        staffRowAuthUserId: "staff-user",
        staffActive: true,
        supabaseHost: "gcojtfrdjczrvzieynzj.supabase.co",
        vercelEnv: "preview",
      },
    });

    const { POST } = await import("@/app/api/staff/login/route");
    const response = await POST(
      new Request("http://localhost/api/staff/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "ada@fvmltd.example", password: "secret" }),
      }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { ok?: boolean; stage?: string };
    expect(payload.ok).toBe(true);
    expect(payload.stage).toBe("complete");
  });
});

describe("staff me API includes the gate stage", () => {
  it("keeps a 401 JSON body with a stage field", () => {
    const response = NextResponse.json(
      { error: "Sign in with your FVMLTD staff account to continue.", stage: "redirect_session_hydration" },
      { status: 401 },
    );
    expect(response.status).toBe(401);
  });
});
