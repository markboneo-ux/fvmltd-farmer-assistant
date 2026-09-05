/**
 * Operational logs for admin/developer diagnostics.
 * Never write secrets, API keys, or raw credentials.
 */

export type OpsEventKind =
  | "openai_failure"
  | "database_failure"
  | "photo_upload_failure"
  | "auth_failure"
  | "weather_provider_failure"
  | "product_catalogue_failure"
  | "web_research_failure"
  | "followup_failure"
  | "rate_limit"
  | "promo_failure"
  | "usage_limit";

const SECRET_RE =
  /\b(sk-[A-Za-z0-9_-]+|Bearer\s+\S+|eyJ[A-Za-z0-9._-]+|service_role|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY)\b/gi;

export function redactSecrets(value: string): string {
  return value.replace(SECRET_RE, "[redacted]").slice(0, 400);
}

export function logOps(
  kind: OpsEventKind,
  extra?: Record<string, string | number | boolean | null | undefined>,
) {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value == null) {
      safe[key] = null;
      continue;
    }
    if (typeof value === "string") {
      safe[key] = redactSecrets(value);
      continue;
    }
    safe[key] = value;
  }
  console.error(`[ops] ${kind}`, safe);
}
