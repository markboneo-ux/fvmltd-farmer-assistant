-- =============================================================================
-- Farmer journey schema readiness (additive)
-- =============================================================================
-- Production still has the pre-app farms / crop_checks shape and is missing
-- crop_cycles, soil_tests, follow_ups, storage bucket, and guided/photo columns.
-- Earlier migrations were marked applied without fully materializing these.
-- This migration is additive only — it does not drop data or rewrite history.
-- =============================================================================

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- farms — columns required by Add Farm + dashboard
-- ---------------------------------------------------------------------------
alter table public.farms
  add column if not exists location_description text,
  add column if not exists district text,
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6),
  add column if not exists farm_size numeric(10, 3),
  add column if not exists farm_size_unit text,
  add column if not exists drainage_condition text,
  add column if not exists growing_system text,
  add column if not exists primary_crops text[] not null default '{}',
  add column if not exists is_active boolean not null default true;

update public.farms
set region = district
where district is not null and (region is null or region = '');

update public.farms
set district = region
where district is null and region is not null and region <> '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'farms_farm_size_unit_check'
  ) then
    alter table public.farms
      add constraint farms_farm_size_unit_check
      check (
        farm_size_unit is null
        or farm_size_unit in ('acres', 'hectares')
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'farms_farm_size_positive_check'
  ) then
    alter table public.farms
      add constraint farms_farm_size_positive_check
      check (farm_size is null or farm_size > 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'farms_water_source_check'
  ) then
    alter table public.farms
      add constraint farms_water_source_check
      check (
        water_source is null
        or water_source in (
          'rainfed', 'river', 'borehole', 'well',
          'irrigation_canal', 'dam', 'municipal', 'other'
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'farms_drainage_condition_check'
  ) then
    alter table public.farms
      add constraint farms_drainage_condition_check
      check (
        drainage_condition is null
        or drainage_condition in (
          'well_drained', 'moderately_drained', 'poorly_drained',
          'waterlogged', 'unknown'
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'farms_growing_system_check'
  ) then
    alter table public.farms
      add constraint farms_growing_system_check
      check (
        growing_system is null
        or growing_system in (
          'open_field', 'shade_house', 'greenhouse', 'mixed', 'other'
        )
      );
  end if;
end;
$$;

create index if not exists farms_farmer_id_idx on public.farms (farmer_id);
create index if not exists farms_district_idx on public.farms (district);
create index if not exists farms_is_active_idx on public.farms (is_active);

drop trigger if exists farms_set_updated_at on public.farms;
create trigger farms_set_updated_at
before update on public.farms
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- crop_cycles — missing entirely on production
-- ---------------------------------------------------------------------------
create table if not exists public.crop_cycles (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  crop_name text not null,
  variety text,
  planting_date date,
  expected_harvest_date date,
  growth_stage text,
  status text not null default 'active'
    check (status in ('planned', 'active', 'harvested', 'abandoned')),
  area_planted numeric(10, 3),
  area_unit text,
  area_hectares numeric(10, 3),
  plant_count integer,
  growing_environment text,
  previous_crop text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.crop_cycles
  add column if not exists area_planted numeric(10, 3),
  add column if not exists area_unit text,
  add column if not exists area_hectares numeric(10, 3),
  add column if not exists plant_count integer,
  add column if not exists growing_environment text,
  add column if not exists previous_crop text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_cycles_area_unit_check'
  ) then
    alter table public.crop_cycles
      add constraint crop_cycles_area_unit_check
      check (area_unit is null or area_unit in ('acres', 'hectares'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_cycles_area_planted_positive_check'
  ) then
    alter table public.crop_cycles
      add constraint crop_cycles_area_planted_positive_check
      check (area_planted is null or area_planted > 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_cycles_plant_count_positive_check'
  ) then
    alter table public.crop_cycles
      add constraint crop_cycles_plant_count_positive_check
      check (plant_count is null or plant_count > 0);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_cycles_growing_environment_check'
  ) then
    alter table public.crop_cycles
      add constraint crop_cycles_growing_environment_check
      check (
        growing_environment is null
        or growing_environment in ('open_field', 'shade_house', 'greenhouse')
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_cycles_growth_stage_check'
  ) then
    alter table public.crop_cycles
      add constraint crop_cycles_growth_stage_check
      check (
        growth_stage is null
        or growth_stage in (
          'nursery', 'transplanting', 'vegetative', 'flowering',
          'fruiting', 'maturity', 'harvest', 'other'
        )
      );
  end if;
end;
$$;

create index if not exists crop_cycles_farm_id_idx on public.crop_cycles (farm_id);
create index if not exists crop_cycles_status_idx on public.crop_cycles (status);
create index if not exists crop_cycles_crop_name_idx on public.crop_cycles (crop_name);

drop trigger if exists crop_cycles_set_updated_at on public.crop_cycles;
create trigger crop_cycles_set_updated_at
before update on public.crop_cycles
for each row execute function public.set_updated_at();

alter table public.crop_cycles enable row level security;

-- ---------------------------------------------------------------------------
-- crop_checks — guided crop-check columns + status values used by the app
-- ---------------------------------------------------------------------------
alter table public.crop_checks
  add column if not exists crop_cycle_id uuid,
  add column if not exists assigned_staff_id uuid,
  add column if not exists title text,
  add column if not exists description text,
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
  add column if not exists completed_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists is_urgent boolean not null default false,
  add column if not exists awaiting_farmer_reply boolean not null default false,
  add column if not exists staff_notes text,
  add column if not exists closed_reason text,
  add column if not exists reviewed_by_staff_id uuid;

update public.crop_checks
set description = symptoms
where description is null and symptoms is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_checks_crop_cycle_id_fkey'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_crop_cycle_id_fkey
      foreign key (crop_cycle_id) references public.crop_cycles (id) on delete set null;
  end if;
end;
$$;

alter table public.crop_checks drop constraint if exists crop_checks_status_check;
alter table public.crop_checks
  add constraint crop_checks_status_check
  check (
    status in (
      'draft', 'submitted', 'open', 'in_review', 'awaiting_info',
      'completed', 'resolved', 'closed', 'archived'
    )
  );

alter table public.crop_checks drop constraint if exists crop_checks_severity_check;
alter table public.crop_checks
  add constraint crop_checks_severity_check
  check (
    severity is null
    or severity in ('low', 'mild', 'moderate', 'high', 'critical')
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_checks_symptom_location_check'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_symptom_location_check
      check (
        symptom_location is null
        or symptom_location in (
          'young_leaves', 'old_leaves', 'fruit', 'stem', 'roots', 'whole_plant'
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_checks_percent_affected_check'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_percent_affected_check
      check (
        percent_affected is null
        or (percent_affected >= 0 and percent_affected <= 100)
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_checks_irrigation_frequency_check'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_irrigation_frequency_check
      check (
        irrigation_frequency is null
        or irrigation_frequency in (
          'daily', 'every_2_3_days', 'weekly', 'rarely',
          'rainfed_only', 'unknown'
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_checks_drainage_condition_check'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_drainage_condition_check
      check (
        drainage_condition is null
        or drainage_condition in (
          'well_drained', 'moderately_drained', 'poorly_drained',
          'waterlogged', 'unknown'
        )
      );
  end if;
end;
$$;

create index if not exists crop_checks_crop_cycle_id_idx on public.crop_checks (crop_cycle_id);
create index if not exists crop_checks_farmer_id_idx on public.crop_checks (farmer_id);
create index if not exists crop_checks_status_idx on public.crop_checks (status);

drop trigger if exists crop_checks_set_updated_at on public.crop_checks;
create trigger crop_checks_set_updated_at
before update on public.crop_checks
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- crop_photos — slot metadata used by guided photo step
-- ---------------------------------------------------------------------------
alter table public.crop_photos
  add column if not exists slot_key text,
  add column if not exists storage_bucket text not null default 'case-photos',
  add column if not exists label text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists is_skipped boolean not null default false,
  add column if not exists uploaded_at timestamptz not null default timezone('utc', now());

alter table public.crop_photos alter column storage_path drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_photos_slot_key_check'
  ) then
    alter table public.crop_photos
      add constraint crop_photos_slot_key_check
      check (
        slot_key is null
        or slot_key in (
          'whole_field', 'whole_plant', 'leaf_front', 'leaf_back',
          'damage_detail', 'healthy_comparison'
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_photos_crop_check_id_slot_key_key'
  ) then
    alter table public.crop_photos
      add constraint crop_photos_crop_check_id_slot_key_key
      unique (crop_check_id, slot_key);
  end if;
end;
$$;

create index if not exists crop_photos_crop_check_id_idx on public.crop_photos (crop_check_id);
create index if not exists crop_photos_farmer_id_idx on public.crop_photos (farmer_id);

drop trigger if exists crop_photos_set_updated_at on public.crop_photos;
create trigger crop_photos_set_updated_at
before update on public.crop_photos
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- assessment_results — structured fields used by preliminary AI assessment
-- ---------------------------------------------------------------------------
alter table public.assessment_results
  add column if not exists case_summary text,
  add column if not exists likely_causes jsonb not null default '[]'::jsonb,
  add column if not exists confidence_score numeric(5, 2),
  add column if not exists missing_information jsonb not null default '[]'::jsonb,
  add column if not exists immediate_safe_actions jsonb not null default '[]'::jsonb,
  add column if not exists human_review_required boolean not null default true,
  add column if not exists laboratory_test_needed boolean not null default false,
  add column if not exists product_recommendation_allowed boolean not null default false,
  add column if not exists urgency_level text,
  add column if not exists raw_response jsonb,
  add column if not exists assessed_at timestamptz not null default timezone('utc', now()),
  add column if not exists staff_status text not null default 'pending',
  add column if not exists approved_by_staff_id uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists staff_case_summary text,
  add column if not exists staff_likely_causes jsonb,
  add column if not exists staff_immediate_actions jsonb,
  add column if not exists staff_missing_information jsonb,
  add column if not exists staff_urgency_level text,
  add column if not exists staff_edit_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assessment_results_crop_check_id_key'
  ) then
    begin
      alter table public.assessment_results
        add constraint assessment_results_crop_check_id_key unique (crop_check_id);
    exception
      when unique_violation then
        raise notice 'assessment_results has duplicate crop_check_id values; unique skipped';
    end;
  end if;
end;
$$;

alter table public.assessment_results drop constraint if exists assessment_results_severity_check;
alter table public.assessment_results
  add constraint assessment_results_severity_check
  check (
    severity is null
    or severity in ('low', 'mild', 'moderate', 'high', 'critical')
  );

alter table public.assessment_results drop constraint if exists assessment_results_staff_status_check;
alter table public.assessment_results
  add constraint assessment_results_staff_status_check
  check (staff_status in ('pending', 'approved', 'edited', 'rejected'));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assessment_results_urgency_level_check'
  ) then
    alter table public.assessment_results
      add constraint assessment_results_urgency_level_check
      check (
        urgency_level is null
        or urgency_level in ('low', 'moderate', 'high', 'critical')
      );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- soil_tests + follow_ups (used by assessment context / human-review handoff)
-- ---------------------------------------------------------------------------
create table if not exists public.soil_tests (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  sampled_at date not null,
  lab_name text,
  ph numeric(4, 2),
  electrical_conductivity numeric(10, 3),
  nitrogen numeric(10, 3),
  phosphorus numeric(10, 3),
  potassium numeric(10, 3),
  organic_matter_pct numeric(5, 2),
  moisture_pct numeric(5, 2),
  notes text,
  raw_results jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.soil_tests enable row level security;

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  crop_check_id uuid not null references public.crop_checks (id) on delete cascade,
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  assigned_staff_id uuid references public.staff_profiles (id) on delete set null,
  title text not null,
  notes text,
  follow_up_type text not null default 'review',
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.follow_ups enable row level security;

-- ---------------------------------------------------------------------------
-- Storage bucket for crop photographs (private)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'case-photos',
      'case-photos',
      false,
      10485760,
      array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    )
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;
