-- Additive: general-assistant metadata, knowledge trust, and trend aggregation.
-- Does not drop or rename existing tables.

alter table public.crop_cases
  add column if not exists conversation_intent text,
  add column if not exists question_category text,
  add column if not exists calculation_type text,
  add column if not exists case_type text,
  add column if not exists knowledge_state text not null default 'raw',
  add column if not exists business_metadata jsonb;

alter table public.case_messages
  add column if not exists conversation_intent text,
  add column if not exists question_category text;

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

alter table public.case_trends enable row level security;

drop policy if exists case_trends_staff_select on public.case_trends;
create policy case_trends_staff_select on public.case_trends
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles s
      where s.is_active = true
        and (s.auth_user_id = auth.uid() or s.id = auth.uid())
    )
  );

grant select on public.case_trends to authenticated;
