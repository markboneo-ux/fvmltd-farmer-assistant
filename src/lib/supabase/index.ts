/**
 * Public entry points for Supabase clients.
 * Import the admin client only from `./admin` in server code —
 * it is intentionally not re-exported here.
 */
export { createClient as createBrowserClient } from "./client";
export { createClient as createServerClient } from "./server";
