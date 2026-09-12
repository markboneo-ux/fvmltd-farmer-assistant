-- =============================================================================
-- PREVIEW ONLY — run in the SQL editor for project gcojtfrdjczrvzieynzj
-- Do NOT run this against Production (qzycpoivwwecooscnnju).
--
-- Overview insights failed with "Insights are temporarily unavailable" while
-- Cases still loaded because /api/admin/insights reads optional tables
-- (case_messages, case_photos, case_followups, case_outcomes, case_trends,
-- usage_events, web_research_events, trusted_sources, farmer_profiles) and
-- previously treated any one of those PostgREST errors as a hard 503.
-- Crop-check queue reads crop_checks with an embedded farmer_profiles join.
-- =============================================================================

create extension if not exists "pgcrypto";

-- Conversational insight tables (create if Preview never received later migrations)
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

-- Additive columns used by current selects / upserts
alter table public.case_messages
  add column if not exists conversation_intent text,
  add column if not exists question_category text,
  add column if not exists input_mode text not null default 'text',
  add column if not exists audio_duration_seconds numeric,
  add column if not exists audio_storage_path text,
  add column if not exists transcription_confidence numeric;

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

-- Crop-check queue tables (Preview never received the guided crop_checks schema)
create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  name text not null,
  village text,
  district text,
  region text,
  country text,
  location_description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.crop_cycles (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  crop_name text not null,
  variety text,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.crop_checks (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  farm_id uuid references public.farms (id) on delete set null,
  crop_cycle_id uuid references public.crop_cycles (id) on delete set null,
  crop_name text not null,
  status text not null default 'draft',
  is_urgent boolean not null default false,
  awaiting_farmer_reply boolean not null default false,
  percent_affected numeric(5, 2),
  submitted_at timestamptz,
  completed_at timestamptz,
  severity text,
  staff_notes text,
  closed_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  crop_check_id uuid not null references public.crop_checks (id) on delete cascade,
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  confidence numeric(5, 2),
  confidence_score numeric(5, 2),
  urgency_level text,
  human_review_required boolean not null default true,
  missing_information jsonb not null default '[]'::jsonb,
  raw_response jsonb,
  assessed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Crop-check queue FK so PostgREST can embed farmer_profiles
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'crop_checks'
  ) and exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'farmer_profiles'
  ) and not exists (
    select 1 from pg_constraint where conname = 'crop_checks_farmer_id_fkey'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_farmer_id_fkey
      foreign key (farmer_id) references public.farmer_profiles (id) on delete cascade;
  end if;
end;
$$;

-- Grants: missing service_role grants look like permission denied / schema cache misses
do $$
declare
  t text;
begin
  foreach t in array array[
    'crop_cases', 'case_messages', 'case_observations', 'case_assessments',
    'case_actions', 'case_outcomes', 'case_photos', 'case_followups',
    'guest_sessions', 'usage_events', 'user_entitlements', 'app_settings',
    'promo_codes', 'promo_redemptions', 'case_trends', 'trusted_sources',
    'country_registered_chemicals', 'web_research_events', 'case_web_citations',
    'farmer_profiles', 'crop_checks', 'farms', 'crop_cycles', 'assessment_results',
    'staff_profiles'
  ]
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('grant all on table public.%I to postgres, service_role', t);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
