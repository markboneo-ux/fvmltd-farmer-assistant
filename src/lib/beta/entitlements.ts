import type { AccessState } from "./limits";
import { canonicalAccess } from "./limits";

export type EntitlementRecord = {
  ownerKey: string;
  access: AccessState;
  source: "guest" | "signup" | "promo" | "admin" | "payment";
  grantedAt: string;
};

const entitlements = new Map<string, EntitlementRecord>();

export function resetEntitlements() {
  entitlements.clear();
}

export function grantEntitlement(
  ownerKey: string,
  access: AccessState,
  source: EntitlementRecord["source"],
): EntitlementRecord {
  const normalized: AccessState =
    access === "promo" || access === "trial" ? "fvm_beta" : access;
  const record: EntitlementRecord = {
    ownerKey,
    access: normalized,
    source,
    grantedAt: new Date().toISOString(),
  };
  entitlements.set(ownerKey, record);
  return record;
}

export function getEntitlement(ownerKey: string): EntitlementRecord | null {
  return entitlements.get(ownerKey) ?? null;
}

export function resolveAccess(options: {
  authUserId?: string | null;
  guestSessionId?: string | null;
}): AccessState {
  if (options.authUserId) {
    const paid = entitlements.get(`user:${options.authUserId}`);
    if (paid) return paid.access;
    return "free_registered";
  }
  if (options.guestSessionId) {
    const guest = entitlements.get(`guest:${options.guestSessionId}`);
    if (guest) return guest.access;
  }
  return "guest";
}

export function transferGuestEntitlementToUser(
  guestSessionId: string,
  authUserId: string,
): EntitlementRecord | null {
  const guest = entitlements.get(`guest:${guestSessionId}`);
  if (!guest) return getEntitlement(`user:${authUserId}`);
  const existing = entitlements.get(`user:${authUserId}`);
  const guestTier = canonicalAccess(guest.access);
  const existingTier = existing ? canonicalAccess(existing.access) : "GUEST";
  const rank = { GUEST: 0, REGISTERED_FREE: 1, FVM_BETA: 2, PAID: 3 };
  if (!existing || rank[guestTier] >= rank[existingTier]) {
    return grantEntitlement(`user:${authUserId}`, guest.access, guest.source);
  }
  return existing;
}

/** Payments are not faked. Without a processor this stays informational. */
export function paymentProcessorConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() || process.env.PAYMENT_PROVIDER?.trim(),
  );
}
