import { NextResponse } from "next/server";
import { buildInsights, detectTrends } from "@/lib/admin/insights";
import { requireStaffApi } from "@/lib/staff/auth";
import type { InsightsFilters } from "@/lib/admin/insights";
import { CasePersistenceError } from "@/lib/cases/store";
import { logOps } from "@/lib/security/ops-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await requireStaffApi();
  if (!staff.ok) return staff.response;

  const url = new URL(request.url);
  const filters: InsightsFilters = {
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    country: url.searchParams.get("country"),
    district: url.searchParams.get("district"),
    crop: url.searchParams.get("crop"),
    variety: url.searchParams.get("variety"),
    problem: url.searchParams.get("problem"),
    homeOrCommercial:
      url.searchParams.get("homeOrCommercial") === "home" ||
      url.searchParams.get("homeOrCommercial") === "commercial"
        ? (url.searchParams.get("homeOrCommercial") as "home" | "commercial")
        : null,
    outcome: url.searchParams.get("outcome"),
  };

  try {
    return NextResponse.json({
      insights: await buildInsights(filters),
      trends: await detectTrends(filters),
    });
  } catch (error) {
    if (error instanceof CasePersistenceError) {
      logOps("database_failure", { route: "admin/insights" });
      return NextResponse.json({ error: "Insights are temporarily unavailable." }, { status: 503 });
    }
    throw error;
  }
}
