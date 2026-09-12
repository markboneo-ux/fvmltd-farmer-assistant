import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("@/lib/staff/auth", () => ({
  requireStaffApi: vi.fn(),
}));

vi.mock("@/lib/admin/insights", () => ({
  buildInsights: vi.fn(),
  detectTrends: vi.fn(),
}));

vi.mock("@/lib/research/persist", () => ({
  upsertTrustedSources: vi.fn(async () => undefined),
}));

import { requireStaffApi } from "@/lib/staff/auth";
import { buildInsights, detectTrends } from "@/lib/admin/insights";
import { upsertTrustedSources } from "@/lib/research/persist";
import { CasePersistenceError } from "@/lib/cases/persistence";

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

  it("denies a signed-in farmer who is not staff", async () => {
    vi.mocked(requireStaffApi).mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { error: "This account is not an active FVMLTD staff member." },
        { status: 403 },
      ),
    } as never);

    const { GET } = await import("@/app/api/admin/insights/route");
    const response = await GET(new Request("http://localhost/api/admin/insights"));
    expect(response.status).toBe(403);
  });

  it("returns the failing table and PostgREST detail on a required query error", async () => {
    vi.mocked(requireStaffApi).mockResolvedValue({ ok: true } as never);
    vi.mocked(upsertTrustedSources).mockResolvedValue(undefined);
    vi.mocked(buildInsights).mockRejectedValue(
      new CasePersistenceError(
        "Could not find the table 'public.crop_cases' in the schema cache",
        "crop_cases",
      ),
    );

    const { GET } = await import("@/app/api/admin/insights/route");
    const response = await GET(new Request("http://localhost/api/admin/insights"));
    expect(response.status).toBe(503);
    const json = (await response.json()) as {
      error: string;
      table: string;
      detail: string;
    };
    expect(json.error).toMatch(/temporarily unavailable/i);
    expect(json.table).toBe("crop_cases");
    expect(json.detail).toMatch(/crop_cases/);
  });

  it("returns warnings when an optional insight table fails", async () => {
    vi.mocked(requireStaffApi).mockResolvedValue({ ok: true } as never);
    vi.mocked(upsertTrustedSources).mockResolvedValue(undefined);
    vi.mocked(buildInsights).mockImplementation(async () => {
      const { loadInsightsSource } = await import("@/lib/admin/insights-sources");
      await loadInsightsSource(
        "case_trends",
        async () => {
          throw new Error("Could not find the table 'public.case_trends' in the schema cache");
        },
        [],
      );
      return { summary: { totalCropCases: 1 } } as never;
    });
    vi.mocked(detectTrends).mockResolvedValue([]);

    const { GET } = await import("@/app/api/admin/insights/route");
    const response = await GET(new Request("http://localhost/api/admin/insights"));
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      warnings: Array<{ table: string; error: string }>;
    };
    expect(json.warnings).toEqual([
      {
        table: "case_trends",
        error: "Could not find the table 'public.case_trends' in the schema cache",
      },
    ]);
  });
});
