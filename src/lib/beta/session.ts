import { cookies } from "next/headers";
import {
  CASE_COOKIE_NAME,
  createGuestSessionId,
  GUEST_COOKIE_NAME,
  guestCookieOptions,
  isUuid,
  normalizeGuestSessionId,
  type AppIdentity,
} from "./identity";
import { resolveAccess } from "./entitlements";

export { CASE_COOKIE_NAME, GUEST_COOKIE_NAME, guestCookieOptions };

export async function readGuestSessionId(): Promise<string | null> {
  try {
    const store = await cookies();
    return normalizeGuestSessionId(store.get(GUEST_COOKIE_NAME)?.value ?? null);
  } catch {
    return null;
  }
}

export async function readActiveCaseId(): Promise<string | null> {
  try {
    const store = await cookies();
    const value = store.get(CASE_COOKIE_NAME)?.value?.trim() ?? "";
    return isUuid(value) ? value : null;
  } catch {
    return null;
  }
}

export async function persistActiveCaseId(caseId: string): Promise<void> {
  const id = caseId.trim();
  if (!isUuid(id)) return;
  try {
    const store = await cookies();
    store.set(CASE_COOKIE_NAME, id, guestCookieOptions());
  } catch {
    // Route handlers may set the cookie on the NextResponse instead.
  }
}

export async function ensureGuestSessionId(): Promise<string> {
  const existing = await readGuestSessionId();
  if (existing) return existing;
  const created = createGuestSessionId();
  try {
    const store = await cookies();
    store.set(GUEST_COOKIE_NAME, created, guestCookieOptions());
  } catch {
    // Route handlers / middleware set the cookie on the response instead.
  }
  return created;
}

export async function resolveRequestIdentity(options?: {
  authUserId?: string | null;
  email?: string | null;
  farmerProfileId?: string | null;
  guestSessionId?: string | null;
}): Promise<AppIdentity> {
  const guestSessionId =
    normalizeGuestSessionId(options?.guestSessionId) ?? (await ensureGuestSessionId());
  const authUserId = options?.authUserId ?? null;
  const access = resolveAccess({
    authUserId,
    guestSessionId,
  });

  return {
    kind: authUserId ? "registered" : "guest",
    guestSessionId,
    authUserId,
    farmerProfileId: options?.farmerProfileId ?? null,
    email: options?.email ?? null,
    access,
  };
}

export function ownerKey(identity: Pick<AppIdentity, "authUserId" | "guestSessionId">): string {
  return identity.authUserId
    ? `user:${identity.authUserId}`
    : `guest:${identity.guestSessionId}`;
}
