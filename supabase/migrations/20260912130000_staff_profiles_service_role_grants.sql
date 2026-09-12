-- Preview staff_profiles may exist without table grants for PostgREST
-- service_role, which makes /admin/login fail at staff_lookup_failed even
-- when the Auth user exists. Additive and safe on Production.

alter table public.staff_profiles
  add column if not exists auth_user_id uuid;

grant all on table public.staff_profiles to postgres, service_role;
grant select on table public.staff_profiles to authenticated;

notify pgrst, 'reload schema';
