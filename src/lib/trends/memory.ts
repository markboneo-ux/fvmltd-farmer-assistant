import type { CaseTrendRecord } from "./types";

const trends = new Map<string, CaseTrendRecord>();

export function resetMemoryTrends() {
  trends.clear();
}

export function memoryListCaseTrends(): CaseTrendRecord[] {
  return [...trends.values()];
}

export function memoryGetCaseTrend(id: string): CaseTrendRecord | null {
  return trends.get(id) ?? [...trends.values()].find((item) => item.id === id) ?? null;
}

export function memoryUpsertCaseTrend(record: CaseTrendRecord): CaseTrendRecord {
  trends.set(record.id, record);
  return record;
}

export function memoryDeleteCaseTrend(id: string) {
  trends.delete(id);
}
