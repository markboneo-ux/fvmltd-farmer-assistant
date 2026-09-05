-- Production staff_profiles was created without auth_user_id.
-- Later RLS policies (crop_cases, research events) reference that column.

alter table public.staff_profiles
  add column if not exists auth_user_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  ) then
    update public.staff_profiles sp
    set auth_user_id = sp.id
    where sp.auth_user_id is null
      and exists (select 1 from auth.users u where u.id = sp.id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'staff_profiles_auth_user_id_fkey'
  ) then
    alter table public.staff_profiles
      add constraint staff_profiles_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users (id) on delete set null;
  end if;
exception
  when undefined_table then null;
  when duplicate_object then null;
end;
$$;

create index if not exists staff_profiles_auth_user_id_idx
  on public.staff_profiles (auth_user_id);
