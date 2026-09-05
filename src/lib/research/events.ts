/**
 * In-memory web-research analytics. Supabase persistence is additive.
 */

export type WebResearchEvent = {
  id: string;
  createdAt: string;
  country: string | null;
  topics: string[];
  used: boolean;
  failed: boolean;
  staleWarnings: number;
  sourceNames: string[];
  correlationId: string | null;
};

const events: WebResearchEvent[] = [];

export function resetWebResearchEvents() {
  events.length = 0;
}

export function recordWebResearchEvent(
  event: Omit<WebResearchEvent, "id" | "createdAt"> & { createdAt?: string },
): WebResearchEvent {
  const row: WebResearchEvent = {
    id: crypto.randomUUID(),
    createdAt: event.createdAt ?? new Date().toISOString(),
    country: event.country,
    topics: event.topics,
    used: event.used,
    failed: event.failed,
    staleWarnings: event.staleWarnings,
    sourceNames: event.sourceNames,
    correlationId: event.correlationId,
  };
  events.push(row);
  return row;
}

export function listWebResearchEvents(): WebResearchEvent[] {
  return [...events];
}

export function webResearchStats() {
  const used = events.filter((item) => item.used);
  const sourceCounts = new Map<string, number>();
  for (const event of used) {
    for (const name of event.sourceNames) {
      sourceCounts.set(name, (sourceCounts.get(name) ?? 0) + 1);
    }
  }
  const topSources = [...sourceCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  return {
    answersThatUsedWebResearch: used.length,
    sourceFailures: events.filter((item) => item.failed).length,
    staleSourceWarnings: events.reduce((sum, item) => sum + item.staleWarnings, 0),
    topSources,
  };
}
