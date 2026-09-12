import {
  classifyStaffLookupError,
  sanitizeLookupError,
  type StaffLookupErrorClass,
} from "@/lib/staff/lookup-error";

export const DASHBOARD_PROBE_TABLES = [
  "crop_cases",
  "case_messages",
  "case_photos",
  "case_followups",
  "case_outcomes",
  "case_trends",
  "web_research_events",
  "trusted_sources",
  "farmer_profiles",
  "usage_events",
  "crop_checks",
  "farms",
  "crop_cycles",
  "assessment_results",
] as const;

export const CROP_CHECK_QUEUE_EMBED_SELECT = "id, farmer_profiles!inner(id)";

export type DashboardTableName = (typeof DASHBOARD_PROBE_TABLES)[number] | "crop_checks_queue";

export type DashboardTableProbe = {
  table: DashboardTableName;
  ok: boolean;
  error: string | null;
  errorClass: StaffLookupErrorClass | null;
};

type LimitClient = {
  from: (table: string) => {
    select: (columns: string) => {
      limit: (n: number) => PromiseLike<{
        error: { message: string } | null;
      }>;
    };
  };
};

function probeResult(
  table: DashboardTableName,
  error: { message: string } | null,
): DashboardTableProbe {
  if (error) {
    return {
      table,
      ok: false,
      error: sanitizeLookupError(error.message),
      errorClass: classifyStaffLookupError(error.message),
    };
  }
  return {
    table,
    ok: true,
    error: null,
    errorClass: null,
  };
}

export async function probeDashboardTables(client: LimitClient): Promise<DashboardTableProbe[]> {
  const results: DashboardTableProbe[] = [];
  for (const table of DASHBOARD_PROBE_TABLES) {
    const { error } = await client.from(table).select("*").limit(0);
    results.push(probeResult(table, error));
  }
  const nested = await client
    .from("crop_checks")
    .select(CROP_CHECK_QUEUE_EMBED_SELECT)
    .limit(0);
  results.push(probeResult("crop_checks_queue", nested.error));
  return results;
}
