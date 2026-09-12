export const STAFF_LOOKUP_ERROR_CLASSES = [
  "invalid_api_key",
  "permission_denied",
  "missing_table",
  "missing_column",
  "multiple_rows",
  "query_failed",
] as const;

export type StaffLookupErrorClass = (typeof STAFF_LOOKUP_ERROR_CLASSES)[number];

export function classifyStaffLookupError(message: string | null | undefined): StaffLookupErrorClass {
  const m = (message ?? "").toLowerCase();
  if (
    /invalid api key|invalid jwt|jwserror|bad_jwt|unauthorized|not a valid api key/.test(m)
  ) {
    return "invalid_api_key";
  }
  if (/permission denied|42501|not authorized|row-level security/.test(m)) {
    return "permission_denied";
  }
  if (
    /could not find the table|relation .*staff_profiles.* does not exist|42p01/.test(m)
  ) {
    return "missing_table";
  }
  if (
    /pgrst204|could not find the 'auth_user_id' column|column .*auth_user_id.* does not exist|42703/.test(
      m,
    )
  ) {
    return "missing_column";
  }
  if (/pgrst116|multiple \(or no\) rows|results contain \d+ rows/.test(m)) {
    return "multiple_rows";
  }
  return "query_failed";
}

export function sanitizeLookupError(message: string | null | undefined): string | null {
  if (!message) return null;
  return message
    .replace(/eyJ[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .slice(0, 180);
}
