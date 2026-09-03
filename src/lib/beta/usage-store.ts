import type { AccessState, UsageKind, UsageSnapshot } from "./limits";

export type UsageEvent = {
  id: string;
  guestSessionId: string | null;
  authUserId: string | null;
  kind: UsageKind | "usage_limit" | "upgrade_view" | "upgrade_click" | "promo_attempt" | "promo_success";
  caseId: string | null;
  createdAt: string;
  meta?: Record<string, string | number | boolean | null>;
};

const events: UsageEvent[] = [];

export function resetUsageStore() {
  events.length = 0;
}

export function recordUsageEvent(event: Omit<UsageEvent, "id" | "createdAt"> & { createdAt?: string }): UsageEvent {
  const row: UsageEvent = {
    id: crypto.randomUUID(),
    createdAt: event.createdAt ?? new Date().toISOString(),
    guestSessionId: event.guestSessionId,
    authUserId: event.authUserId,
    kind: event.kind,
    caseId: event.caseId,
    meta: event.meta,
  };
  events.push(row);
  return row;
}

function matchesOwner(
  event: UsageEvent,
  owner: { guestSessionId?: string | null; authUserId?: string | null },
): boolean {
  if (owner.authUserId && event.authUserId === owner.authUserId) return true;
  if (owner.guestSessionId && event.guestSessionId === owner.guestSessionId) {
    return !event.authUserId || event.authUserId === owner.authUserId;
  }
  return false;
}

export function countUsage(
  owner: { guestSessionId?: string | null; authUserId?: string | null },
): UsageSnapshot {
  const snapshot: UsageSnapshot = { messages: 0, cases: 0, imageAnalyses: 0 };
  for (const event of events) {
    if (!matchesOwner(event, owner)) continue;
    if (event.kind === "message") snapshot.messages += 1;
    if (event.kind === "case") snapshot.cases += 1;
    if (event.kind === "image_analysis") snapshot.imageAnalyses += 1;
  }
  return snapshot;
}

export function listUsageEvents(): UsageEvent[] {
  return [...events];
}

export function countUsageEventsByKind(kind: UsageEvent["kind"]): number {
  return events.filter((event) => event.kind === kind).length;
}

export function funnelStats() {
  return {
    usageLimitEvents: countUsageEventsByKind("usage_limit"),
    upgradeViews: countUsageEventsByKind("upgrade_view"),
    upgradeClicks: countUsageEventsByKind("upgrade_click"),
    promoAttempts: countUsageEventsByKind("promo_attempt"),
    promoSuccesses: countUsageEventsByKind("promo_success"),
  };
}

export function accessFromEntitlement(entitlement: AccessState | null | undefined): AccessState {
  return entitlement ?? "guest";
}
