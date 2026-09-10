-- Additive farmer-account, avatar, entitlement, and staff-review audit support.
-- Safe for Preview and Production. Does not drop tables or rewrite existing data.
-- Never reintroduce a Trinidad country default.

alter table public.farmer_profiles
  add column if not exists email text,
  add column if not exists avatar_storage_path text,
  add column if not exists farmer_type text,
  add column if not exists profile_notes text,
  add column if not exists primary_crops text[] default '{}';

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'farmer_profiles_farmer_type_check'
  ) then
    null;
  else
    alter table public.farmer_profiles
      add constraint farmer_profiles_farmer_type_check
      check (
        farmer_type is null
        or farmer_type in (
          'home_gardener',
          'small_farmer',
          'commercial_farmer',
          'agronomist',
          'extension_officer'
        )
      );
  end if;
end;
$$;

create unique index if not exists farmer_profiles_email_lower_idx
  on public.farmer_profiles (lower(email))
  where email is not null and length(trim(email)) > 0;

create index if not exists farmer_profiles_farmer_type_idx
  on public.farmer_profiles (farmer_type);

-- Guest session linking (table already exists from controlled-beta).
alter table public.guest_sessions
  add column if not exists last_linked_at timestamptz;

create index if not exists guest_sessions_linked_auth_user_id_idx
  on public.guest_sessions (linked_auth_user_id);

-- Staff review audit trail for conversational cases.
create table if not exists public.staff_review_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  staff_id uuid,
  staff_auth_user_id uuid,
  action text not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists staff_review_events_case_id_idx
  on public.staff_review_events (case_id, created_at desc);

alter table public.staff_review_events enable row level security;

drop policy if exists staff_review_events_staff_select on public.staff_review_events;
create policy staff_review_events_staff_select
  on public.staff_review_events
  for select
  using (public.is_staff());

grant select, insert, update, delete on public.staff_review_events to service_role;
grant select on public.staff_review_events to authenticated;

-- Private profile-photo bucket. Not publicly listable.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'farmer-avatars',
      'farmer-avatars',
      false,
      2097152,
      array['image/jpeg', 'image/png', 'image/webp']
    )
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;

-- No public or authenticated storage.objects policies are added for
-- farmer-avatars. The app reads and writes avatars only with the
-- service-role client and short-lived signed URLs. Anon/authenticated
-- clients cannot list or enumerate the bucket.

-- Service-role grants for entitlement / usage / promo tables if missing.
grant select, insert, update, delete on public.user_entitlements to service_role;
grant select, insert, update, delete on public.usage_events to service_role;
grant select, insert, update, delete on public.promo_codes to service_role;
grant select, insert, update, delete on public.promo_redemptions to service_role;
grant select, insert, update, delete on public.guest_sessions to service_role;

insert into public.promo_codes (
  code, active, start_date, expiry_date, maximum_uses, current_uses,
  entitlement_granted, created_by
)
values (
  'FVM',
  true,
  '2026-01-01T00:00:00Z',
  '2027-12-31T23:59:59Z',
  500,
  0,
  'promo',
  'fvmltd'
)
on conflict (code) do nothing;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
exception
  when undefined_function then
    null;
  when others then
    null;
end;
$$;
