-- Idempotent dashboard grants and optional insight tables.
-- Safe on Production (IF NOT EXISTS / grant only when the table exists).
-- Preview (gcojtfrdjczrvzieynzj) also has docs/preview-dashboard-tables.sql
-- for a manual SQL-editor run because this agent cannot apply SQL there.

create extension if not exists "pgcrypto";

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
    'farmer_profiles', 'crop_checks', 'farms', 'crop_cycles', 'assessment_results'
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
