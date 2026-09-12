import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser / Client Component Supabase client.
 * Uses only the public anon key — never the service role key.
 *
 * NEXT_PUBLIC_ values must be read as static `process.env.NEXT_PUBLIC_*`
 * identifiers so Next.js inlines them into the browser bundle. Dynamic
 * `process.env[name]` access is empty in the client and makes sign-in throw
 * "Could not sign in. Check Supabase configuration and try again."
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createBrowserClient(url, anonKey);
}
