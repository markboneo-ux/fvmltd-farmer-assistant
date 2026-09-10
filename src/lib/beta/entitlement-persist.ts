import "server-only";

import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import type { EntitlementRecord } from "./entitlements";
import { grantEntitlement, getEntitlement } from "./entitlements";
import type { AccessState } from "./limits";

function parseAccess(value: unknown): AccessState | null {
  if (
    value === "guest" ||
    value === "free_registered" ||
    value === "fvm_beta" ||
    value === "promo" ||
    value === "trial" ||
    value === "paid"
  ) {
    return value;
  }
  return null;
}

export async function persistEntitlement(record: EntitlementRecord): Promise<void> {
  const admin = tryCreateAdminClient();
  if (!admin.ok) return;
  const authUserId = record.ownerKey.startsWith("user:")
    ? record.ownerKey.slice("user:".length)
    : null;
  const guestSessionId = record.ownerKey.startsWith("guest:")
    ? record.ownerKey.slice("guest:".length)
    : null;
  try {
    await admin.client.from("user_entitlements").upsert(
      {
        owner_key: record.ownerKey,
        auth_user_id: authUserId,
        guest_session_id: guestSessionId,
        access_state: record.access,
        source: record.source,
        granted_at: record.grantedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_key" },
    );
  } catch {
    // Memory entitlement still applies for this process.
  }
}

export async function loadPersistedEntitlement(ownerKey: string): Promise<EntitlementRecord | null> {
  const memory = getEntitlement(ownerKey);
  if (memory) return memory;
  const admin = tryCreateAdminClient();
  if (!admin.ok) return null;
  try {
    const { data, error } = await admin.client
      .from("user_entitlements")
      .select("owner_key, access_state, source, granted_at")
      .eq("owner_key", ownerKey)
      .maybeSingle();
    if (error || !data) return null;
    const access = parseAccess((data as { access_state?: unknown }).access_state);
    if (!access) return null;
    const source = (data as { source?: EntitlementRecord["source"] }).source ?? "signup";
    const grantedAt =
      (data as { granted_at?: string }).granted_at ?? new Date().toISOString();
    return grantEntitlement(ownerKey, access, source === "promo" ? "promo" : source);
  } catch {
    return null;
  }
}

export async function grantAndPersistEntitlement(
  ownerKey: string,
  access: AccessState,
  source: EntitlementRecord["source"],
): Promise<EntitlementRecord> {
  const record = grantEntitlement(ownerKey, access, source);
  await persistEntitlement(record);
  return record;
}
