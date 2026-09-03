import { NextResponse } from "next/server";
import { buildInsights, detectTrends } from "@/lib/admin/insights";
import { requireStaffApi } from "@/lib/staff/auth";
import type { InsightsFilters } from "@/lib/admin/insights";

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

  return NextResponse.json({
    insights: buildInsights(filters),
    trends: detectTrends(filters),
  });
}
