-- Preview farmer_profiles was created in the SQL editor after other tables.
-- PostgREST + the service-role client need table grants to upsert profiles.
-- Does not alter other tables.

grant all on table public.farmer_profiles to postgres, service_role;

notify pgrst, 'reload schema';
