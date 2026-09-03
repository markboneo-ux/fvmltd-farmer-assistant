/**
 * Case storage backend selection.
 *
 * Production uses Supabase whenever it is configured and never silently
 * falls back to process memory. The in-memory Maps remain an explicit
 * development / test fallback only.
 */

export type CasePersistenceMode = "supabase" | "memory";

export class CasePersistenceError extends Error {
  readonly table: string | null;
  readonly farmerSafe: true;

  constructor(message: string, table?: string | null) {
    super(message);
    this.name = "CasePersistenceError";
    this.table = table ?? null;
    this.farmerSafe = true;
  }
}

let modeOverride: CasePersistenceMode | null = null;

export function isTestRuntime() {
  return process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}

export function isProductionRuntime() {
  return (
    process.env.VERCEL_ENV === "production" ||
    (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview")
  );
}

export function isSupabaseAdminConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function setCasePersistenceModeForTests(mode: CasePersistenceMode | null) {
  modeOverride = mode;
}

export function resolveCasePersistenceMode(): CasePersistenceMode {
  if (modeOverride) return modeOverride;

  const explicit = (process.env.CASE_PERSISTENCE ?? "").trim().toLowerCase();

  // Production with Supabase configured must never use memory, even if
  // CASE_PERSISTENCE=memory is set by mistake.
  if (isProductionRuntime() && isSupabaseAdminConfigured()) {
    return "supabase";
  }

  if (explicit === "supabase") return "supabase";
  if (explicit === "memory") return "memory";

  // Explicit test fallback.
  if (isTestRuntime()) return "memory";

  // Production without an explicit memory flag still must not silently
  // continue in Maps — callers will error when the admin client is missing.
  if (isProductionRuntime()) return "supabase";

  if (isSupabaseAdminConfigured()) return "supabase";

  // Development fallback when Supabase env is not present.
  return "memory";
}

/**
 * Temporary operational log so Vercel Logs can confirm the live backend.
 * Search for: case_persistence=supabase
 */
export function logCasePersistenceBackend(mode = resolveCasePersistenceMode()) {
  if (isTestRuntime() && mode === "memory") {
    return mode;
  }
  console.info(`case_persistence=${mode}`);
  return mode;
}
