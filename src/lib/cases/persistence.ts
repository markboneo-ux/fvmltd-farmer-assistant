/**
 * Case storage backend selection.
 *
 * Production uses Supabase whenever it is configured and never silently
 * falls back to process memory. The in-memory Maps remain an explicit
 * development / test fallback only.
 */

import { readProcessEnv } from "@/lib/supabase/env";
import { redactSecrets } from "@/lib/security/ops-log";

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
  return readProcessEnv("VITEST") === "true" || readProcessEnv("NODE_ENV") === "test";
}

export function isProductionRuntime() {
  const vercelEnv = readProcessEnv("VERCEL_ENV");
  const nodeEnv = readProcessEnv("NODE_ENV");
  return (
    vercelEnv === "production" ||
    (nodeEnv === "production" && vercelEnv !== "preview" && vercelEnv !== "development")
  );
}

export function isSupabaseAdminConfigured() {
  return Boolean(
    readProcessEnv("NEXT_PUBLIC_SUPABASE_URL") &&
      readProcessEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") &&
      readProcessEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

export function setCasePersistenceModeForTests(mode: CasePersistenceMode | null) {
  modeOverride = mode;
}

export function resolveCasePersistenceMode(): CasePersistenceMode {
  if (modeOverride) return modeOverride;

  const explicit = readProcessEnv("CASE_PERSISTENCE").toLowerCase();
  const supabaseConfigured = isSupabaseAdminConfigured();
  const production = isProductionRuntime();

  // Never silently use Maps when Supabase env is present — including preview.
  if (supabaseConfigured) return "supabase";

  // Production without an explicit memory flag still must not silently
  // continue in Maps — callers error when the admin client is missing.
  if (production) return "supabase";

  if (explicit === "supabase") return "supabase";
  if (explicit === "memory") return "memory";

  // Explicit test / local fallback only when Supabase is intentionally absent.
  if (isTestRuntime()) return "memory";

  return "memory";
}

export function assertSupabasePersistenceOrThrow(mode = resolveCasePersistenceMode()) {
  // Test overrides are explicit; production never sets them.
  if (modeOverride) return mode;

  if (mode === "memory" && (isProductionRuntime() || isSupabaseAdminConfigured())) {
    logCasePersistenceError(
      "refusing in-memory case store because Supabase is configured or this is production",
      "memory",
    );
    throw new CasePersistenceError(
      "In-memory case storage is not allowed in production.",
      "memory",
    );
  }
  return mode;
}

export function safePersistenceError(error: unknown): string {
  if (error instanceof CasePersistenceError) {
    const table = error.table ? ` table=${error.table}` : "";
    return redactSecrets(`${error.message}${table}`);
  }
  if (error instanceof Error) {
    return redactSecrets(error.message);
  }
  return redactSecrets(String(error));
}

export function logCasePersistenceStart() {
  console.info("CASE_PERSISTENCE_START");
}

export function logCasePersistenceSupabase() {
  console.info("CASE_PERSISTENCE_SUPABASE");
}

export function logCaseCreated(id: string) {
  console.info(`CASE_CREATED id=${id}`);
}

export function logCaseMessageSaved(caseId: string, role: string) {
  console.info(`CASE_MESSAGE_SAVED case=${caseId} role=${role}`);
}

export function logCasePersistenceError(error: unknown, table?: string | null) {
  const tablePart = table ? ` table=${table}` : "";
  console.error(`CASE_PERSISTENCE_ERROR ${safePersistenceError(error)}${tablePart}`);
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
  if (mode === "supabase") {
    logCasePersistenceSupabase();
  }
  return mode;
}
