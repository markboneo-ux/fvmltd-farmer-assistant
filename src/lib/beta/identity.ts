export type UserLevel =
  | "home_gardener"
  | "farmer"
  | "commercial_grower"
  | "agronomist"
  | "extension_officer";

export type IdentityKind = "guest" | "registered";

export type AppIdentity = {
  kind: IdentityKind;
  guestSessionId: string;
  authUserId: string | null;
  farmerProfileId: string | null;
  email: string | null;
  access: import("./limits").AccessState;
};

export const GUEST_COOKIE_NAME = "fvm_guest_session";
export const GUEST_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 180;

export function guestCookieOptions(secure = process.env.NODE_ENV === "production") {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE_SEC,
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function createGuestSessionId(): string {
  return crypto.randomUUID();
}

export function normalizeGuestSessionId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return isUuid(trimmed) ? trimmed : null;
}
