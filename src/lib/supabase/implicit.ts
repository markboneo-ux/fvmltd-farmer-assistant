import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "./env";

/**
 * Cookie-less implicit-flow Auth client.
 * Use for staff password recovery email so the link is not bound to a
 * PKCE verifier that only exists in the browser that requested the email.
 * Do not use this for farmer OTP / session cookie auth.
 */
export function createImplicitAuthClient() {
  const { url, anonKey } = getSupabasePublicEnv();
  return createClient(url, anonKey, {
    auth: {
      flowType: "implicit",
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
