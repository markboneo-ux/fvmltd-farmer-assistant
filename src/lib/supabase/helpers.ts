import { createAdminClient } from "./admin";
import { getMissingSupabaseEnv } from "./env";

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

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
