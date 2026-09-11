/** Staff password recovery — not used by farmer auth. */

export const STAFF_RESET_PASSWORD_PATH = "/admin/reset-password";
export const STAFF_RECOVER_API_PATH = "/api/staff/recover";
export const STAFF_RECOVER_SESSION_API_PATH = "/api/staff/recover/session";
export const STAFF_RESET_PASSWORD_API_PATH = "/api/staff/reset-password";

export const STAFF_RESET_SUCCESS_QUERY = "reset=success";

export function isStaffRecoveryPath(pathname: string): boolean {
  return pathname === STAFF_RESET_PASSWORD_PATH;
}

export function isStaffRecoveryApiPath(pathname: string): boolean {
  return (
    pathname === STAFF_RECOVER_API_PATH ||
    pathname === STAFF_RECOVER_SESSION_API_PATH ||
    pathname === STAFF_RESET_PASSWORD_API_PATH
  );
}

export function isRecoverySearchParams(search: {
  get: (name: string) => string | null;
}): boolean {
  const type = search.get("type");
  return type === "recovery" || Boolean(search.get("token_hash"));
}

export function parseRecoveryHash(hash: string): {
  type: string | null;
  accessToken: string | null;
  refreshToken: string | null;
} {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return {
    type: params.get("type"),
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
  };
}

export function shouldRedirectToStaffReset(options: {
  pathname: string;
  search: { get: (name: string) => string | null };
  hash: string;
}): boolean {
  if (options.pathname === STAFF_RESET_PASSWORD_PATH) return false;
  if (options.pathname.startsWith("/signin")) return false;
  if (isRecoverySearchParams(options.search)) return true;
  return parseRecoveryHash(options.hash).type === "recovery";
}

export function staffResetLocation(search: string, hash: string): string {
  return `${STAFF_RESET_PASSWORD_PATH}${search || ""}${hash || ""}`;
}

export function validateStaffPassword(
  password: string,
  confirm: string,
): { ok: true } | { ok: false; error: string } {
  if (password.length < 8) {
    return { ok: false, error: "Use a new password with at least 8 characters." };
  }
  if (password !== confirm) {
    return { ok: false, error: "The two passwords do not match." };
  }
  return { ok: true };
}

export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedHost) {
    return `${forwardedProto || "https"}://${forwardedHost}`;
  }
  return url.origin;
}

export function staffRecoveryRedirectTo(origin: string): string {
  return `${origin.replace(/\/+$/, "")}${STAFF_RESET_PASSWORD_PATH}`;
}
