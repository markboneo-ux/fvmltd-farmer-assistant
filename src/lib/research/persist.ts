/**
 * Best-effort Supabase persistence for web-research analytics.
 * Memory remains the test/default store. Failures never reach the farmer.
 */

import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import { TRUSTED_SOURCES } from "./sources";
import type { WebCitation } from "./types";
import {
  listWebResearchEvents,
  type WebResearchEvent,
  webResearchStats,
} from "./events";

export async function persistWebResearchEvent(event: WebResearchEvent): Promise<void> {
  const admin = tryCreateAdminClient();
  if (!admin.ok) return;
  const { error } = await admin.client.from("web_research_events").insert({
    id: event.id,
    country: event.country,
    topics: event.topics,
    used: event.used,
    failed: event.failed,
    stale_warnings: event.staleWarnings,
    source_names: event.sourceNames,
    correlation_id: event.correlationId,
    created_at: event.createdAt,
  });
  if (error) {
    console.error("[ops] web_research_persist_failed", {
      errorType: error.code || "insert_failed",
      message: error.message.slice(0, 180),
    });
  }
}

export async function persistCaseWebCitations(
  caseId: string,
  citations: WebCitation[],
): Promise<void> {
  if (!caseId || citations.length === 0) return;
  const admin = tryCreateAdminClient();
  if (!admin.ok) return;
  const { error } = await admin.client.from("case_web_citations").insert(
    citations.map((item) => ({
      case_id: caseId,
      url: item.url,
      retrieved_at: item.retrievedAt,
      title: item.title,
      source_name: item.sourceName,
      country: item.country,
      source_type: item.sourceType,
      published_at: item.publishedAt,
    })),
  );
  if (error) {
    console.error("[ops] case_web_citations_persist_failed", {
      errorType: error.code || "insert_failed",
      message: error.message.slice(0, 180),
    });
  }
}

export async function upsertTrustedSources(): Promise<void> {
  const admin = tryCreateAdminClient();
  if (!admin.ok) return;
  const rows = TRUSTED_SOURCES.map((item) => ({
    id: item.id,
    country: item.country,
    source_name: item.sourceName,
    domain: item.domain,
    homepage_url: item.homepageUrl,
    source_type: item.sourceType,
    trust_level: item.trustLevel,
    active: item.active,
    notes: item.notes,
    last_reviewed_at: item.lastReviewedAt,
    preferred_for: item.preferredFor,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await admin.client.from("trusted_sources").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("[ops] trusted_sources_upsert_failed", {
      errorType: error.code || "upsert_failed",
      message: error.message.slice(0, 180),
    });
  }
}

export async function loadWebResearchDashboardStats() {
  const memory = webResearchStats();
  const admin = tryCreateAdminClient();
  if (!admin.ok) return memory;
  const { data, error } = await admin.client
    .from("web_research_events")
    .select("used, failed, stale_warnings, source_names")
    .limit(5000);
  if (error || !data) return memory;

  const sourceCounts = new Map<string, number>();
  let used = 0;
  let failed = 0;
  let stale = 0;
  for (const row of data as Array<{
    used?: boolean;
    failed?: boolean;
    stale_warnings?: number;
    source_names?: string[];
  }>) {
    if (row.used) used += 1;
    if (row.failed) failed += 1;
    stale += Number(row.stale_warnings ?? 0);
    for (const name of row.source_names ?? []) {
      sourceCounts.set(name, (sourceCounts.get(name) ?? 0) + 1);
    }
  }
  if (used === 0 && failed === 0 && memory.answersThatUsedWebResearch > 0) {
    return memory;
  }
  const topSources = [...sourceCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  return {
    answersThatUsedWebResearch: used,
    sourceFailures: failed,
    staleSourceWarnings: stale,
    topSources,
  };
}

export function memoryEventCountForTests() {
  return listWebResearchEvents().length;
}
