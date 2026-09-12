import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/implicit", () => ({
  createImplicitAuthClient: vi.fn(),
}));
vi.mock("@/lib/supabase/helpers", () => ({
  tryCreateAdminClient: vi.fn(),
}));

import { createImplicitAuthClient } from "@/lib/supabase/implicit";
import { tryCreateAdminClient } from "@/lib/supabase/helpers";

describe("staff recover API", () => {
  beforeEach(() => {
    vi.mocked(createImplicitAuthClient).mockReset();
    vi.mocked(tryCreateAdminClient).mockReset();
  });

  it("sends implicit-flow recovery to the staff reset page, not PKCE cookies", async () => {
    vi.mocked(tryCreateAdminClient).mockReturnValue({
      ok: true,
      client: {
        from() {
          return {
            select() {
              return {
                ilike() {
                  return {
                    maybeSingle: async () => ({
                      data: {
                        id: "staff-1",
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
      },
    } as never);
    const resetPasswordForEmail = vi.fn(async () => ({ error: null }));
    vi.mocked(createImplicitAuthClient).mockReturnValue({
      auth: { resetPasswordForEmail },
    } as never);

    const { POST } = await import("@/app/api/staff/recover/route");
    const response = await POST(
      new Request("https://preview.example/api/staff/recover", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-host": "preview.example",
          "x-forwarded-proto": "https",
        },
        body: JSON.stringify({ email: "info@fvmltd.com" }),
      }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { message?: string };
    expect(payload.message).toMatch(/staff account/i);
    expect(resetPasswordForEmail).toHaveBeenCalledWith("info@fvmltd.com", {
      redirectTo: "https://preview.example/admin/reset-password",
    });
  });
});
