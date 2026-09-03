-- =============================================================================
-- Controlled-beta additive schema for conversational crop cases, usage,
-- entitlements, promo codes, and guest sessions.
-- Does NOT drop existing crop_checks / chat_messages / crop_photos tables.
-- Do not apply automatically to production from this PR.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- App settings (admin-changeable usage limits)
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
  ('registered_free_messages', 80),
  ('registered_free_cases', 10),
  ('registered_free_images', 24)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Guest sessions + entitlements
-- ---------------------------------------------------------------------------
create table if not exists public.guest_sessions (
  id uuid primary key,
  created_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  linked_auth_user_id uuid
);

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  owner_key text not null unique,
  auth_user_id uuid,
  guest_session_id uuid,
  access_state text not null default 'guest'
    check (access_state in ('guest', 'free_registered', 'trial', 'promo', 'paid')),
  source text not null default 'guest',
  granted_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- Conversational crop cases (additive; guided crop_checks remain)
-- ---------------------------------------------------------------------------
create table if not exists public.crop_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  anonymous_session_id uuid,
  access_state text not null default 'guest',
  country text,
  district text,
  farm text,
  crop text,
  variety text,
  plant_age text,
  production_system text,
  home_or_commercial text,
  user_level text,
  area text,
  farmer_problem_text text not null default '',
  problem_category text,
  symptoms text[] not null default '{}',
  field_distribution text,
  soil_or_medium text,
  irrigation text,
  drainage text,
  fertilizer_history text,
  chemical_history text,
  recent_weather text,
  weather_risk text,
  possible_causes text[] not null default '{}',
  confidence text not null default 'unknown',
  severity text not null default 'unknown',
  recommended_actions text[] not null default '{}',
  products_requested boolean not null default false,
  verified_products_shown text[] not null default '{}',
  human_escalation boolean not null default false,
  agronomist_reviewed boolean not null default false,
  diagnosis_confirmed boolean not null default false,
  case_status text not null default 'open',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists crop_cases_user_id_idx on public.crop_cases (user_id);
create index if not exists crop_cases_session_idx on public.crop_cases (anonymous_session_id);
create index if not exists crop_cases_crop_district_idx on public.crop_cases (crop, district);

create table if not exists public.case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crop_cases (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  has_images boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.case_observations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crop_cases (id) on delete cascade,
  observed_facts text[] not null default '{}',
  possible_causes text[] not null default '{}',
  confidence text not null default 'unknown',
  next_check text,
  recommended_action text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.case_assessments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crop_cases (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.case_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crop_cases (id) on delete cascade,
  action_text text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.case_outcomes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crop_cases (id) on delete cascade,
  outcome text not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.case_photos (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crop_cases (id) on delete cascade,
  owner_user_id uuid,
  owner_session_id uuid,
  storage_bucket text not null default 'case-photos',
  storage_path text not null,
  mime_type text,
  file_size_bytes integer,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.case_followups (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crop_cases (id) on delete cascade,
  user_id uuid,
  anonymous_session_id uuid,
  follow_up_date timestamptz not null,
  asked_at timestamptz,
  outcome text,
  action_taken text,
  notes text,
  follow_up_photo_id uuid,
  new_severity text,
  opted_out boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  guest_session_id uuid,
  auth_user_id uuid,
  kind text not null,
  case_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists usage_events_owner_idx
  on public.usage_events (auth_user_id, guest_session_id, kind);

-- ---------------------------------------------------------------------------
-- Promo codes (FVM seeded server-side only)
-- ---------------------------------------------------------------------------
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  active boolean not null default true,
  start_date timestamptz,
  expiry_date timestamptz,
  maximum_uses integer,
  current_uses integer not null default 0,
  entitlement_granted text not null default 'promo',
  created_at timestamptz not null default timezone('utc', now()),
  created_by text
);

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes (id) on delete cascade,
  owner_key text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (promo_code_id, owner_key)
);

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

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.crop_cases enable row level security;
alter table public.case_messages enable row level security;
alter table public.case_observations enable row level security;
alter table public.case_assessments enable row level security;
alter table public.case_actions enable row level security;
alter table public.case_outcomes enable row level security;
alter table public.case_photos enable row level security;
alter table public.case_followups enable row level security;
alter table public.usage_events enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists crop_cases_owner_select on public.crop_cases;
create policy crop_cases_owner_select on public.crop_cases
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists case_messages_owner_select on public.case_messages;
create policy case_messages_owner_select on public.case_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.crop_cases c
      where c.id = case_id and c.user_id = auth.uid()
    )
  );

drop policy if exists case_photos_owner_select on public.case_photos;
create policy case_photos_owner_select on public.case_photos
  for select to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists case_followups_owner_select on public.case_followups;
create policy case_followups_owner_select on public.case_followups
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists case_outcomes_owner_select on public.case_outcomes;
create policy case_outcomes_owner_select on public.case_outcomes
  for select to authenticated
  using (
    exists (
      select 1 from public.crop_cases c
      where c.id = case_id and c.user_id = auth.uid()
    )
  );

-- Promo codes are never readable by anon/authenticated clients.
drop policy if exists promo_codes_no_client on public.promo_codes;
create policy promo_codes_no_client on public.promo_codes
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

-- Guest and service-role writes continue through the server admin client.
grant select on public.crop_cases to authenticated;
grant select on public.case_messages to authenticated;
grant select on public.case_photos to authenticated;
grant select on public.case_followups to authenticated;
grant select on public.case_outcomes to authenticated;
