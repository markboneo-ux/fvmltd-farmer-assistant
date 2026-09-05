-- Additive alignment so a Preview database that already has crop_cases /
-- case_messages can catch up to Production without dropping tables or data.
-- Safe to run on Production (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- Does not rewrite existing rows except blank farmer/farm country strings.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- staff_profiles.auth_user_id (needed by later RLS policies)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'staff_profiles'
  ) then
    alter table public.staff_profiles
      add column if not exists auth_user_id uuid;
    create index if not exists staff_profiles_auth_user_id_idx
      on public.staff_profiles (auth_user_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- crop_cases columns required by the current app write path
-- ---------------------------------------------------------------------------
alter table public.crop_cases
  add column if not exists conversation_intent text,
  add column if not exists question_category text,
  add column if not exists calculation_type text,
  add column if not exists case_type text,
  add column if not exists knowledge_state text not null default 'raw',
  add column if not exists business_metadata jsonb,
  add column if not exists diagnosis_incorrect boolean not null default false,
  add column if not exists needs_review boolean not null default false,
  add column if not exists useful_for_trend boolean not null default false,
  add column if not exists exclude_from_learning boolean not null default false,
  add column if not exists review_notes text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists include_in_trend_learning boolean not null default true;

-- ---------------------------------------------------------------------------
-- case_messages columns
-- ---------------------------------------------------------------------------
alter table public.case_messages
  add column if not exists conversation_intent text,
  add column if not exists question_category text;

-- ---------------------------------------------------------------------------
-- Core conversational / research tables (create if Preview is missing them)
-- ---------------------------------------------------------------------------
create table if not exists public.case_trends (
  id text primary key,
  country text,
  region text,
  crop text,
  variety text,
  symptom_cluster text not null default 'unspecified',
  suspected_issue text,
  case_count integer not null default 0,
  unique_session_count integer not null default 0,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  confidence_score numeric not null default 0,
  reviewed_case_count integer not null default 0,
  confirmed_case_count integer not null default 0,
  positive_outcome_count integer not null default 0,
  trend_status text not null default 'emerging',
  staff_reviewed boolean not null default false,
  notes text,
  contributing_case_ids text[] not null default '{}',
  contributing_session_keys text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists case_trends_crop_region_idx
  on public.case_trends (crop, region, trend_status);

create table if not exists public.trusted_sources (
  id text primary key,
  name text not null,
  country text not null,
  url text not null,
  domain text not null,
  category text not null,
  trust_level text not null,
  last_checked_at timestamptz not null default timezone('utc', now()),
  notes text
);

create table if not exists public.country_registered_chemicals (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  crop text,
  target_pest_or_disease text,
  active_ingredient text not null,
  trade_name text,
  registration_status text not null default 'unverified',
  registration_source text,
  source_url text,
  last_verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists country_registered_chemicals_country_idx
  on public.country_registered_chemicals (country, active_ingredient);

create table if not exists public.web_research_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid,
  used_web boolean not null default false,
  need text not null,
  sources text[] not null default '{}',
  failures jsonb not null default '[]'::jsonb,
  outdated_sources text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.case_web_citations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.crop_cases (id) on delete cascade,
  url text not null,
  retrieved_at timestamptz not null default timezone('utc', now()),
  title text,
  source_name text,
  country text,
  source_type text,
  published_at timestamptz
);

alter table public.trusted_sources
  add column if not exists source_name text,
  add column if not exists homepage_url text,
  add column if not exists source_type text,
  add column if not exists active boolean not null default true,
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists preferred_for text[] not null default '{}',
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.web_research_events
  add column if not exists country text,
  add column if not exists topics text[] not null default '{}',
  add column if not exists used boolean,
  add column if not exists failed boolean not null default false,
  add column if not exists stale_warnings integer not null default 0,
  add column if not exists source_names text[] not null default '{}',
  add column if not exists correlation_id text;

-- ---------------------------------------------------------------------------
-- Do not silently assign Trinidad and Tobago (no row rewrites of real countries)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'farmer_profiles' and column_name = 'country'
  ) then
    execute 'alter table public.farmer_profiles alter column country drop default';
    update public.farmer_profiles
      set country = null
      where country is not null and btrim(country) = '';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'farms' and column_name = 'country'
  ) then
    execute 'alter table public.farms alter column country drop default';
    update public.farms
      set country = null
      where country is not null and btrim(country) = '';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS + grants so PostgREST / service_role can persist chats
-- ---------------------------------------------------------------------------
alter table public.crop_cases enable row level security;
alter table public.case_messages enable row level security;
alter table public.case_trends enable row level security;
alter table public.trusted_sources enable row level security;
alter table public.country_registered_chemicals enable row level security;
alter table public.web_research_events enable row level security;
alter table public.case_web_citations enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'crop_cases', 'case_messages', 'case_observations', 'case_assessments',
    'case_actions', 'case_outcomes', 'case_photos', 'case_followups',
    'guest_sessions', 'usage_events', 'user_entitlements', 'app_settings',
    'promo_codes', 'promo_redemptions', 'case_trends', 'trusted_sources',
    'country_registered_chemicals', 'web_research_events', 'case_web_citations'
  ]
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('grant all on table public.%I to postgres, service_role', t);
    end if;
  end loop;
  foreach t in array array[
    'crop_cases', 'case_messages', 'case_trends', 'trusted_sources',
    'country_registered_chemicals', 'web_research_events', 'case_web_citations'
  ]
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('grant select on table public.%I to authenticated', t);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
