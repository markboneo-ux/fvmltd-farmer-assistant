-- Additive crop-health case state for conversational cases.
-- Safe on Preview and Production (IF NOT EXISTS). Does not drop data.

alter table public.crop_cases
  add column if not exists farming_area text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists growth_stage text,
  add column if not exists symptom_location text,
  add column if not exists onset text,
  add column if not exists spread text,
  add column if not exists percentage_affected text,
  add column if not exists recent_rainfall text,
  add column if not exists forecast_rainfall text,
  add column if not exists temperature text,
  add column if not exists humidity text,
  add column if not exists photo_findings text[] not null default '{}',
  add column if not exists diagnostic_confidence text,
  add column if not exists missing_information text[] not null default '{}',
  add column if not exists suspected_pest text,
  add column if not exists suspected_disease text,
  add column if not exists confirmed_diagnosis text,
  add column if not exists crop_health_state jsonb;

create index if not exists crop_cases_needs_review_idx
  on public.crop_cases (needs_review, updated_at desc);

notify pgrst, 'reload schema';
