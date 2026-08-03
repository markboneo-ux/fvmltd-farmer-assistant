-- =============================================================================
-- FVMLTD Farmer Crop Assistant — canonical baseline schema
-- =============================================================================
-- Canonical production table names (do NOT create parallel farmers / crop_cases):
--   farmer_profiles, farms, crop_checks, crop_photos, chat_messages,
--   assessment_results, staff_profiles
-- Plus application extensions that production may not yet have:
--   crop_cycles, soil_tests, follow_ups, lab_test_requests, products,
--   recommendations
--
-- Safe for:
--   * Existing production DBs where core tables already exist
--   * Clean preview / development DBs with no tables
--
-- Does NOT drop tables or delete data.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
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

create or replace function public.assert_column_exists(
  p_table text,
  p_column text,
  p_expected_udt text default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_udt text;
begin
  select c.udt_name
    into v_udt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = p_table
    and c.column_name = p_column;

  if v_udt is null then
    raise exception 'Canonical schema validation failed: public.%.% is missing',
      p_table, p_column;
  end if;

  if p_expected_udt is not null and v_udt <> p_expected_udt then
    raise exception
      'Canonical schema validation failed: public.%.% has type %, expected %',
      p_table, p_column, v_udt, p_expected_udt;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. farmer_profiles  (canonical farmer table — NOT public.farmers)
-- ---------------------------------------------------------------------------
create table if not exists public.farmer_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  village text,
  region text,
  country text default 'Trinidad and Tobago',
  preferred_language text default 'en',
  primary_crops text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Detach id from auth.users when present so public registration can insert
-- standalone farmer rows without creating Auth users. Existing IDs are kept.
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'farmer_profiles'
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) ilike '%auth.users%'
  loop
    execute format(
      'alter table public.farmer_profiles drop constraint %I',
      r.conname
    );
  end loop;
end;
$$;

alter table public.farmer_profiles
  alter column id set default gen_random_uuid();

alter table public.farmer_profiles
  add column if not exists auth_user_id uuid,
  add column if not exists farmer_code text,
  add column if not exists phone_e164 text,
  add column if not exists country_iso_code text,
  add column if not exists district text,
  add column if not exists farm_size numeric(10, 3),
  add column if not exists farm_size_unit text,
  add column if not exists consent_store_data boolean not null default false,
  add column if not exists consent_at timestamptz,
  add column if not exists member_since date default current_date,
  add column if not exists notes text;

-- Preserve auth linkage for any rows that were previously keyed to auth.users
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  ) then
    update public.farmer_profiles fp
    set auth_user_id = fp.id
    where fp.auth_user_id is null
      and exists (select 1 from auth.users u where u.id = fp.id);
  end if;
end;
$$;

-- Backfill farmer_code for existing rows without removing data
update public.farmer_profiles
set farmer_code = 'FVM-' || upper(substr(replace(id::text, '-', ''), 1, 6))
where farmer_code is null;

-- Align primary_crops from any legacy main_crops if that column existed
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'farmer_profiles'
      and column_name = 'main_crops'
  ) then
    execute $sql$
      update public.farmer_profiles
      set primary_crops = main_crops
      where (primary_crops is null or primary_crops = '{}')
        and main_crops is not null
        and main_crops <> '{}'::text[]
    $sql$;
  end if;
end;
$$;

update public.farmer_profiles
set district = region
where district is null and region is not null and region <> '';

update public.farmer_profiles
set region = district
where (region is null or region = '') and district is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'farmer_profiles_auth_user_id_fkey'
  ) then
    alter table public.farmer_profiles
      add constraint farmer_profiles_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users (id) on delete set null;
  end if;
exception
  when undefined_table then
    -- auth.users may be absent in local plain-Postgres validation
    null;
  when duplicate_object then
    null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'farmer_profiles_farmer_code_key'
  ) then
    alter table public.farmer_profiles
      add constraint farmer_profiles_farmer_code_key unique (farmer_code);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'farmer_profiles_phone_key'
  ) then
    alter table public.farmer_profiles
      add constraint farmer_profiles_phone_key unique (phone);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'farmer_profiles_auth_user_id_key'
  ) then
    alter table public.farmer_profiles
      add constraint farmer_profiles_auth_user_id_key unique (auth_user_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'farmer_profiles_farm_size_unit_check'
  ) then
    alter table public.farmer_profiles
      add constraint farmer_profiles_farm_size_unit_check
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
    select 1 from pg_constraint where conname = 'farmer_profiles_farm_size_positive_check'
  ) then
    alter table public.farmer_profiles
      add constraint farmer_profiles_farm_size_positive_check
      check (farm_size is null or farm_size > 0);
  end if;
end;
$$;

create index if not exists farmer_profiles_auth_user_id_idx
  on public.farmer_profiles (auth_user_id);
create index if not exists farmer_profiles_farmer_code_idx
  on public.farmer_profiles (farmer_code);
create index if not exists farmer_profiles_phone_idx
  on public.farmer_profiles (phone);
create index if not exists farmer_profiles_region_idx
  on public.farmer_profiles (region);
create index if not exists farmer_profiles_district_idx
  on public.farmer_profiles (district);
create index if not exists farmer_profiles_is_active_idx
  on public.farmer_profiles (is_active);

drop trigger if exists farmer_profiles_set_updated_at on public.farmer_profiles;
create trigger farmer_profiles_set_updated_at
before update on public.farmer_profiles
for each row execute function public.set_updated_at();

comment on table public.farmer_profiles is
  'Canonical farmer records for FVMLTD Farmer Crop Assistant.';

-- ---------------------------------------------------------------------------
-- 2. staff_profiles  (canonical staff table — NOT public.staff_users)
-- ---------------------------------------------------------------------------
create table if not exists public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  role text not null default 'agronomist'
    check (role in ('agronomist', 'reviewer', 'admin')),
  organization text default 'FVMLTD',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'staff_profiles'
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) ilike '%auth.users%'
      and pg_get_constraintdef(c.oid) ilike '%(id)%'
  loop
    execute format(
      'alter table public.staff_profiles drop constraint %I',
      r.conname
    );
  end loop;
end;
$$;

alter table public.staff_profiles
  alter column id set default gen_random_uuid();

alter table public.staff_profiles
  add column if not exists auth_user_id uuid;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  ) then
    update public.staff_profiles sp
    set auth_user_id = sp.id
    where sp.auth_user_id is null
      and exists (select 1 from auth.users u where u.id = sp.id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'staff_profiles_auth_user_id_fkey'
  ) then
    alter table public.staff_profiles
      add constraint staff_profiles_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users (id) on delete set null;
  end if;
exception
  when undefined_table then null;
  when duplicate_object then null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'staff_profiles_auth_user_id_key'
  ) then
    alter table public.staff_profiles
      add constraint staff_profiles_auth_user_id_key unique (auth_user_id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'staff_profiles_email_key'
  ) then
    alter table public.staff_profiles
      add constraint staff_profiles_email_key unique (email);
  end if;
end;
$$;

-- Widen role check if an older narrower check exists
alter table public.staff_profiles drop constraint if exists staff_profiles_role_check;
alter table public.staff_profiles
  add constraint staff_profiles_role_check
  check (role in ('agronomist', 'reviewer', 'admin'));

create index if not exists staff_profiles_role_idx on public.staff_profiles (role);
create index if not exists staff_profiles_is_active_idx on public.staff_profiles (is_active);
create index if not exists staff_profiles_auth_user_id_idx on public.staff_profiles (auth_user_id);

drop trigger if exists staff_profiles_set_updated_at on public.staff_profiles;
create trigger staff_profiles_set_updated_at
before update on public.staff_profiles
for each row execute function public.set_updated_at();

comment on table public.staff_profiles is
  'FVMLTD staff who review crop checks and manage follow-ups.';

-- ---------------------------------------------------------------------------
-- 3. farms  (shared name; FK must point at farmer_profiles)
-- ---------------------------------------------------------------------------
create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  name text not null,
  village text,
  region text,
  country text default 'Trinidad and Tobago',
  size_hectares numeric(10, 3),
  soil_type text,
  water_source text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Ensure farmer_id references farmer_profiles (not a legacy farmers table)
do $$
declare
  r record;
  v_ref regclass;
begin
  for r in
    select c.conname, c.oid
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'farms'
      and c.contype = 'f'
      and pg_get_constraintdef(c.oid) ilike '%farmer_id%'
  loop
    v_ref := null;
    begin
      select confrelid::regclass into v_ref from pg_constraint where oid = r.oid;
    exception when others then
      v_ref := null;
    end;

    if v_ref is distinct from 'public.farmer_profiles'::regclass then
      execute format('alter table public.farms drop constraint %I', r.conname);
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint where conname = 'farms_farmer_id_fkey'
  ) then
    alter table public.farms
      add constraint farms_farmer_id_fkey
      foreign key (farmer_id) references public.farmer_profiles (id) on delete cascade;
  end if;
end;
$$;

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

update public.farms
set region = district
where district is not null and (region is null or region = '');

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

-- ---------------------------------------------------------------------------
-- 4. products (extension; unused by UI yet)
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  category text,
  description text,
  unit text default 'unit',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists products_category_idx on public.products (category);
create index if not exists products_is_active_idx on public.products (is_active);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. crop_cycles (extension — no production equivalent)
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

-- ---------------------------------------------------------------------------
-- 6. crop_checks  (canonical — NOT public.crop_cases)
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

-- Ensure FKs point at farmer_profiles / farms
do $$
declare
  r record;
begin
  for r in
    select c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'crop_checks'
      and c.contype = 'f'
      and (
        pg_get_constraintdef(c.oid) ilike '%farmer_id%'
        or pg_get_constraintdef(c.oid) ilike '%farm_id%'
      )
  loop
    if r.def ilike '%farmers%' or r.def not ilike '%farmer_profiles%' then
      if r.def ilike '%farmer_id%' then
        execute format('alter table public.crop_checks drop constraint %I', r.conname);
      end if;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint where conname = 'crop_checks_farmer_id_fkey'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_farmer_id_fkey
      foreign key (farmer_id) references public.farmer_profiles (id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'crop_checks_farm_id_fkey'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_farm_id_fkey
      foreign key (farm_id) references public.farms (id) on delete set null;
  end if;
end;
$$;

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

-- Backfill description from legacy symptoms when needed
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

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_checks_assigned_staff_id_fkey'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_assigned_staff_id_fkey
      foreign key (assigned_staff_id) references public.staff_profiles (id) on delete set null;
  end if;
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
end;
$$;

-- Status values: keep legacy production values and app workflow values
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
-- 7. crop_photos  (canonical — NOT public.case_photos)
-- ---------------------------------------------------------------------------
create table if not exists public.crop_photos (
  id uuid primary key default gen_random_uuid(),
  crop_check_id uuid not null references public.crop_checks (id) on delete cascade,
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  storage_path text,
  public_url text,
  caption text,
  photo_type text not null default 'other',
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.crop_photos
  add column if not exists slot_key text,
  add column if not exists storage_bucket text not null default 'case-photos',
  add column if not exists label text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists is_skipped boolean not null default false,
  add column if not exists uploaded_at timestamptz not null default timezone('utc', now());

-- Allow skipped slots without a storage object; keep legacy non-null paths valid
alter table public.crop_photos alter column storage_path drop not null;

-- Ensure farmer_id / crop_check_id FKs reference canonical tables
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_photos_crop_check_id_fkey'
  ) then
    alter table public.crop_photos
      add constraint crop_photos_crop_check_id_fkey
      foreign key (crop_check_id) references public.crop_checks (id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'crop_photos_farmer_id_fkey'
  ) then
    alter table public.crop_photos
      add constraint crop_photos_farmer_id_fkey
      foreign key (farmer_id) references public.farmer_profiles (id) on delete cascade;
  end if;
end;
$$;

update public.crop_photos
set slot_key = coalesce(slot_key, 'legacy_' || id::text)
where slot_key is null;

-- photo_type remains for legacy rows; widen allowed values
alter table public.crop_photos drop constraint if exists crop_photos_photo_type_check;
alter table public.crop_photos
  add constraint crop_photos_photo_type_check
  check (
    photo_type in (
      'whole_plant', 'affected_leaves', 'stem_base', 'other',
      'whole_field', 'leaf_front', 'leaf_back', 'damage_detail',
      'healthy_comparison'
    )
  );

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
        or slot_key like 'legacy_%'
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_photos_skip_or_path_check'
  ) then
    alter table public.crop_photos
      add constraint crop_photos_skip_or_path_check
      check (
        (is_skipped = true and storage_path is null)
        or (is_skipped = false and storage_path is not null)
        or (storage_path is not null)
      );
  end if;
end;
$$;

create unique index if not exists crop_photos_check_slot_uidx
  on public.crop_photos (crop_check_id, slot_key);

create index if not exists crop_photos_crop_check_id_idx
  on public.crop_photos (crop_check_id);
create index if not exists crop_photos_farmer_id_idx
  on public.crop_photos (farmer_id);
create index if not exists crop_photos_sort_order_idx
  on public.crop_photos (crop_check_id, sort_order);

drop trigger if exists crop_photos_set_updated_at on public.crop_photos;
create trigger crop_photos_set_updated_at
before update on public.crop_photos
for each row execute function public.set_updated_at();

comment on table public.crop_photos is
  'Photographs attached to a crop_checks row (Supabase Storage paths).';

-- ---------------------------------------------------------------------------
-- 8. chat_messages  (canonical — staff/farmer messages live here)
-- ---------------------------------------------------------------------------
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  crop_check_id uuid references public.crop_checks (id) on delete set null,
  role text not null default 'system',
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.chat_messages
  add column if not exists author_type text,
  add column if not exists staff_profile_id uuid,
  add column if not exists body text,
  add column if not exists requires_reply boolean not null default false,
  add column if not exists answered_at timestamptz;

-- Keep content and body in sync for dual-shape compatibility
update public.chat_messages
set body = content
where body is null and content is not null and content <> '';

update public.chat_messages
set content = body
where (content is null or content = '') and body is not null and body <> '';

update public.chat_messages
set author_type = case
  when role = 'staff' then 'staff'
  when role = 'farmer' then 'farmer'
  else 'system'
end
where author_type is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_messages_staff_profile_id_fkey'
  ) then
    alter table public.chat_messages
      add constraint chat_messages_staff_profile_id_fkey
      foreign key (staff_profile_id) references public.staff_profiles (id) on delete set null;
  end if;
end;
$$;

alter table public.chat_messages drop constraint if exists chat_messages_role_check;
alter table public.chat_messages
  add constraint chat_messages_role_check
  check (role in ('farmer', 'assistant', 'staff', 'system'));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_messages_author_type_check'
  ) then
    alter table public.chat_messages
      add constraint chat_messages_author_type_check
      check (
        author_type is null
        or author_type in ('staff', 'farmer', 'system')
      );
  end if;
end;
$$;

-- Soften blank-content check so staff body-only inserts remain valid
alter table public.chat_messages drop constraint if exists chat_messages_content_not_blank;

create index if not exists chat_messages_farmer_id_idx on public.chat_messages (farmer_id);
create index if not exists chat_messages_crop_check_id_idx
  on public.chat_messages (crop_check_id, created_at);
create index if not exists chat_messages_created_at_idx on public.chat_messages (created_at);
create index if not exists chat_messages_role_idx on public.chat_messages (role);

drop trigger if exists chat_messages_set_updated_at on public.chat_messages;
create trigger chat_messages_set_updated_at
before update on public.chat_messages
for each row execute function public.set_updated_at();

comment on table public.chat_messages is
  'Chat and staff-review messages linked to farmers / crop checks.';

-- ---------------------------------------------------------------------------
-- 9. soil_tests (extension)
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

alter table public.soil_tests
  add column if not exists electrical_conductivity numeric(10, 3);

create index if not exists soil_tests_farm_id_idx on public.soil_tests (farm_id);
create index if not exists soil_tests_farmer_id_idx on public.soil_tests (farmer_id);
create index if not exists soil_tests_sampled_at_idx on public.soil_tests (sampled_at desc);

drop trigger if exists soil_tests_set_updated_at on public.soil_tests;
create trigger soil_tests_set_updated_at
before update on public.soil_tests
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. assessment_results  (canonical — NOT public.ai_assessments)
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

-- One assessment row per crop check (production unique); upsert from the app
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

alter table public.assessment_results drop constraint if exists assessment_results_severity_check;
alter table public.assessment_results
  add constraint assessment_results_severity_check
  check (
    severity is null
    or severity in ('low', 'mild', 'moderate', 'high', 'critical')
  );

alter table public.assessment_results drop constraint if exists assessment_results_confidence_check;
alter table public.assessment_results
  add constraint assessment_results_confidence_check
  check (confidence is null or (confidence >= 0 and confidence <= 100));

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

alter table public.assessment_results drop constraint if exists assessment_results_review_status_check;
alter table public.assessment_results
  add constraint assessment_results_review_status_check
  check (
    review_status in ('pending', 'in_review', 'approved', 'rejected', 'needs_info')
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
-- 11. recommendations (extension)
-- ---------------------------------------------------------------------------
create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  crop_check_id uuid not null references public.crop_checks (id) on delete cascade,
  assessment_result_id uuid references public.assessment_results (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  created_by_staff_id uuid references public.staff_profiles (id) on delete set null,
  title text not null,
  description text,
  priority integer not null default 0,
  source text not null default 'ai'
    check (source in ('ai', 'staff', 'system')),
  is_completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists recommendations_crop_check_id_idx
  on public.recommendations (crop_check_id);

drop trigger if exists recommendations_set_updated_at on public.recommendations;
create trigger recommendations_set_updated_at
before update on public.recommendations
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 12. follow_ups (extension)
-- ---------------------------------------------------------------------------
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

alter table public.follow_ups
  add column if not exists follow_up_type text not null default 'review';

-- Rename legacy crop_case_id → crop_check_id if an older extension table exists
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'follow_ups'
      and column_name = 'crop_case_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'follow_ups'
      and column_name = 'crop_check_id'
  ) then
    alter table public.follow_ups rename column crop_case_id to crop_check_id;
  end if;
end;
$$;

alter table public.follow_ups drop constraint if exists follow_ups_follow_up_type_check;
alter table public.follow_ups
  add constraint follow_ups_follow_up_type_check
  check (
    follow_up_type in (
      'review', 'ask_farmer', 'soil_test', 'lab_test', 'monitor', 'other'
    )
  );

create index if not exists follow_ups_crop_check_id_idx on public.follow_ups (crop_check_id);
create index if not exists follow_ups_farmer_id_idx on public.follow_ups (farmer_id);
create index if not exists follow_ups_assigned_staff_id_idx on public.follow_ups (assigned_staff_id);
create index if not exists follow_ups_status_idx on public.follow_ups (status);
create index if not exists follow_ups_due_at_idx on public.follow_ups (due_at);

drop trigger if exists follow_ups_set_updated_at on public.follow_ups;
create trigger follow_ups_set_updated_at
before update on public.follow_ups
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 13. lab_test_requests (extension)
-- ---------------------------------------------------------------------------
create table if not exists public.lab_test_requests (
  id uuid primary key default gen_random_uuid(),
  crop_check_id uuid not null references public.crop_checks (id) on delete cascade,
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  farm_id uuid not null references public.farms (id) on delete cascade,
  requested_by_staff_id uuid references public.staff_profiles (id) on delete set null,
  request_type text not null default 'soil'
    check (request_type in ('soil', 'laboratory', 'tissue', 'water', 'pathogen', 'other')),
  status text not null default 'requested'
    check (
      status in (
        'requested', 'sample_collected', 'in_lab', 'completed', 'cancelled'
      )
    ),
  notes text,
  soil_test_id uuid references public.soil_tests (id) on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lab_test_requests'
      and column_name = 'crop_case_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lab_test_requests'
      and column_name = 'crop_check_id'
  ) then
    alter table public.lab_test_requests rename column crop_case_id to crop_check_id;
  end if;
end;
$$;

create index if not exists lab_test_requests_crop_check_id_idx
  on public.lab_test_requests (crop_check_id);
create index if not exists lab_test_requests_status_idx
  on public.lab_test_requests (status);

drop trigger if exists lab_test_requests_set_updated_at on public.lab_test_requests;
create trigger lab_test_requests_set_updated_at
before update on public.lab_test_requests
for each row execute function public.set_updated_at();

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

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.is_active = true
      and (
        sp.id = auth.uid()
        or sp.auth_user_id = auth.uid()
      )
  );
$$;

create or replace function public.is_farmer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.farmer_profiles fp
    where fp.is_active = true
      and (
        fp.id = auth.uid()
        or fp.auth_user_id = auth.uid()
      )
  );
$$;

create or replace function public.owns_crop_check(check_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.crop_checks cc
    join public.farmer_profiles fp on fp.id = cc.farmer_id
    where cc.id = check_id
      and (
        fp.id = auth.uid()
        or fp.auth_user_id = auth.uid()
      )
  );
$$;

revoke all on function public.is_staff() from public;
revoke all on function public.is_farmer() from public;
revoke all on function public.owns_crop_check(uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.is_staff() to authenticated;
    grant execute on function public.is_farmer() to authenticated;
    grant execute on function public.owns_crop_check(uuid) to authenticated;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security (locked down; trusted APIs use service role)
-- ---------------------------------------------------------------------------
alter table public.farmer_profiles enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.farms enable row level security;
alter table public.products enable row level security;
alter table public.crop_cycles enable row level security;
alter table public.crop_checks enable row level security;
alter table public.crop_photos enable row level security;
alter table public.chat_messages enable row level security;
alter table public.soil_tests enable row level security;
alter table public.assessment_results enable row level security;
alter table public.recommendations enable row level security;
alter table public.follow_ups enable row level security;
alter table public.lab_test_requests enable row level security;

drop policy if exists staff_profiles_select_own on public.staff_profiles;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    create policy staff_profiles_select_own
      on public.staff_profiles
      for select
      to authenticated
      using (
        (id = auth.uid() or auth_user_id = auth.uid())
        and is_active = true
      );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Required-column validation (fails loudly on incompatible structures)
-- ---------------------------------------------------------------------------
select public.assert_column_exists('farmer_profiles', 'id', 'uuid');
select public.assert_column_exists('farmer_profiles', 'farmer_code', 'text');
select public.assert_column_exists('farmer_profiles', 'full_name', 'text');
select public.assert_column_exists('farmer_profiles', 'phone', 'text');
select public.assert_column_exists('farmer_profiles', 'phone_e164', 'text');
select public.assert_column_exists('farmer_profiles', 'country', 'text');
select public.assert_column_exists('farmer_profiles', 'country_iso_code', 'text');
select public.assert_column_exists('farmer_profiles', 'region', 'text');
select public.assert_column_exists('farmer_profiles', 'district', 'text');
select public.assert_column_exists('farmer_profiles', 'primary_crops', '_text');
select public.assert_column_exists('farmer_profiles', 'consent_store_data', 'bool');
select public.assert_column_exists('farmer_profiles', 'consent_at', 'timestamptz');
select public.assert_column_exists('farmer_profiles', 'created_at', 'timestamptz');
select public.assert_column_exists('farmer_profiles', 'updated_at', 'timestamptz');

select public.assert_column_exists('farms', 'id', 'uuid');
select public.assert_column_exists('farms', 'farmer_id', 'uuid');
select public.assert_column_exists('farms', 'name', 'text');

select public.assert_column_exists('crop_checks', 'id', 'uuid');
select public.assert_column_exists('crop_checks', 'farmer_id', 'uuid');
select public.assert_column_exists('crop_checks', 'status', 'text');
select public.assert_column_exists('crop_checks', 'guided_step', 'text');

select public.assert_column_exists('crop_photos', 'id', 'uuid');
select public.assert_column_exists('crop_photos', 'crop_check_id', 'uuid');
select public.assert_column_exists('crop_photos', 'slot_key', 'text');

select public.assert_column_exists('chat_messages', 'id', 'uuid');
select public.assert_column_exists('chat_messages', 'farmer_id', 'uuid');
select public.assert_column_exists('chat_messages', 'crop_check_id', 'uuid');

select public.assert_column_exists('assessment_results', 'id', 'uuid');
select public.assert_column_exists('assessment_results', 'crop_check_id', 'uuid');
select public.assert_column_exists('assessment_results', 'case_summary', 'text');
select public.assert_column_exists('assessment_results', 'likely_causes', 'jsonb');
