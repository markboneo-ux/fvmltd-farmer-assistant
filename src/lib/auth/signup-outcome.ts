/**
 * Classify GoTrue signUp results so existing accounts are not sent into
 * a dead “Check your email” OTP screen.
 *
 * When a user already exists, signUp often returns a fake user with an empty
 * identities array and does not send email (account-enumeration protection).
 */

export const EXISTING_ACCOUNT_MESSAGE =
  "This account already exists. Log in instead.";

export const UNVERIFIED_ACCOUNT_MESSAGE =
  "This account still needs email verification. We sent a new 6-digit code.";

export const OTP_RESEND_WAIT_MESSAGE =
  "Please wait a little before requesting another code.";

export const OTP_RESEND_WAIT_SEC = 60;

export function isGhostExistingSignUp(data: {
  user?: { identities?: unknown[] | null } | null;
  session?: unknown;
}): boolean {
  if (data.session) return false;
  const identities = data.user?.identities;
  return !Array.isArray(identities) || identities.length === 0;
}

export function alreadyConfirmedResendError(
  error: { message?: string | null; code?: string | null } | null | undefined,
): boolean {
  const raw = `${error?.code ?? ""} ${error?.message ?? ""}`;
  return /already\s+confirmed|already verified|email_exists|user already registered/i.test(raw);
}

export function classifySignUpData(data: {
  user?: { identities?: unknown[] | null } | null;
  session?: unknown;
}): "authenticated" | "new_unverified" | "ghost_existing" {
  if (data.session) return "authenticated";
  if (isGhostExistingSignUp(data)) return "ghost_existing";
  return "new_unverified";
}

export function ghostResendDecision(
  error: { message?: string | null; code?: string | null; status?: number | null } | null | undefined,
): "unverified" | "verified" | "rate_limited" {
  if (!error) return "unverified";
  if (alreadyConfirmedResendError(error)) return "verified";
  const raw = `${error.code ?? ""} ${error.message ?? ""}`;
  if (error.status === 429 || /rate limit|too many requests|over_email_send_rate_limit|you can only request this after|email rate limit/i.test(raw)) {
    return "rate_limited";
  }
  return "unverified";
}
