/** Farmer-facing next-path helper. Never send farmers to staff/admin. */
export function safeFarmerNextPath(next?: string | null): string {
  if (!next) return "/";
  const trimmed = next.trim();
  if (!trimmed.startsWith("/")) return "/";
  if (trimmed.startsWith("//")) return "/";
  if (trimmed.startsWith("/staff") || trimmed.startsWith("/admin") || trimmed.startsWith("/api")) {
    return "/";
  }
  return trimmed;
}

export const FARMER_LOGIN_PATH = "/login";
export const FARMER_SIGNUP_PATH = "/signup";
export const FARMER_ACCOUNT_PATH = "/account";
export const FARMER_CASES_PATH = "/cases";
export const FARMER_FOLLOWUPS_PATH = "/follow-ups";
export const FARMER_AUTH_CALLBACK_PATH = "/auth/callback";
