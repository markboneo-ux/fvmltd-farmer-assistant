-- Local development seed (NOT used in production).
--
-- The hosted Supabase platform grants the api roles (anon, authenticated,
-- service_role) table/sequence privileges on the public schema by default.
-- A fresh local `supabase start` / `supabase db reset` does NOT grant
-- SELECT/INSERT/UPDATE/DELETE on public tables to these roles, so the app's
-- service-role and anon data paths (registration, farms, crop-checks, staff)
-- would fail locally with "permission denied for table ...".
--
-- This seed replicates the hosted grants for the local stack only. It runs
-- after migrations during `supabase db reset` (see [db.seed] in config.toml).

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete
  on all tables in schema public
  to anon, authenticated, service_role;

grant usage, select
  on all sequences in schema public
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences
  to anon, authenticated, service_role;
