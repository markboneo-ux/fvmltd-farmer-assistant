import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/supabase/env", () => ({
  getSupabasePublicEnv: () => ({
    url: "https://gcojtfrdjczrvzieynzj.supabase.co",
    anonKey: "anon",
  }),
}));

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

describe("staff recover session API", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(cookies).mockReset();
    vi.mocked(cookies).mockResolvedValue({
      getAll: () => [],
    } as never);
  });

  it("inspects the recovery format without consuming a PKCE code", async () => {
    const { POST } = await import("@/app/api/staff/recover/session/route");
    const response = await POST(
      new Request("https://preview.example/api/staff/recover/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inspect_only: true, format: "pkce_code" }),
      }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      canHydrate?: boolean;
      stage?: string;
      format?: string;
    };
    expect(payload.format).toBe("pkce_code");
    expect(payload.canHydrate).toBe(false);
    expect(payload.stage).toBe("pkce_verifier_missing");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("refuses to exchange a PKCE code when the verifier cookie is missing", async () => {
    const exchangeCodeForSession = vi.fn();
    vi.mocked(createClient).mockResolvedValue({
      auth: { exchangeCodeForSession },
    } as never);
    const { POST } = await import("@/app/api/staff/recover/session/route");
    const response = await POST(
      new Request("https://preview.example/api/staff/recover/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format: "pkce_code", code: "auth-code" }),
      }),
    );
    expect(response.status).toBe(401);
    const payload = (await response.json()) as { stage?: string };
    expect(payload.stage).toBe("pkce_verifier_missing");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("verifies a token_hash recovery once on hydrate", async () => {
    const verifyOtp = vi.fn(async () => ({
      data: { user: { email: "info@fvmltd.com" } },
      error: null,
    }));
    vi.mocked(createClient).mockResolvedValue({
      auth: { verifyOtp },
    } as never);
    const { POST } = await import("@/app/api/staff/recover/session/route");
    const response = await POST(
      new Request("https://preview.example/api/staff/recover/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          format: "token_hash",
          token_hash: "hashed-token",
          type: "recovery",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "hashed-token",
    });
  });

  it("sets a session from hash access/refresh tokens", async () => {
    const setSession = vi.fn(async () => ({
      data: { user: { email: "info@fvmltd.com" } },
      error: null,
    }));
    vi.mocked(createClient).mockResolvedValue({
      auth: { setSession },
    } as never);
    const { POST } = await import("@/app/api/staff/recover/session/route");
    const response = await POST(
      new Request("https://preview.example/api/staff/recover/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          format: "hash_tokens",
          access_token: "access",
          refresh_token: "refresh",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(setSession).toHaveBeenCalledWith({
      access_token: "access",
      refresh_token: "refresh",
    });
  });
});
