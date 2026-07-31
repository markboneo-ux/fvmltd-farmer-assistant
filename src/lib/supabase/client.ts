import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "./env";

/**
 * Browser / Client Component Supabase client.
 * Uses only the public anon key — never the service role key.
 */
export function createClient() {
  const { url, anonKey } = getSupabasePublicEnv();
  return createBrowserClient(url, anonKey);
}
