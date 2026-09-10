-- =============================================================================
-- Farmer auth / FVM Beta entitlements (additive).
-- Guest chat stays available. Promo validation remains server-side only.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- App settings: FVM Beta + voice allowances (configurable; not UI hard-codes)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value_integer integer,
  value_text text,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text
);

insert into public.app_settings (key, value_integer)
values
  ('guest_max_messages', 20),
  ('guest_max_cases', 3),
  ('guest_max_image_analyses', 6),
  ('guest_max_voice_messages', 6),
  ('registered_free_messages', 80),
  ('registered_free_cases', 10),
  ('registered_free_images', 24),
  ('registered_free_voice', 24),
  ('fvm_beta_messages', 500),
  ('fvm_beta_cases', 50),
  ('fvm_beta_image_analyses', 100),
  ('fvm_beta_voice_messages', 100)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- user_entitlements: allow fvm_beta alongside legacy promo/trial
-- ---------------------------------------------------------------------------
alter table public.user_entitlements
  add column if not exists auth_user_id uuid,
  add column if not exists guest_session_id uuid,
  add column if not exists access_state text,
  add column if not exists source text,
  add column if not exists granted_at timestamptz,
  add column if not exists updated_at timestamptz;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'user_entitlements_access_state_check'
  ) then
    alter table public.user_entitlements drop constraint user_entitlements_access_state_check;
  end if;
end;
$$;

alter table public.user_entitlements
  drop constraint if exists user_entitlements_access_state_check;

alter table public.user_entitlements
  add constraint user_entitlements_access_state_check
  check (access_state in ('guest', 'free_registered', 'trial', 'promo', 'fvm_beta', 'paid'));

-- ---------------------------------------------------------------------------
-- Promo codes: configurable FVM Beta allowances
-- ---------------------------------------------------------------------------
alter table public.promo_codes
  add column if not exists messages_allowance integer,
  add column if not exists cases_allowance integer,
  add column if not exists image_analyses_allowance integer,
  add column if not exists voice_messages_allowance integer,
  add column if not exists entitlement_granted text;

update public.promo_codes
set
  entitlement_granted = 'fvm_beta',
  messages_allowance = coalesce(messages_allowance, 500),
  cases_allowance = coalesce(cases_allowance, 50),
  image_analyses_allowance = coalesce(image_analyses_allowance, 100),
  voice_messages_allowance = coalesce(voice_messages_allowance, 100)
where code = 'FVM';

insert into public.promo_codes (
  code, active, start_date, expiry_date, maximum_uses, current_uses,
  entitlement_granted, created_by,
  messages_allowance, cases_allowance, image_analyses_allowance, voice_messages_allowance
)
values (
  'FVM',
  true,
  '2026-01-01T00:00:00Z',
  '2027-12-31T23:59:59Z',
  500,
  0,
  'fvm_beta',
  'fvmltd',
  500,
  50,
  100,
  100
)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Optional farmer profile fields for the simple account page
-- ---------------------------------------------------------------------------
alter table public.farmer_profiles
  add column if not exists farmer_level text,
  add column if not exists auth_user_id uuid;

-- ---------------------------------------------------------------------------
-- Guest session linking
-- ---------------------------------------------------------------------------
create table if not exists public.guest_sessions (
  id uuid primary key,
  created_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  linked_auth_user_id uuid
);

create index if not exists guest_sessions_linked_user_idx
  on public.guest_sessions (linked_auth_user_id);

-- ---------------------------------------------------------------------------
-- RLS: entitlements and promo tables stay server-written
-- ---------------------------------------------------------------------------
alter table public.user_entitlements enable row level security;
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists user_entitlements_owner_select on public.user_entitlements;
create policy user_entitlements_owner_select on public.user_entitlements
  for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists user_entitlements_no_client_write on public.user_entitlements;
drop policy if exists user_entitlements_no_client_insert on public.user_entitlements;
create policy user_entitlements_no_client_insert on public.user_entitlements
  for insert to anon, authenticated
  with check (false);

drop policy if exists user_entitlements_no_client_update on public.user_entitlements;
create policy user_entitlements_no_client_update on public.user_entitlements
  for update to anon, authenticated
  using (false)
  with check (false);

drop policy if exists user_entitlements_no_client_delete on public.user_entitlements;
create policy user_entitlements_no_client_delete on public.user_entitlements
  for delete to anon, authenticated
  using (false);

drop policy if exists promo_codes_no_client on public.promo_codes;
create policy promo_codes_no_client on public.promo_codes
  for select to anon, authenticated
  using (false);

drop policy if exists promo_redemptions_no_client on public.promo_redemptions;
create policy promo_redemptions_no_client on public.promo_redemptions
  for select to anon, authenticated
  using (false);

drop policy if exists guest_sessions_no_client on public.guest_sessions;
create policy guest_sessions_no_client on public.guest_sessions
  for select to anon, authenticated
  using (false);

drop policy if exists app_settings_staff_only on public.app_settings;
create policy app_settings_staff_only on public.app_settings
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles s
      where s.is_active = true
        and (s.auth_user_id = auth.uid() or s.id = auth.uid())
    )
  );

grant select on public.user_entitlements to authenticated;
