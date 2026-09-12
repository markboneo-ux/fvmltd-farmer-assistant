/**
 * Signup email OTP is a 6-digit code from the Confirm signup template.
 *
 * Supabase JS documents "Verify Signup One-Time Password" as:
 *   verifyOtp({ email, token, type: "email" })
 *
 * Do not try type "signup" first and then "email". A failed verify with the
 * wrong type returns otp_expired ("Token has expired or is invalid") and can
 * consume the latest code so a freshly entered token looks expired.
 *
 * Resend of an unconfirmed password signup still uses resend({ type: "signup" }).
 */

export const FARMER_SIGNUP_OTP_VERIFY_TYPE = "email" as const;
export const FARMER_SIGNUP_OTP_RESEND_TYPE = "signup" as const;
export const FARMER_OTP_DIGIT_COUNT = 6;

export function normalizeFarmerEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function farmerSignupOtpVerifyParams(email: string, token: string) {
  return {
    email: normalizeFarmerEmail(email),
    token,
    type: FARMER_SIGNUP_OTP_VERIFY_TYPE,
  };
}

export function farmerSignupOtpResendParams(email: string) {
  return {
    type: FARMER_SIGNUP_OTP_RESEND_TYPE,
    email: normalizeFarmerEmail(email),
  };
}

export function newFarmerCode(): string {
  return `FVM-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}
