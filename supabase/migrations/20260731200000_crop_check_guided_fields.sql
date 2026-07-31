-- Guided Crop Check fields for crop_cases.
-- Apply after 20260731193000_farm_crop_cycle_fields.sql

-- Allow draft (incomplete) cases in the existing status column.
alter table public.crop_cases drop constraint if exists crop_cases_status_check;
alter table public.crop_cases
  add constraint crop_cases_status_check
  check (status in ('draft', 'open', 'in_review', 'resolved', 'closed'));

alter table public.crop_cases
  add column if not exists first_observed_on date,
  add column if not exists symptom_location text,
  add column if not exists is_spreading boolean,
  add column if not exists percent_affected numeric(5, 2),
  add column if not exists recent_fertilizer text,
  add column if not exists recent_spray text,
  add column if not exists irrigation_frequency text,
  add column if not exists drainage_condition text,
  add column if not exists recent_heavy_rainfall boolean,
  add column if not exists guided_step text,
  add column if not exists completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_cases_symptom_location_check'
  ) then
    alter table public.crop_cases
      add constraint crop_cases_symptom_location_check
      check (
        symptom_location is null
        or symptom_location in (
          'young_leaves',
          'old_leaves',
          'fruit',
          'stem',
          'roots',
          'whole_plant'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_cases_percent_affected_check'
  ) then
    alter table public.crop_cases
      add constraint crop_cases_percent_affected_check
      check (
        percent_affected is null
        or (percent_affected >= 0 and percent_affected <= 100)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_cases_irrigation_frequency_check'
  ) then
    alter table public.crop_cases
      add constraint crop_cases_irrigation_frequency_check
      check (
        irrigation_frequency is null
        or irrigation_frequency in (
          'daily',
          'every_2_3_days',
          'weekly',
          'rarely',
          'rainfed_only',
          'unknown'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_cases_drainage_condition_check'
  ) then
    alter table public.crop_cases
      add constraint crop_cases_drainage_condition_check
      check (
        drainage_condition is null
        or drainage_condition in (
          'well_drained',
          'moderately_drained',
          'poorly_drained',
          'waterlogged',
          'unknown'
        )
      );
  end if;
end $$;

create index if not exists crop_cases_guided_step_idx on public.crop_cases (guided_step);

comment on column public.crop_cases.first_observed_on is
  'Date the farmer first noticed the problem.';
comment on column public.crop_cases.symptom_location is
  'Where symptoms began: young_leaves, old_leaves, fruit, stem, roots, or whole_plant.';
comment on column public.crop_cases.is_spreading is
  'Whether the farmer reports the problem is spreading.';
comment on column public.crop_cases.percent_affected is
  'Estimated percentage of the crop affected (0–100).';
comment on column public.crop_cases.recent_fertilizer is
  'Recent fertilizer applications described by the farmer.';
comment on column public.crop_cases.recent_spray is
  'Recent spray applications described by the farmer.';
comment on column public.crop_cases.irrigation_frequency is
  'How often the crop is irrigated.';
comment on column public.crop_cases.drainage_condition is
  'Drainage condition reported during the crop check.';
comment on column public.crop_cases.recent_heavy_rainfall is
  'Whether there has been recent heavy rainfall.';
comment on column public.crop_cases.guided_step is
  'Current step key in the guided crop-check workflow.';
comment on column public.crop_cases.completed_at is
  'When the guided crop-check questionnaire was completed.';
