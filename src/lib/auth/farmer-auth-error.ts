/**
 * Farmer-facing auth errors. Never expose raw Supabase / HTTP messages.
 */

const ALREADY_REGISTERED =
  /already\s+registered|user already exists|email address is already|already been registered/i;
const INVALID_CREDENTIALS = /invalid login|invalid credentials|invalid email or password/i;
const EXPIRED_OTP = /expired|otp_expired|token has expired/i;
const INVALID_OTP = /invalid.*(otp|token|code)|token not found|otp_disabled/i;
const NOT_CONFIRMED = /email not confirmed|not confirmed/i;
const RATE_LIMITED = /rate limit|too many requests|over_email_send_rate_limit/i;
const NETWORK = /fetch|network|failed to fetch|timeout|econnreset/i;
const TECHNICAL =
  /supabase|jwt|gotrue|postgres|stack|sql|http\s*\d+|status code|auth api/i;

export type FarmerAuthCode =
  | "existing_account"
  | "incorrect_code"
  | "expired_code"
  | "already_verified"
  | "invalid_credentials"
  | "not_confirmed"
  | "rate_limited"
  | "network"
  | "generic";

export function farmerAuthError(
  error: { message?: string | null; code?: string | null; status?: number | null } | string | null | undefined,
): { code: FarmerAuthCode; message: string } {
  const raw =
    typeof error === "string"
      ? error
      : `${error?.code ?? ""} ${error?.message ?? ""}`.trim();
  const status = typeof error === "object" && error ? error.status : null;

  if (status === 429 || RATE_LIMITED.test(raw)) {
    return {
      code: "rate_limited",
      message: "Please wait a moment before requesting another code.",
    };
  }
  if (ALREADY_REGISTERED.test(raw)) {
    return {
      code: "existing_account",
      message: "An account with this email already exists. Try logging in.",
    };
  }
  if (EXPIRED_OTP.test(raw)) {
    return {
      code: "expired_code",
      message: "That code has expired. Request a new one.",
    };
  }
  if (INVALID_OTP.test(raw) || /otp_expired|otp_disabled/.test(raw)) {
    return {
      code: "incorrect_code",
      message: "That code is not correct. Check it and try again.",
    };
  }
  if (INVALID_CREDENTIALS.test(raw)) {
    return {
      code: "invalid_credentials",
      message: "That email or password is not right.",
    };
  }
  if (NOT_CONFIRMED.test(raw)) {
    return {
      code: "not_confirmed",
      message: "Enter the 6-digit code we sent to your email to finish creating your account.",
    };
  }
  if (NETWORK.test(raw)) {
    return {
      code: "network",
      message: "I couldn’t complete that right now. Please try again.",
    };
  }
  if (!raw || TECHNICAL.test(raw)) {
    return {
      code: "generic",
      message: "I couldn’t complete that right now. Please try again.",
    };
  }
  return {
    code: "generic",
    message: "I couldn’t complete that right now. Please try again.",
  };
}

export function normalizeOtpCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function isCompleteOtpCode(value: string): boolean {
  return /^\d{6}$/.test(normalizeOtpCode(value));
}
