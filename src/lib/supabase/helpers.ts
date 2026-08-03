import { createAdminClient } from "./admin";
import { createAnonServerClient } from "./anon";
import { getMissingSupabaseEnv } from "./env";

/**
 * Privileged admin client (service role). Staff / internal only.
 * Farmer-facing routes must use tryCreateAnonServerClient instead.
 */
export function tryCreateAdminClient() {
  try {
    return { ok: true as const, client: createAdminClient() };
  } catch {
    const missing = getMissingSupabaseEnv({ requireServiceRole: true });
    return {
      ok: false as const,
      error:
        missing.length > 0
          ? `Supabase is not configured on the server. Missing: ${missing.join(", ")}.`
          : "Supabase is not configured on the server. Add the environment variables and try again.",
    };
  }
}

/**
 * Low-privilege anon client for farmer-facing Route Handlers.
 * Requires only NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
export function tryCreateAnonServerClient() {
  try {
    return { ok: true as const, client: createAnonServerClient() };
  } catch {
    const missing = getMissingSupabaseEnv().filter(
      (name) => !name.toLowerCase().includes("service_role"),
    );
    const label =
      missing.length > 0
        ? missing.join(", ")
        : "public Supabase configuration";
    return {
      ok: false as const,
      error: `Supabase is not configured on the server. Missing: ${label}.`,
    };
  }
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Turn PostgREST / RPC errors into farmer-facing copy.
 * Never mention secret env var names (e.g. service-role keys).
 */
export function describeFarmerRpcError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!error) return fallback;
  if (typeof error === "string" && error.trim()) {
    return sanitizePublicError(error.trim(), fallback);
  }
  if (typeof error === "object") {
    const record = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    const parts = [record.message, record.details]
      .filter((part): part is string => Boolean(part && String(part).trim()))
      .map((part) => String(part).trim());
    if (parts.length) return sanitizePublicError(parts.join(" — "), fallback);
    if (record.code) return `${fallback} (${record.code}).`;
  }
  return fallback;
}

function sanitizePublicError(message: string, fallback: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("service_role") ||
    lower.includes("service-role") ||
    lower.includes("supabase_service_role_key")
  ) {
    return fallback;
  }
  if (
    lower.includes("could not find the function") ||
    lower.includes("schema cache") ||
    lower.includes("pgrst202")
  ) {
    return "This feature is not available yet on the database. Ask FVMLTD to apply the latest farmer journey migrations, then try again.";
  }
  // Strip Postgres raise exception prefixes when present
  return message.replace(/^ERROR:\s*/i, "").replace(/\s+CONTEXT:[\s\S]*$/i, "");
}

export function firstRpcRow<T extends object>(data: unknown): T | null {
  if (Array.isArray(data)) {
    const row = data[0];
    if (row && typeof row === "object") return row as T;
    return null;
  }
  if (data && typeof data === "object") {
    return data as T;
  }
  return null;
}

/** Narrow unknown RPC row lists for mappers. */
export function rpcRows<T extends object>(data: unknown): T[] {
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is T => Boolean(row) && typeof row === "object");
}
