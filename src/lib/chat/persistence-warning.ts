import { FARMER_PERSISTENCE_DEGRADED } from "@/lib/beta/limits";

/**
 * Farmer-facing save warning. Only when the chat answer exists and the
 * crop case / messages were not saved. A returned caseId means the chat
 * persisted — never warn in that case, even if a flag is set by mistake.
 */
export function farmerPersistenceBanner(payload: {
  persistenceFailed?: boolean | null;
  caseId?: string | null;
}): string | null {
  if (payload.persistenceFailed !== true) return null;
  if (payload.caseId?.trim()) return null;
  return FARMER_PERSISTENCE_DEGRADED;
}
