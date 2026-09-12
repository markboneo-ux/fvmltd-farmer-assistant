import { logOps } from "@/lib/security/ops-log";
import { sanitizeLookupError } from "@/lib/staff/lookup-error";

export type InsightsSourceFailure = {
  table: string;
  error: string;
};

let failures: InsightsSourceFailure[] = [];

export function resetInsightsSourceFailures() {
  failures = [];
}

export function getInsightsSourceFailures(): InsightsSourceFailure[] {
  return [...failures];
}

function recordFailure(table: string, message: string) {
  const error = sanitizeLookupError(message) ?? "query failed";
  if (failures.some((item) => item.table === table && item.error === error)) return;
  failures.push({ table, error });
  logOps("database_failure", {
    route: "admin/insights",
    table,
    error,
  });
}

export async function loadInsightsSource<T>(
  table: string,
  loader: () => Promise<T>,
  fallback: T,
  required = false,
): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "query failed";
    const failedTable =
      error &&
      typeof error === "object" &&
      "table" in error &&
      typeof (error as { table?: unknown }).table === "string"
        ? (error as { table: string }).table
        : table;
    recordFailure(failedTable, message);
    if (required) throw error;
    return fallback;
  }
}
