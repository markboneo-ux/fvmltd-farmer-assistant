-- Structured preliminary AI assessment fields + optional soil EC.
-- Apply after 20260731210000_case_photo_slots_and_storage.sql

alter table public.soil_tests
  add column if not exists electrical_conductivity numeric(10, 3);

comment on column public.soil_tests.electrical_conductivity is
  'Soil electrical conductivity (EC), if measured.';

alter table public.ai_assessments
  add column if not exists case_summary text,
  add column if not exists likely_causes jsonb not null default '[]'::jsonb,
  add column if not exists confidence_score numeric(5, 2)
    check (
      confidence_score is null
      or (confidence_score >= 0 and confidence_score <= 100)
    ),
  add column if not exists missing_information jsonb not null default '[]'::jsonb,
  add column if not exists immediate_safe_actions jsonb not null default '[]'::jsonb,
  add column if not exists human_review_required boolean not null default true,
  add column if not exists laboratory_test_needed boolean not null default false,
  add column if not exists product_recommendation_allowed boolean not null default false,
  add column if not exists urgency_level text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_assessments_urgency_level_check'
  ) then
    alter table public.ai_assessments
      add constraint ai_assessments_urgency_level_check
      check (
        urgency_level is null
        or urgency_level in ('low', 'moderate', 'high', 'critical')
      );
  end if;
end $$;

-- Keep legacy columns populated from structured fields when present
comment on column public.ai_assessments.case_summary is
  'Structured AI case summary (preliminary).';
comment on column public.ai_assessments.likely_causes is
  'JSON array of likely cause strings from the preliminary assessment.';
comment on column public.ai_assessments.confidence_score is
  'Model confidence 0–100 for the preliminary assessment.';
comment on column public.ai_assessments.missing_information is
  'JSON array of information still needed for a stronger diagnosis.';
comment on column public.ai_assessments.immediate_safe_actions is
  'JSON array of immediate safe actions (no unrestricted pesticide rates).';
comment on column public.ai_assessments.human_review_required is
  'Whether FVMLTD staff should review this case.';
comment on column public.ai_assessments.laboratory_test_needed is
  'Whether laboratory testing is recommended.';
comment on column public.ai_assessments.product_recommendation_allowed is
  'False unless a catalog-backed product recommendation is appropriate. AI must not invent products.';
comment on column public.ai_assessments.urgency_level is
  'Urgency: low, moderate, high, or critical.';

comment on table public.ai_assessments is
  'Preliminary AI crop assessments. Product rates/invented products are not allowed.';
