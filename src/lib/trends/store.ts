import "server-only";

import {
  CasePersistenceError,
  assertSupabasePersistenceOrThrow,
} from "@/lib/cases/persistence";
import { getCaseStoreAdminClientForTests } from "@/lib/cases/supabase-store";
import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import type { CaseStoreAdminClient } from "@/lib/cases/supabase-store";
import {
  memoryGetCaseTrend,
  memoryListCaseTrends,
  memoryUpsertCaseTrend,
  resetMemoryTrends,
} from "./memory";
import type { CaseTrendRecord } from "./types";

export { resetMemoryTrends };

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

export function trendToRow(record: CaseTrendRecord): Record<string, unknown> {
  return {
    id: record.id,
    country: record.country,
    region: record.region,
    crop: record.crop,
    variety: record.variety,
    symptom_cluster: record.symptomCluster,
    suspected_issue: record.suspectedIssue,
    case_count: record.caseCount,
    unique_session_count: record.uniqueSessionCount,
    first_seen_at: record.firstSeenAt,
    last_seen_at: record.lastSeenAt,
    confidence_score: record.confidenceScore,
    reviewed_case_count: record.reviewedCaseCount,
    confirmed_case_count: record.confirmedCaseCount,
    positive_outcome_count: record.positiveOutcomeCount,
    trend_status: record.trendStatus,
    staff_reviewed: record.staffReviewed,
    notes: record.notes,
    contributing_case_ids: record.contributingCaseIds,
    contributing_session_keys: record.contributingSessionKeys,
  };
}

export function rowToTrend(row: Record<string, unknown>): CaseTrendRecord {
  return {
    id: asString(row.id),
    country: asNullableString(row.country),
    region: asNullableString(row.region),
    crop: asNullableString(row.crop),
    variety: asNullableString(row.variety),
    symptomCluster: asString(row.symptom_cluster) || "unspecified",
    suspectedIssue: asNullableString(row.suspected_issue),
    caseCount: asNumber(row.case_count),
    uniqueSessionCount: asNumber(row.unique_session_count),
    firstSeenAt: asString(row.first_seen_at),
    lastSeenAt: asString(row.last_seen_at),
    confidenceScore: asNumber(row.confidence_score),
    reviewedCaseCount: asNumber(row.reviewed_case_count),
    confirmedCaseCount: asNumber(row.confirmed_case_count),
    positiveOutcomeCount: asNumber(row.positive_outcome_count),
    trendStatus: (asString(row.trend_status) || "emerging") as CaseTrendRecord["trendStatus"],
    staffReviewed: asBoolean(row.staff_reviewed),
    notes: asNullableString(row.notes),
    contributingCaseIds: asStringArray(row.contributing_case_ids),
    contributingSessionKeys: asStringArray(row.contributing_session_keys),
  };
}

function liveClient(): CaseStoreAdminClient {
  const created = tryCreateAdminClient();
  if (!created.ok) {
    throw new CasePersistenceError("case_persistence_failed", "case_trends");
  }
  return created.client as unknown as CaseStoreAdminClient;
}

function dbClient(): CaseStoreAdminClient {
  return getCaseStoreAdminClientForTests() ?? liveClient();
}

export async function listCaseTrends(): Promise<CaseTrendRecord[]> {
  if (assertSupabasePersistenceOrThrow() === "memory") {
    return memoryListCaseTrends();
  }
  const { data, error } = await dbClient().from("case_trends").select("*");
  if (error) {
    throw new CasePersistenceError(error.message ?? "select failed", "case_trends");
  }
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return rows.map((row) => rowToTrend(row as Record<string, unknown>));
}

export async function upsertCaseTrend(record: CaseTrendRecord): Promise<CaseTrendRecord> {
  if (assertSupabasePersistenceOrThrow() === "memory") {
    return memoryUpsertCaseTrend(record);
  }
  const db = dbClient();
  const existing = await db
    .from("case_trends")
    .select("*")
    .eq("id", record.id)
    .maybeSingle<Record<string, unknown>>();
  if (existing.error) {
    throw new CasePersistenceError(existing.error.message ?? "select failed", "case_trends");
  }
  if (existing.data) {
    const { data, error } = await db
      .from("case_trends")
      .update(trendToRow(record))
      .eq("id", record.id)
      .select("*")
      .single<Record<string, unknown>>();
    if (error || !data) {
      throw new CasePersistenceError(error?.message ?? "update failed", "case_trends");
    }
    return rowToTrend(data);
  }
  const { data, error } = await db
    .from("case_trends")
    .insert(trendToRow(record))
    .select("*")
    .single<Record<string, unknown>>();
  if (error || !data) {
    throw new CasePersistenceError(error?.message ?? "insert failed", "case_trends");
  }
  return rowToTrend(data);
}

export async function getCaseTrend(id: string): Promise<CaseTrendRecord | null> {
  if (assertSupabasePersistenceOrThrow() === "memory") {
    return memoryGetCaseTrend(id);
  }
  const { data, error } = await dbClient()
    .from("case_trends")
    .select("*")
    .eq("id", id)
    .maybeSingle<Record<string, unknown>>();
  if (error) {
    throw new CasePersistenceError(error.message ?? "select failed", "case_trends");
  }
  return data ? rowToTrend(data) : null;
}
