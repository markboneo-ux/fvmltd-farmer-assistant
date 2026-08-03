import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./env";

/**
 * Low-privilege server Supabase client (anon / public key).
 * Used for guest farmer flows via SECURITY DEFINER RPCs.
 * Never use the service role key here.
 */
export function createAnonServerClient() {
  const { url, anonKey } = getSupabasePublicEnv();

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
