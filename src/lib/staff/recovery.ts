/** Staff password recovery — not used by farmer auth. */

export const STAFF_RESET_PASSWORD_PATH = "/admin/reset-password";
export const STAFF_RECOVER_API_PATH = "/api/staff/recover";
export const STAFF_RECOVER_SESSION_API_PATH = "/api/staff/recover/session";
export const STAFF_RESET_PASSWORD_API_PATH = "/api/staff/reset-password";
export const STAFF_PREVIEW_DIAGNOSTICS_PATH = "/api/staff/preview-diagnostics";

export const STAFF_RESET_SUCCESS_QUERY = "reset=success";

export const RECOVERY_LINK_FORMATS = [
  "pkce_code",
  "token_hash",
  "hash_tokens",
  "mixed",
  "none",
] as const;

export type RecoveryLinkFormat = (typeof RECOVERY_LINK_FORMATS)[number];

export type RecoveryHydrateBody = {
  format?: RecoveryLinkFormat;
  inspect_only?: boolean;
  code?: string;
  token_hash?: string;
  type?: string;
  access_token?: string;
  refresh_token?: string;
};

export function isStaffRecoveryPath(pathname: string): boolean {
  return pathname === STAFF_RESET_PASSWORD_PATH;
}

export function isStaffRecoveryApiPath(pathname: string): boolean {
  return (
    pathname === STAFF_RECOVER_API_PATH ||
    pathname === STAFF_RECOVER_SESSION_API_PATH ||
    pathname === STAFF_RESET_PASSWORD_API_PATH ||
    pathname === STAFF_PREVIEW_DIAGNOSTICS_PATH
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

export function detectRecoveryLinkFormat(options: {
  search: { get: (name: string) => string | null };
  hash: string;
}): RecoveryLinkFormat {
  const code = Boolean(options.search.get("code")?.trim());
  const tokenHash = Boolean(
    options.search.get("token_hash")?.trim() ||
      (options.search.get("type") === "recovery" && options.search.get("token")?.trim()),
  );
  const hash = parseRecoveryHash(options.hash);
  const hashTokens = Boolean(
    hash.type === "recovery" && hash.accessToken && hash.refreshToken,
  );
  const flags = [code, tokenHash, hashTokens].filter(Boolean).length;
  if (flags === 0) return "none";
  if (flags > 1) return "mixed";
  if (tokenHash) return "token_hash";
  if (hashTokens) return "hash_tokens";
  return "pkce_code";
}

export function recoveryHydrateBodyFromLocation(options: {
  search: { get: (name: string) => string | null };
  hash: string;
}): RecoveryHydrateBody {
  const search = options.search;
  const hash = parseRecoveryHash(options.hash);
  const body: RecoveryHydrateBody = {
    format: detectRecoveryLinkFormat(options),
  };
  const code = search.get("code")?.trim() ?? "";
  const tokenHash =
    search.get("token_hash")?.trim() ||
    (search.get("type") === "recovery" ? search.get("token")?.trim() ?? "" : "");
  const type = search.get("type")?.trim() || hash.type || "";
  if (code) body.code = code;
  if (tokenHash) {
    body.token_hash = tokenHash;
    body.type = type || "recovery";
  }
  if (hash.accessToken && hash.refreshToken) {
    body.access_token = hash.accessToken;
    body.refresh_token = hash.refreshToken;
    body.type = type || hash.type || "recovery";
  }
  return body;
}

export function shouldRedirectToStaffReset(options: {
  pathname: string;
  search: { get: (name: string) => string | null };
  hash: string;
}): boolean {
  if (options.pathname === STAFF_RESET_PASSWORD_PATH) return false;
  if (options.pathname.startsWith("/signin")) return false;
  if (options.pathname === "/auth/callback") return false;
  if (isRecoverySearchParams(options.search)) return true;
  return parseRecoveryHash(options.hash).type === "recovery";
}

export function staffResetLocation(search: string, hash: string): string {
  return `${STAFF_RESET_PASSWORD_PATH}${search || ""}${hash || ""}`;
}

export function staffResetForwardUrl(
  origin: string,
  search: { get: (name: string) => string | null },
): string {
  const dest = new URL(`${origin.replace(/\/+$/, "")}${STAFF_RESET_PASSWORD_PATH}`);
  const code = search.get("code")?.trim();
  const tokenHash = search.get("token_hash")?.trim();
  const token = search.get("token")?.trim();
  const type = search.get("type")?.trim();
  if (code) dest.searchParams.set("code", code);
  if (tokenHash) dest.searchParams.set("token_hash", tokenHash);
  else if (token && type === "recovery") dest.searchParams.set("token_hash", token);
  if (type) dest.searchParams.set("type", type);
  return dest.toString();
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

export function recoveryUserError(stage: string | null | undefined): string {
  switch (stage) {
    case "pkce_verifier_missing":
      return "This reset link was tied to another browser session. Request a new one from staff sign-in.";
    case "invalid_recovery_code":
    case "invalid_recovery_token":
    case "invalid_recovery_session":
      return "This reset link is invalid or has expired. Request a new one.";
    default:
      return "This reset link is invalid or has expired. Request a new one.";
  }
}
