import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv, getSupabaseServiceRoleKey } from "./env";

/**
 * Privileged server-only Supabase client (service role).
 * Bypasses Row Level Security — use only in trusted server code
 * (Route Handlers, Server Actions, cron jobs). Never import this
 * module from Client Components or any browser bundle.
 */
export function createAdminClient() {
  const { url } = getSupabasePublicEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
