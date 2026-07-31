import { createAdminClient } from "./admin";

export function tryCreateAdminClient() {
  try {
    return { ok: true as const, client: createAdminClient() };
  } catch {
    return {
      ok: false as const,
      error:
        "Supabase is not configured on the server. Add the environment variables and try again.",
    };
  }
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
