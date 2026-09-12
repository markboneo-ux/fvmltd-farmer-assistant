-- =============================================================================
-- PREVIEW ONLY — run in the SQL editor for project gcojtfrdjczrvzieynzj
-- Do NOT run this against Production (qzycpoivwwecooscnnju).
-- Do NOT paste a Production Auth user UUID here. Auth user ids differ
-- between projects. This script looks up info@fvmltd.com in THIS project.
--
-- Live Preview diagnostic (PR 36): Auth user exists, service-role key matches
-- gcojtfrdjczrvzieynzj, but staff_profiles is missing expected columns
-- (PostgREST: "column staff_profiles.email does not exist"). That query error
-- is what /admin/login reports as staff_lookup_failed.
-- =============================================================================

-- 1) Bring staff_profiles up to the columns the app selects.
alter table public.staff_profiles add column if not exists auth_user_id uuid;
alter table public.staff_profiles add column if not exists email text;
alter table public.staff_profiles add column if not exists full_name text;
alter table public.staff_profiles add column if not exists role text;
alter table public.staff_profiles add column if not exists is_active boolean default true;
alter table public.staff_profiles add column if not exists updated_at timestamptz default timezone('utc', now());

update public.staff_profiles
set full_name = coalesce(nullif(full_name, ''), 'FVMLTD Staff')
where full_name is null or full_name = '';

update public.staff_profiles
set role = coalesce(nullif(role, ''), 'admin')
where role is null or role = '';

update public.staff_profiles
set is_active = coalesce(is_active, true)
where is_active is null;

grant all on table public.staff_profiles to postgres, service_role;
grant select on table public.staff_profiles to authenticated;

alter table public.staff_profiles enable row level security;

drop policy if exists staff_profiles_select_own on public.staff_profiles;
create policy staff_profiles_select_own
  on public.staff_profiles
  for select
  to authenticated
  using (
    (id = auth.uid() or auth_user_id = auth.uid())
    and coalesce(is_active, true) = true
  );

notify pgrst, 'reload schema';

-- 2) Map the Preview Auth user for info@fvmltd.com to an active staff row.
--    Raises if this project has no Auth user with that email.
do $$
declare
  preview_auth_id uuid;
  existing_id uuid;
begin
  select id
    into preview_auth_id
  from auth.users
  where lower(email) = lower('info@fvmltd.com')
  limit 1;

  if preview_auth_id is null then
    raise exception
      'No Auth user for info@fvmltd.com in THIS project. Create the user under Authentication → Users in gcojtfrdjczrvzieynzj first. Do not copy a Production user id.';
  end if;

  select id
    into existing_id
  from public.staff_profiles
  where auth_user_id = preview_auth_id
     or lower(coalesce(email, '')) = lower('info@fvmltd.com')
  limit 1;

  if existing_id is null then
    insert into public.staff_profiles (auth_user_id, full_name, email, role, is_active)
    values (preview_auth_id, 'FVMLTD Staff', 'info@fvmltd.com', 'admin', true);
  else
    update public.staff_profiles
    set auth_user_id = preview_auth_id,
        email = 'info@fvmltd.com',
        full_name = coalesce(nullif(full_name, ''), 'FVMLTD Staff'),
        role = coalesce(nullif(role, ''), 'admin'),
        is_active = true,
        updated_at = timezone('utc', now())
    where id = existing_id;
  end if;
end;
$$;

-- 3) Verify: auth_user_id must equal auth.users.id and is_active must be true.
select
  u.id as preview_auth_user_id,
  u.email as auth_email,
  sp.id as staff_row_id,
  sp.auth_user_id,
  sp.email as staff_email,
  sp.role,
  sp.is_active,
  (sp.auth_user_id = u.id) as ids_match
from auth.users u
left join public.staff_profiles sp
  on sp.auth_user_id = u.id
where lower(u.email) = lower('info@fvmltd.com');
