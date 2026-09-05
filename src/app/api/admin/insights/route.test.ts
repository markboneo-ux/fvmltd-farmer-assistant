import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/staff/auth", () => ({
  requireStaffApi: vi.fn(),
}));

import { requireStaffApi } from "@/lib/staff/auth";

describe("admin insights staff gate", () => {
  const env = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, env);
  });

  afterEach(() => {
    vi.resetModules();
    Object.assign(process.env, env);
  });

  it("loads only for staff", async () => {
    vi.mocked(requireStaffApi).mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Sign in with your FVMLTD staff account to continue." }, { status: 401 }),
    } as never);

    const { GET } = await import("@/app/api/admin/insights/route");
    const response = await GET(new Request("http://localhost/api/admin/insights"));
    expect(response.status).toBe(401);
  });
});
