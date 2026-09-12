-- Additive catch-up for Preview (gcojtfrdjczrvzieynzj) tables that later
-- migrations created but this database never received:
--   case_trends, web_research_events, trusted_sources,
--   farms, crop_cycles, crop_checks, assessment_results
--
-- Column names, types, indexes, checks, RLS, and grants are copied from
-- supabase/migrations/20260731180000_initial_schema.sql,
-- 20260904120000_general_assistant_trends.sql,
-- 20260904180000_research_admin_review.sql,
-- 20260905120000_country_research_staff_review.sql,
-- and 20260905190000_crop_cases_service_role_grants.sql.
-- App reads/writes for these tables are in src/lib/trends/store.ts,
-- src/lib/research/persist.ts, src/lib/staff/cases.ts, src/lib/farms/map.ts,
-- src/lib/crop-cycles/map.ts, src/lib/crop-check/map.ts,
-- src/lib/assessment/map.ts, and src/lib/assessment/runAssessment.ts.
--
-- Safe: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- Does not drop tables, policies on other tables, or rewrite existing rows.
-- Do not run against Production unless you intend a no-op catch-up there.

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
-- case_trends  (20260904120000_general_assistant_trends.sql)
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

alter table public.case_trends
  add column if not exists country text,
  add column if not exists region text,
  add column if not exists crop text,
  add column if not exists variety text,
  add column if not exists symptom_cluster text not null default 'unspecified',
  add column if not exists suspected_issue text,
  add column if not exists case_count integer not null default 0,
  add column if not exists unique_session_count integer not null default 0,
  add column if not exists first_seen_at timestamptz not null default timezone('utc', now()),
  add column if not exists last_seen_at timestamptz not null default timezone('utc', now()),
  add column if not exists confidence_score numeric not null default 0,
  add column if not exists reviewed_case_count integer not null default 0,
  add column if not exists confirmed_case_count integer not null default 0,
  add column if not exists positive_outcome_count integer not null default 0,
  add column if not exists trend_status text not null default 'emerging',
  add column if not exists staff_reviewed boolean not null default false,
  add column if not exists notes text,
  add column if not exists contributing_case_ids text[] not null default '{}',
  add column if not exists contributing_session_keys text[] not null default '{}',
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists case_trends_crop_region_idx
  on public.case_trends (crop, region, trend_status);

-- ---------------------------------------------------------------------------
-- trusted_sources  (20260904180000 + 20260905120000 extra columns)
-- ---------------------------------------------------------------------------
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

alter table public.trusted_sources
  add column if not exists name text,
  add column if not exists country text,
  add column if not exists url text,
  add column if not exists domain text,
  add column if not exists category text,
  add column if not exists trust_level text,
  add column if not exists last_checked_at timestamptz not null default timezone('utc', now()),
  add column if not exists notes text,
  add column if not exists source_name text,
  add column if not exists homepage_url text,
  add column if not exists source_type text,
  add column if not exists active boolean not null default true,
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists preferred_for text[] not null default '{}',
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

insert into public.trusted_sources (id, name, country, url, domain, category, trust_level, last_checked_at, notes)
values
  ('tt-namis', 'NAMDEVCO NAMIS market data', 'Trinidad and Tobago', 'https://namistt.com/', 'namistt.com', 'market_prices', 'statutory_authority', '2026-09-01T00:00:00Z', 'Wholesale prices and volumes'),
  ('tt-namdevco', 'NAMDEVCO', 'Trinidad and Tobago', 'https://www.namdevco.com/market-information', 'namdevco.com', 'market_prices', 'statutory_authority', '2026-09-01T00:00:00Z', null),
  ('tt-malaf', 'Ministry of Agriculture, Land and Fisheries', 'Trinidad and Tobago', 'https://agriculture.gov.tt/', 'agriculture.gov.tt', 'government_guidance', 'official_government', '2026-09-01T00:00:00Z', null),
  ('cardi', 'CARDI', 'Caribbean', 'https://www.cardi.org/', 'cardi.org', 'research', 'research_institution', '2026-09-01T00:00:00Z', null),
  ('uwi-sta', 'The University of the West Indies', 'Caribbean', 'https://sta.uwi.edu/', 'uwi.edu', 'research', 'research_institution', '2026-09-01T00:00:00Z', null),
  ('gy-ptccb', 'Guyana Pesticides and Toxic Chemicals Control Board', 'Guyana', 'https://ptccb.org.gy/', 'ptccb.org.gy', 'pesticide_registration', 'official_government', '2026-09-01T00:00:00Z', null)
on conflict (id) do nothing;

update public.trusted_sources
set source_name = coalesce(source_name, name),
    homepage_url = coalesce(homepage_url, url),
    source_type = coalesce(source_type, category),
    last_reviewed_at = coalesce(last_reviewed_at, last_checked_at)
where source_name is null or homepage_url is null;

-- ---------------------------------------------------------------------------
-- web_research_events  (20260904180000 + 20260905120000 extra columns)
-- ---------------------------------------------------------------------------
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

alter table public.web_research_events
  add column if not exists case_id uuid,
  add column if not exists used_web boolean not null default false,
  add column if not exists need text,
  add column if not exists sources text[] not null default '{}',
  add column if not exists failures jsonb not null default '[]'::jsonb,
  add column if not exists outdated_sources text[] not null default '{}',
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists country text,
  add column if not exists topics text[] not null default '{}',
  add column if not exists used boolean,
  add column if not exists failed boolean not null default false,
  add column if not exists stale_warnings integer not null default 0,
  add column if not exists source_names text[] not null default '{}',
  add column if not exists correlation_id text;

create index if not exists web_research_events_created_idx
  on public.web_research_events (created_at desc);

-- ---------------------------------------------------------------------------
-- farms  (20260731180000_initial_schema.sql; country has no Trinidad default)
-- ---------------------------------------------------------------------------
create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  name text not null,
  village text,
  region text,
  country text,
  size_hectares numeric(10, 3),
  soil_type text,
  water_source text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.farms
  add column if not exists farmer_id uuid,
  add column if not exists name text,
  add column if not exists village text,
  add column if not exists region text,
  add column if not exists country text,
  add column if not exists size_hectares numeric(10, 3),
  add column if not exists soil_type text,
  add column if not exists water_source text,
  add column if not exists notes text,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists location_description text,
  add column if not exists district text,
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6),
  add column if not exists farm_size numeric(10, 3),
  add column if not exists farm_size_unit text,
  add column if not exists drainage_condition text,
  add column if not exists growing_system text,
  add column if not exists primary_crops text[] not null default '{}';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'farms' and column_name = 'country'
  ) then
    execute 'alter table public.farms alter column country drop default';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'farms_farmer_id_fkey'
  ) then
    alter table public.farms
      add constraint farms_farmer_id_fkey
      foreign key (farmer_id) references public.farmer_profiles (id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'farms_size_hectares_nonnegative'
  ) then
    alter table public.farms
      add constraint farms_size_hectares_nonnegative
      check (size_hectares is null or size_hectares >= 0);
  end if;
end;
$$;

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
create index if not exists farms_region_idx on public.farms (region);
create index if not exists farms_country_idx on public.farms (country);
create index if not exists farms_district_idx on public.farms (district);
create index if not exists farms_is_active_idx on public.farms (is_active);

drop trigger if exists farms_set_updated_at on public.farms;
create trigger farms_set_updated_at
before update on public.farms
for each row execute function public.set_updated_at();

comment on table public.farms is 'Physical farm plots belonging to a farmer_profiles row.';
comment on column public.farms.country is
  'Farm country. NULL means unknown. Never default to Trinidad and Tobago.';

-- ---------------------------------------------------------------------------
-- crop_cycles  (20260731180000_initial_schema.sql)
-- ---------------------------------------------------------------------------
create table if not exists public.crop_cycles (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  crop_name text not null,
  variety text,
  planting_date date,
  expected_harvest_date date,
  growth_stage text,
  status text not null default 'active',
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
  add column if not exists farm_id uuid,
  add column if not exists crop_name text,
  add column if not exists variety text,
  add column if not exists planting_date date,
  add column if not exists expected_harvest_date date,
  add column if not exists growth_stage text,
  add column if not exists status text not null default 'active',
  add column if not exists area_planted numeric(10, 3),
  add column if not exists area_unit text,
  add column if not exists area_hectares numeric(10, 3),
  add column if not exists plant_count integer,
  add column if not exists growing_environment text,
  add column if not exists previous_crop text,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_cycles_farm_id_fkey'
  ) then
    alter table public.crop_cycles
      add constraint crop_cycles_farm_id_fkey
      foreign key (farm_id) references public.farms (id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_cycles_status_check'
  ) then
    alter table public.crop_cycles
      add constraint crop_cycles_status_check
      check (status in ('planned', 'active', 'harvested', 'abandoned'));
  end if;
end;
$$;

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

-- ---------------------------------------------------------------------------
-- crop_checks  (20260731180000_initial_schema.sql)
-- PostgREST embeds farmer_profiles / farms / crop_cycles / assessment_results
-- via these foreign keys (src/lib/staff/cases.ts QUEUE_CASE_SELECT).
-- ---------------------------------------------------------------------------
create table if not exists public.crop_checks (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  farm_id uuid references public.farms (id) on delete set null,
  crop_name text not null,
  growth_stage text,
  symptoms text,
  notes text,
  status text not null default 'draft',
  severity text,
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.crop_checks
  add column if not exists farmer_id uuid,
  add column if not exists farm_id uuid,
  add column if not exists crop_name text,
  add column if not exists growth_stage text,
  add column if not exists symptoms text,
  add column if not exists notes text,
  add column if not exists status text not null default 'draft',
  add column if not exists severity text,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
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

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_checks_farmer_id_fkey'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_farmer_id_fkey
      foreign key (farmer_id) references public.farmer_profiles (id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_checks_farm_id_fkey'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_farm_id_fkey
      foreign key (farm_id) references public.farms (id) on delete set null;
  end if;
end;
$$;

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

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_checks_assigned_staff_id_fkey'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_assigned_staff_id_fkey
      foreign key (assigned_staff_id) references public.staff_profiles (id) on delete set null;
  end if;
exception
  when undefined_table then null;
  when undefined_column then null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_checks_reviewed_by_staff_id_fkey'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_reviewed_by_staff_id_fkey
      foreign key (reviewed_by_staff_id) references public.staff_profiles (id) on delete set null;
  end if;
exception
  when undefined_table then null;
  when undefined_column then null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_checks_reviewed_by_fkey'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_reviewed_by_fkey
      foreign key (reviewed_by) references public.staff_profiles (id) on delete set null;
  end if;
exception
  when undefined_table then null;
  when undefined_column then null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_checks_status_check'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_status_check
      check (
        status in (
          'draft', 'submitted', 'open', 'in_review', 'awaiting_info',
          'completed', 'resolved', 'closed', 'archived'
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_checks_severity_check'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_severity_check
      check (
        severity is null
        or severity in ('low', 'mild', 'moderate', 'high', 'critical')
      );
  end if;
end;
$$;

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

create index if not exists crop_checks_farmer_id_idx on public.crop_checks (farmer_id);
create index if not exists crop_checks_farm_id_idx on public.crop_checks (farm_id);
create index if not exists crop_checks_crop_cycle_id_idx on public.crop_checks (crop_cycle_id);
create index if not exists crop_checks_assigned_staff_id_idx on public.crop_checks (assigned_staff_id);
create index if not exists crop_checks_status_idx on public.crop_checks (status);
create index if not exists crop_checks_created_at_idx on public.crop_checks (created_at desc);
create index if not exists crop_checks_crop_name_idx on public.crop_checks (crop_name);
create index if not exists crop_checks_is_urgent_idx
  on public.crop_checks (is_urgent) where is_urgent = true;
create index if not exists crop_checks_reviewed_by_staff_id_idx
  on public.crop_checks (reviewed_by_staff_id);
create index if not exists crop_checks_reviewed_by_idx on public.crop_checks (reviewed_by);

drop trigger if exists crop_checks_set_updated_at on public.crop_checks;
create trigger crop_checks_set_updated_at
before update on public.crop_checks
for each row execute function public.set_updated_at();

comment on table public.crop_checks is
  'Canonical crop health checks / guided Crop Check cases.';

-- ---------------------------------------------------------------------------
-- assessment_results  (20260731180000_initial_schema.sql)
-- App upserts on crop_check_id (src/lib/assessment/runAssessment.ts).
-- ---------------------------------------------------------------------------
create table if not exists public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  crop_check_id uuid not null references public.crop_checks (id) on delete cascade,
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  likely_issue text,
  summary text,
  severity text,
  confidence numeric(5, 2),
  recommendations text[] not null default '{}',
  next_step text,
  model_name text,
  review_status text not null default 'pending',
  staff_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.assessment_results
  add column if not exists crop_check_id uuid,
  add column if not exists farmer_id uuid,
  add column if not exists likely_issue text,
  add column if not exists summary text,
  add column if not exists severity text,
  add column if not exists confidence numeric(5, 2),
  add column if not exists recommendations text[] not null default '{}',
  add column if not exists next_step text,
  add column if not exists model_name text,
  add column if not exists review_status text not null default 'pending',
  add column if not exists staff_notes text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
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
    select 1 from pg_constraint where conname = 'assessment_results_crop_check_id_fkey'
  ) then
    alter table public.assessment_results
      add constraint assessment_results_crop_check_id_fkey
      foreign key (crop_check_id) references public.crop_checks (id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assessment_results_farmer_id_fkey'
  ) then
    alter table public.assessment_results
      add constraint assessment_results_farmer_id_fkey
      foreign key (farmer_id) references public.farmer_profiles (id) on delete cascade;
  end if;
end;
$$;

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
        raise notice 'assessment_results already has duplicate crop_check_id values; unique constraint skipped';
    end;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assessment_results_severity_check'
  ) then
    alter table public.assessment_results
      add constraint assessment_results_severity_check
      check (
        severity is null
        or severity in ('low', 'mild', 'moderate', 'high', 'critical')
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assessment_results_confidence_check'
  ) then
    alter table public.assessment_results
      add constraint assessment_results_confidence_check
      check (confidence is null or (confidence >= 0 and confidence <= 100));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assessment_results_confidence_score_check'
  ) then
    alter table public.assessment_results
      add constraint assessment_results_confidence_score_check
      check (
        confidence_score is null
        or (confidence_score >= 0 and confidence_score <= 100)
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assessment_results_review_status_check'
  ) then
    alter table public.assessment_results
      add constraint assessment_results_review_status_check
      check (
        review_status in ('pending', 'in_review', 'approved', 'rejected', 'needs_info')
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assessment_results_staff_status_check'
  ) then
    alter table public.assessment_results
      add constraint assessment_results_staff_status_check
      check (staff_status in ('pending', 'approved', 'edited', 'rejected'));
  end if;
end;
$$;

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

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assessment_results_staff_urgency_level_check'
  ) then
    alter table public.assessment_results
      add constraint assessment_results_staff_urgency_level_check
      check (
        staff_urgency_level is null
        or staff_urgency_level in ('low', 'moderate', 'high', 'critical')
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assessment_results_reviewed_by_fkey'
  ) then
    alter table public.assessment_results
      add constraint assessment_results_reviewed_by_fkey
      foreign key (reviewed_by) references public.staff_profiles (id) on delete set null;
  end if;
exception
  when undefined_table then null;
  when undefined_column then null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assessment_results_approved_by_staff_id_fkey'
  ) then
    alter table public.assessment_results
      add constraint assessment_results_approved_by_staff_id_fkey
      foreign key (approved_by_staff_id) references public.staff_profiles (id) on delete set null;
  end if;
exception
  when undefined_table then null;
  when undefined_column then null;
end;
$$;

create index if not exists assessment_results_farmer_id_idx
  on public.assessment_results (farmer_id);
create index if not exists assessment_results_review_status_idx
  on public.assessment_results (review_status);
create index if not exists assessment_results_staff_status_idx
  on public.assessment_results (staff_status);
create index if not exists assessment_results_severity_idx
  on public.assessment_results (severity);
create index if not exists assessment_results_created_at_idx
  on public.assessment_results (created_at desc);
create index if not exists assessment_results_assessed_at_idx
  on public.assessment_results (assessed_at desc);
create index if not exists assessment_results_reviewed_by_idx
  on public.assessment_results (reviewed_by);

drop trigger if exists assessment_results_set_updated_at on public.assessment_results;
create trigger assessment_results_set_updated_at
before update on public.assessment_results
for each row execute function public.set_updated_at();

comment on table public.assessment_results is
  'Canonical AI / staff assessment results for crop_checks.';

-- ---------------------------------------------------------------------------
-- RLS + grants (service_role bypasses RLS; staff APIs use the admin client)
-- ---------------------------------------------------------------------------
alter table public.case_trends enable row level security;
alter table public.trusted_sources enable row level security;
alter table public.web_research_events enable row level security;
alter table public.farms enable row level security;
alter table public.crop_cycles enable row level security;
alter table public.crop_checks enable row level security;
alter table public.assessment_results enable row level security;

drop policy if exists case_trends_staff_select on public.case_trends;
drop policy if exists trusted_sources_staff_select on public.trusted_sources;
drop policy if exists web_research_events_staff_select on public.web_research_events;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and exists (
       select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'staff_profiles'
     ) then
    create policy case_trends_staff_select on public.case_trends
      for select to authenticated
      using (
        exists (
          select 1 from public.staff_profiles s
          where s.is_active = true
            and (s.auth_user_id = auth.uid() or s.id = auth.uid())
        )
      );
    create policy trusted_sources_staff_select on public.trusted_sources
      for select to authenticated
      using (
        exists (
          select 1 from public.staff_profiles s
          where s.is_active = true
            and (s.auth_user_id = auth.uid() or s.id = auth.uid())
        )
      );
    create policy web_research_events_staff_select on public.web_research_events
      for select to authenticated
      using (
        exists (
          select 1 from public.staff_profiles s
          where s.is_active = true
            and (s.auth_user_id = auth.uid() or s.id = auth.uid())
        )
      );
  end if;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'case_trends', 'trusted_sources', 'web_research_events',
    'farms', 'crop_cycles', 'crop_checks', 'assessment_results'
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
    'case_trends', 'trusted_sources', 'web_research_events'
  ]
  loop
    if exists (select 1 from pg_roles where rolname = 'authenticated')
       and exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = t
       ) then
      execute format('grant select on table public.%I to authenticated', t);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
