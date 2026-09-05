/**
 * In-memory research usage log for admin analytics.
 * Production can also persist to web_research_events when Supabase is configured.
 */

export type ResearchLogEvent = {
  id: string;
  caseId: string | null;
  usedWeb: boolean;
  need: string;
  sources: string[];
  failures: Array<{ sourceName: string; reason: string }>;
  outdatedSources: string[];
  createdAt: string;
};

const events: ResearchLogEvent[] = [];

export function resetResearchLog() {
  events.length = 0;
}

export function recordResearchEvent(
  event: Omit<ResearchLogEvent, "id" | "createdAt"> & { createdAt?: string },
): ResearchLogEvent {
  const row: ResearchLogEvent = {
    id: crypto.randomUUID(),
    createdAt: event.createdAt ?? new Date().toISOString(),
    caseId: event.caseId,
    usedWeb: event.usedWeb,
    need: event.need,
    sources: event.sources,
    failures: event.failures,
    outdatedSources: event.outdatedSources,
  };
  events.push(row);
  return row;
}

export function listResearchEvents(): ResearchLogEvent[] {
  return [...events];
}

export function researchUsageStats() {
  const used = events.filter((item) => item.usedWeb);
  const sourceCounts = new Map<string, number>();
  const failureCounts = new Map<string, number>();
  const outdated = new Map<string, number>();
  for (const event of events) {
    for (const name of event.sources) {
      sourceCounts.set(name, (sourceCounts.get(name) ?? 0) + 1);
    }
    for (const failure of event.failures) {
      failureCounts.set(
        failure.sourceName,
        (failureCounts.get(failure.sourceName) ?? 0) + 1,
      );
    }
    for (const name of event.outdatedSources) {
      outdated.set(name, (outdated.get(name) ?? 0) + 1);
    }
  }
  const toRows = (map: Map<string, number>) =>
    [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  return {
    answersUsingWeb: used.length,
    totalResearchCalls: events.length,
    mostUsedSources: toRows(sourceCounts),
    sourceFailures: toRows(failureCounts),
    outdatedSourceAlerts: toRows(outdated),
  };
}
