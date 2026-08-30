-- =============================================================================
-- Agronomy case memory — additive Caribbean crop intelligence layer
-- =============================================================================
-- Does NOT replace crop_checks / chat_messages / assessment_results.
-- Those remain the guided Crop Check + staff-review tables.
--
-- These tables store conversational AI cases (including guests), outcomes,
-- and agronomist corrections so future answers can retrieve similar cases.
-- The language model is not retrained from these rows.
-- =============================================================================

create table if not exists public.agronomy_cases (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid references public.farmer_profiles (id) on delete set null,
  session_id text not null,
  country text,
  district text,
  farm text,
  crop text,
  variety text,
  plant_age text,
  production_system text,
  farmer_scale text,
  area_planted text,
  problem_reported text,
  symptoms text,
  field_distribution text,
  photo_count integer not null default 0,
  soil_or_medium text,
  irrigation text,
  drainage text,
  fertilizer_history text,
  crop_protection_history text,
  weather_conditions text,
  suspected_causes text,
  confidence text,
  actions_recommended text[] not null default '{}',
  actions_actually_taken text,
  follow_up_result text,
  crop_outcome text,
  confirmed_diagnosis text,
  yield_impact text,
  follow_up_due_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists agronomy_cases_session_id_idx
  on public.agronomy_cases (session_id);
create index if not exists agronomy_cases_farmer_id_idx
  on public.agronomy_cases (farmer_id);
create index if not exists agronomy_cases_crop_country_idx
  on public.agronomy_cases (crop, country, district);
create index if not exists agronomy_cases_follow_up_due_idx
  on public.agronomy_cases (follow_up_due_at)
  where follow_up_due_at is not null and crop_outcome is null;

drop trigger if exists agronomy_cases_set_updated_at on public.agronomy_cases;
create trigger agronomy_cases_set_updated_at
before update on public.agronomy_cases
for each row execute function public.set_updated_at();

comment on table public.agronomy_cases is
  'Structured conversational crop cases for retrieval-based improvement. Separate from crop_checks.';

create table if not exists public.agronomy_case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.agronomy_cases (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists agronomy_case_messages_case_id_idx
  on public.agronomy_case_messages (case_id, created_at);

comment on table public.agronomy_case_messages is
  'Conversation transcript for an agronomy_cases row. Structured case state lives on agronomy_cases.';

create table if not exists public.agronomy_case_outcomes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.agronomy_cases (id) on delete cascade,
  crop_outcome text not null
    check (crop_outcome in ('improved', 'unchanged', 'worse', 'solved')),
  actions_taken text,
  days_after_recommendation integer,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists agronomy_case_outcomes_case_id_idx
  on public.agronomy_case_outcomes (case_id, created_at desc);

comment on table public.agronomy_case_outcomes is
  'Farmer-reported outcomes. Never overwrite the original AI recommendation.';

create table if not exists public.agronomy_case_reviews (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.agronomy_cases (id) on delete cascade,
  staff_profile_id uuid references public.staff_profiles (id) on delete set null,
  verdict text not null
    check (verdict in ('correct', 'partly_correct', 'incorrect')),
  confirmed_diagnosis text,
  recommended_correction text,
  requires_lab_confirmation boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists agronomy_case_reviews_case_id_idx
  on public.agronomy_case_reviews (case_id, created_at desc);

comment on table public.agronomy_case_reviews is
  'Agronomist corrections stored as separate reviewed evidence. Historical AI answers are not overwritten.';

alter table public.agronomy_cases enable row level security;
alter table public.agronomy_case_messages enable row level security;
alter table public.agronomy_case_outcomes enable row level security;
alter table public.agronomy_case_reviews enable row level security;
