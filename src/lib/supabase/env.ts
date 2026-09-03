/**
 * Public Supabase credentials — safe to expose in the browser.
 * Never put the service role key here or behind a NEXT_PUBLIC_ prefix.
 *
 * Bracket access (`process.env[name]`) keeps Next.js from inlining a
 * build-time `undefined` into server bundles. Call these only at request time.
 */
export function readProcessEnv(name: string): string {
  const raw = process.env[name];
  if (typeof raw !== "string") return "";
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

export function getSupabasePublicEnv() {
  const url = readProcessEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readProcessEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return { url, anonKey };
}

/**
 * Service role key — server-only. Used for privileged admin operations.
 * Must never be imported into Client Components or exposed to the browser.
 */
export function getSupabaseServiceRoleKey() {
  const serviceRoleKey = readProcessEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  }

  return serviceRoleKey;
}

/**
 * Lists missing Supabase env var names (never values) for clear API errors.
 */
export function getMissingSupabaseEnv(options?: {
  requireServiceRole?: boolean;
}): string[] {
  const missing: string[] = [];

  if (!readProcessEnv("NEXT_PUBLIC_SUPABASE_URL")) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!readProcessEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  if (options?.requireServiceRole && !readProcessEnv("SUPABASE_SERVICE_ROLE_KEY")) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  return missing;
}
