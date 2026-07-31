-- FVMLTD Farmer Crop Assistant — initial schema
-- Tables: farmers, farms, crop_cycles, crop_cases, case_photos,
--         soil_tests, ai_assessments, recommendations, products,
--         follow_ups, staff_users

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. farmers
-- ---------------------------------------------------------------------------
create table public.farmers (
  id uuid primary key default gen_random_uuid(),
  farmer_code text not null unique,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  full_name text not null,
  phone text unique,
  village text,
  region text,
  country text default 'Tanzania',
  farm_size numeric(10, 3)
    check (farm_size is null or farm_size > 0),
  farm_size_unit text
    check (farm_size_unit is null or farm_size_unit in ('acres', 'hectares')),
  main_crops text[] not null default '{}',
  consent_store_data boolean not null default false,
  consent_at timestamptz,
  preferred_language text default 'en',
  notes text,
  member_since date default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index farmers_auth_user_id_idx on public.farmers (auth_user_id);
create index farmers_farmer_code_idx on public.farmers (farmer_code);
create index farmers_phone_idx on public.farmers (phone);
create index farmers_region_idx on public.farmers (region);

create trigger farmers_set_updated_at
before update on public.farmers
for each row execute function public.set_updated_at();

comment on table public.farmers is 'Registered smallholder farmers using the crop assistant.';

-- ---------------------------------------------------------------------------
-- 2. staff_users
-- ---------------------------------------------------------------------------
create table public.staff_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  full_name text not null,
  email text not null unique,
  phone text,
  role text not null default 'agronomist'
    check (role in ('admin', 'agronomist', 'reviewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index staff_users_role_idx on public.staff_users (role);
create index staff_users_is_active_idx on public.staff_users (is_active);

create trigger staff_users_set_updated_at
before update on public.staff_users
for each row execute function public.set_updated_at();

comment on table public.staff_users is 'FVMLTD staff who review cases and manage follow-ups.';

-- ---------------------------------------------------------------------------
-- 3. farms
-- ---------------------------------------------------------------------------
create table public.farms (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  name text not null,
  location_description text,
  village text,
  region text,
  country text,
  district text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  farm_size numeric(10, 3)
    check (farm_size is null or farm_size > 0),
  farm_size_unit text
    check (farm_size_unit is null or farm_size_unit in ('acres', 'hectares')),
  size_hectares numeric(10, 3),
  water_source text
    check (
      water_source is null
      or water_source in (
        'rainfed',
        'river',
        'borehole',
        'well',
        'irrigation_canal',
        'dam',
        'municipal',
        'other'
      )
    ),
  drainage_condition text
    check (
      drainage_condition is null
      or drainage_condition in (
        'well_drained',
        'moderately_drained',
        'poorly_drained',
        'waterlogged',
        'unknown'
      )
    ),
  growing_system text
    check (
      growing_system is null
      or growing_system in (
        'open_field',
        'shade_house',
        'greenhouse',
        'mixed',
        'other'
      )
    ),
  primary_crops text[] not null default '{}',
  soil_type text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index farms_farmer_id_idx on public.farms (farmer_id);
create index farms_region_idx on public.farms (region);
create index farms_country_idx on public.farms (country);
create index farms_district_idx on public.farms (district);

create trigger farms_set_updated_at
before update on public.farms
for each row execute function public.set_updated_at();

comment on table public.farms is 'Physical farm plots belonging to a farmer.';

-- ---------------------------------------------------------------------------
-- 4. products
-- ---------------------------------------------------------------------------
create table public.products (
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

create index products_category_idx on public.products (category);
create index products_is_active_idx on public.products (is_active);

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

comment on table public.products is 'Catalog of products that can be recommended to farmers.';

-- ---------------------------------------------------------------------------
-- 5. crop_cycles
-- ---------------------------------------------------------------------------
create table public.crop_cycles (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  crop_name text not null,
  variety text,
  planting_date date,
  expected_harvest_date date,
  growth_stage text
    check (
      growth_stage is null
      or growth_stage in (
        'nursery',
        'transplanting',
        'vegetative',
        'flowering',
        'fruiting',
        'maturity',
        'harvest',
        'other'
      )
    ),
  status text not null default 'active'
    check (status in ('planned', 'active', 'harvested', 'abandoned')),
  area_planted numeric(10, 3)
    check (area_planted is null or area_planted > 0),
  area_unit text
    check (area_unit is null or area_unit in ('acres', 'hectares')),
  area_hectares numeric(10, 3),
  plant_count integer
    check (plant_count is null or plant_count > 0),
  growing_environment text
    check (
      growing_environment is null
      or growing_environment in ('open_field', 'shade_house', 'greenhouse')
    ),
  previous_crop text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index crop_cycles_farm_id_idx on public.crop_cycles (farm_id);
create index crop_cycles_status_idx on public.crop_cycles (status);
create index crop_cycles_crop_name_idx on public.crop_cycles (crop_name);

create trigger crop_cycles_set_updated_at
before update on public.crop_cycles
for each row execute function public.set_updated_at();

comment on table public.crop_cycles is 'A planting season / crop cycle on a farm.';

-- ---------------------------------------------------------------------------
-- 6. crop_cases
-- ---------------------------------------------------------------------------
create table public.crop_cases (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  farm_id uuid not null references public.farms (id) on delete cascade,
  crop_cycle_id uuid references public.crop_cycles (id) on delete set null,
  assigned_staff_id uuid references public.staff_users (id) on delete set null,
  title text,
  crop_name text not null,
  description text,
  first_observed_on date,
  symptom_location text
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
    ),
  is_spreading boolean,
  percent_affected numeric(5, 2)
    check (
      percent_affected is null
      or (percent_affected >= 0 and percent_affected <= 100)
    ),
  recent_fertilizer text,
  recent_spray text,
  irrigation_frequency text
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
    ),
  drainage_condition text
    check (
      drainage_condition is null
      or drainage_condition in (
        'well_drained',
        'moderately_drained',
        'poorly_drained',
        'waterlogged',
        'unknown'
      )
    ),
  recent_heavy_rainfall boolean,
  guided_step text,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'in_review', 'resolved', 'closed')),
  severity text
    check (severity is null or severity in ('low', 'mild', 'moderate', 'high', 'critical')),
  submitted_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index crop_cases_farmer_id_idx on public.crop_cases (farmer_id);
create index crop_cases_farm_id_idx on public.crop_cases (farm_id);
create index crop_cases_crop_cycle_id_idx on public.crop_cases (crop_cycle_id);
create index crop_cases_assigned_staff_id_idx on public.crop_cases (assigned_staff_id);
create index crop_cases_status_idx on public.crop_cases (status);
create index crop_cases_submitted_at_idx on public.crop_cases (submitted_at desc);

create trigger crop_cases_set_updated_at
before update on public.crop_cases
for each row execute function public.set_updated_at();

comment on table public.crop_cases is 'Crop health check / issue cases submitted by farmers.';

-- ---------------------------------------------------------------------------
-- 7. case_photos
-- ---------------------------------------------------------------------------
create table public.case_photos (
  id uuid primary key default gen_random_uuid(),
  crop_case_id uuid not null references public.crop_cases (id) on delete cascade,
  slot_key text not null
    check (
      slot_key in (
        'whole_field',
        'whole_plant',
        'leaf_front',
        'leaf_back',
        'damage_detail',
        'healthy_comparison'
      )
    ),
  storage_path text,
  storage_bucket text not null default 'case-photos',
  label text,
  caption text,
  mime_type text,
  file_size_bytes bigint,
  sort_order integer not null default 0,
  is_skipped boolean not null default false,
  uploaded_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  check (
    (is_skipped = true and storage_path is null)
    or (is_skipped = false and storage_path is not null)
  ),
  unique (crop_case_id, slot_key)
);

create index case_photos_crop_case_id_idx on public.case_photos (crop_case_id);
create index case_photos_sort_order_idx on public.case_photos (crop_case_id, sort_order);

comment on table public.case_photos is 'Photographs attached to a crop case (Supabase Storage paths).';

-- ---------------------------------------------------------------------------
-- 8. soil_tests
-- ---------------------------------------------------------------------------
create table public.soil_tests (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  sampled_at date not null,
  lab_name text,
  ph numeric(4, 2),
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

create index soil_tests_farm_id_idx on public.soil_tests (farm_id);
create index soil_tests_farmer_id_idx on public.soil_tests (farmer_id);
create index soil_tests_sampled_at_idx on public.soil_tests (sampled_at desc);

create trigger soil_tests_set_updated_at
before update on public.soil_tests
for each row execute function public.set_updated_at();

comment on table public.soil_tests is 'Soil test results linked to farms and farmers.';

-- ---------------------------------------------------------------------------
-- 9. ai_assessments
-- ---------------------------------------------------------------------------
create table public.ai_assessments (
  id uuid primary key default gen_random_uuid(),
  crop_case_id uuid not null references public.crop_cases (id) on delete cascade,
  model_name text,
  confidence numeric(5, 2)
    check (confidence is null or (confidence >= 0 and confidence <= 100)),
  likely_issue text,
  severity text
    check (severity is null or severity in ('low', 'mild', 'moderate', 'high', 'critical')),
  summary text,
  next_step text,
  raw_response jsonb,
  assessed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index ai_assessments_crop_case_id_idx on public.ai_assessments (crop_case_id);
create index ai_assessments_assessed_at_idx on public.ai_assessments (assessed_at desc);

create trigger ai_assessments_set_updated_at
before update on public.ai_assessments
for each row execute function public.set_updated_at();

comment on table public.ai_assessments is 'AI-generated crop assessments for a case. OpenAI wiring comes later.';

-- ---------------------------------------------------------------------------
-- 10. recommendations
-- ---------------------------------------------------------------------------
create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  crop_case_id uuid not null references public.crop_cases (id) on delete cascade,
  ai_assessment_id uuid references public.ai_assessments (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  created_by_staff_id uuid references public.staff_users (id) on delete set null,
  title text not null,
  description text,
  priority integer not null default 0,
  source text not null default 'ai'
    check (source in ('ai', 'staff', 'system')),
  is_completed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index recommendations_crop_case_id_idx on public.recommendations (crop_case_id);
create index recommendations_ai_assessment_id_idx on public.recommendations (ai_assessment_id);
create index recommendations_product_id_idx on public.recommendations (product_id);
create index recommendations_source_idx on public.recommendations (source);

create trigger recommendations_set_updated_at
before update on public.recommendations
for each row execute function public.set_updated_at();

comment on table public.recommendations is 'Actionable recommendations for a crop case, optionally tied to a product.';

-- ---------------------------------------------------------------------------
-- 11. follow_ups
-- ---------------------------------------------------------------------------
create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  crop_case_id uuid not null references public.crop_cases (id) on delete cascade,
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  assigned_staff_id uuid references public.staff_users (id) on delete set null,
  title text not null,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index follow_ups_crop_case_id_idx on public.follow_ups (crop_case_id);
create index follow_ups_farmer_id_idx on public.follow_ups (farmer_id);
create index follow_ups_assigned_staff_id_idx on public.follow_ups (assigned_staff_id);
create index follow_ups_status_idx on public.follow_ups (status);
create index follow_ups_due_at_idx on public.follow_ups (due_at);

create trigger follow_ups_set_updated_at
before update on public.follow_ups
for each row execute function public.set_updated_at();

comment on table public.follow_ups is 'Staff or system follow-up tasks linked to crop cases.';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Policies that grant farmer/staff access will be added with authentication.
-- Until then, tables are locked down for the anon/authenticated roles;
-- the service role key (server-only) bypasses RLS for trusted backend work.
-- ---------------------------------------------------------------------------
alter table public.farmers enable row level security;
alter table public.staff_users enable row level security;
alter table public.farms enable row level security;
alter table public.products enable row level security;
alter table public.crop_cycles enable row level security;
alter table public.crop_cases enable row level security;
alter table public.case_photos enable row level security;
alter table public.soil_tests enable row level security;
alter table public.ai_assessments enable row level security;
alter table public.recommendations enable row level security;
alter table public.follow_ups enable row level security;
