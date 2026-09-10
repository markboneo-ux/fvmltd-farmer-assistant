import "server-only";

import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import { resolveCasePersistenceMode } from "@/lib/cases/persistence";
import type { UsageEvent } from "./usage-store";
import { logOps } from "@/lib/security/ops-log";

export async function persistUsageEvent(event: UsageEvent): Promise<void> {
  if (resolveCasePersistenceMode() !== "supabase") return;
  const admin = tryCreateAdminClient();
  if (!admin.ok) return;
  const { error } = await admin.client.from("usage_events").insert({
    id: event.id,
    guest_session_id: event.guestSessionId,
    auth_user_id: event.authUserId,
    kind: event.kind,
    case_id: event.caseId,
    created_at: event.createdAt,
    meta: event.meta ?? {},
  });
  if (error) {
    logOps("database_failure", { route: "usage-event", error: error.message });
  }
}

export async function countPersistedUsage(owner: {
  guestSessionId?: string | null;
  authUserId?: string | null;
}): Promise<{ messages: number; cases: number; imageAnalyses: number } | null> {
  if (resolveCasePersistenceMode() !== "supabase") return null;
  const admin = tryCreateAdminClient();
  if (!admin.ok) return null;

  let query = admin.client.from("usage_events").select("kind, auth_user_id, guest_session_id");
  if (owner.authUserId) {
    query = query.eq("auth_user_id", owner.authUserId);
  } else if (owner.guestSessionId) {
    query = query.eq("guest_session_id", owner.guestSessionId).is("auth_user_id", null);
  } else {
    return { messages: 0, cases: 0, imageAnalyses: 0 };
  }

  const { data, error } = await query;
  if (error || !data) return null;
  const snapshot = { messages: 0, cases: 0, imageAnalyses: 0 };
  for (const row of data as Array<{ kind: string }>) {
    if (row.kind === "message") snapshot.messages += 1;
    if (row.kind === "case") snapshot.cases += 1;
    if (row.kind === "image_analysis") snapshot.imageAnalyses += 1;
  }
  return snapshot;
}
