import "server-only";

import { linkGuestCasesToUser } from "@/lib/cases/store";
import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import { transferGuestEntitlementToUser } from "./entitlements";
import { persistEntitlement } from "./entitlement-persist";
import { transferGuestUsageToUser } from "./usage-store";

export async function persistGuestSessionLink(
  guestSessionId: string,
  userId: string,
): Promise<void> {
  const admin = tryCreateAdminClient();
  if (!admin.ok) return;
  try {
    await admin.client.from("guest_sessions").upsert(
      {
        id: guestSessionId,
        linked_auth_user_id: userId,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    await admin.client
      .from("usage_events")
      .update({ auth_user_id: userId })
      .eq("guest_session_id", guestSessionId)
      .is("auth_user_id", null);
  } catch {
    // Guest cookie still identifies the session for this browser.
  }
}

/**
 * Identify the current guest session and attach crop cases, messages (via
 * case ownership), photos, follow-ups, and usage history to the authenticated
 * user without creating duplicate cases.
 */
export async function claimGuestHistoryForUser(
  guestSessionId: string | null | undefined,
  userId: string,
): Promise<{ casesLinked: number; usageMoved: number }> {
  if (!guestSessionId || !userId) {
    return { casesLinked: 0, usageMoved: 0 };
  }

  const casesLinked = await linkGuestCasesToUser(guestSessionId, userId);
  const usageMoved = transferGuestUsageToUser(guestSessionId, userId);
  const entitlement = transferGuestEntitlementToUser(guestSessionId, userId);
  if (entitlement) {
    await persistEntitlement(entitlement);
  }
  await persistGuestSessionLink(guestSessionId, userId);
  return { casesLinked, usageMoved };
}
