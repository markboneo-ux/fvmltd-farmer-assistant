import { NextResponse } from "next/server";
import { buildInsights, detectTrends } from "@/lib/admin/insights";
import { requireStaffApi } from "@/lib/staff/auth";
import type { InsightsFilters } from "@/lib/admin/insights";
import { CasePersistenceError } from "@/lib/cases/store";
import { logOps } from "@/lib/security/ops-log";
import { upsertTrustedSources } from "@/lib/research/persist";
import {
  getInsightsSourceFailures,
  loadInsightsSource,
  resetInsightsSourceFailures,
} from "@/lib/admin/insights-sources";
import { sanitizeLookupError } from "@/lib/staff/lookup-error";

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
    caseType: url.searchParams.get("caseType"),
    status: url.searchParams.get("status"),
    region: url.searchParams.get("region"),
    issue: url.searchParams.get("issue"),
    userType: url.searchParams.get("userType"),
    guestOrRegistered:
      url.searchParams.get("userKind") === "guest" ||
      url.searchParams.get("userKind") === "registered"
        ? (url.searchParams.get("userKind") as "guest" | "registered")
        : null,
    confirmed:
      url.searchParams.get("confirmed") === "confirmed" ||
      url.searchParams.get("confirmed") === "unconfirmed"
        ? (url.searchParams.get("confirmed") as "confirmed" | "unconfirmed")
        : null,
    resolved:
      url.searchParams.get("resolved") === "resolved" ||
      url.searchParams.get("resolved") === "unresolved"
        ? (url.searchParams.get("resolved") as "resolved" | "unresolved")
        : null,
    questionCategory: url.searchParams.get("questionCategory"),
  };

  try {
    resetInsightsSourceFailures();
    await loadInsightsSource("trusted_sources", () => upsertTrustedSources(), undefined);
    const insights = await buildInsights(filters);
    const trends = await detectTrends(filters);
    const warnings = getInsightsSourceFailures();
    return NextResponse.json({
      insights,
      trends,
      warnings,
    });
  } catch (error) {
    const table =
      error instanceof CasePersistenceError
        ? error.table
        : error &&
            typeof error === "object" &&
            "table" in error &&
            typeof (error as { table?: unknown }).table === "string"
          ? (error as { table: string }).table
          : null;
    const detail =
      error instanceof Error
        ? sanitizeLookupError(error.message)
        : "insights query failed";
    logOps("database_failure", {
      route: "admin/insights",
      table,
      error: detail,
    });
    return NextResponse.json(
      {
        error: "Insights are temporarily unavailable.",
        table,
        detail,
      },
      { status: 503 },
    );
  }
}
