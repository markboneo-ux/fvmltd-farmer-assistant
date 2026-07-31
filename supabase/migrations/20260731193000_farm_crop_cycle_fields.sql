-- Farm and crop-cycle management fields for FVMLTD Farmer Crop Assistant.
-- Apply after 20260731190000_farmer_registration_fields.sql

-- ---------------------------------------------------------------------------
-- farms
-- ---------------------------------------------------------------------------
alter table public.farms
  add column if not exists country text,
  add column if not exists district text,
  add column if not exists farm_size numeric(10, 3),
  add column if not exists farm_size_unit text,
  add column if not exists water_source text,
  add column if not exists drainage_condition text,
  add column if not exists growing_system text;

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
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'farms_farm_size_positive_check'
  ) then
    alter table public.farms
      add constraint farms_farm_size_positive_check
      check (farm_size is null or farm_size > 0);
  end if;
end $$;

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
          'rainfed',
          'river',
          'borehole',
          'well',
          'irrigation_canal',
          'dam',
          'municipal',
          'other'
        )
      );
  end if;
end $$;

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
          'well_drained',
          'moderately_drained',
          'poorly_drained',
          'waterlogged',
          'unknown'
        )
      );
  end if;
end $$;

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
          'open_field',
          'shade_house',
          'greenhouse',
          'mixed',
          'other'
        )
      );
  end if;
end $$;

-- Keep region in sync for existing indexes / queries when district is set
update public.farms
set region = district
where district is not null and (region is null or region = '');

create index if not exists farms_country_idx on public.farms (country);
create index if not exists farms_district_idx on public.farms (district);

comment on column public.farms.country is 'Country where the farm is located.';
comment on column public.farms.district is 'District or region where the farm is located.';
comment on column public.farms.farm_size is 'Numeric farm size as reported by the farmer.';
comment on column public.farms.farm_size_unit is 'Unit for farm_size: acres or hectares.';
comment on column public.farms.water_source is 'Primary water source for the farm.';
comment on column public.farms.drainage_condition is 'Drainage condition of the farm.';
comment on column public.farms.growing_system is 'Primary growing system used on the farm.';

-- ---------------------------------------------------------------------------
-- crop_cycles
-- ---------------------------------------------------------------------------
alter table public.crop_cycles
  add column if not exists area_planted numeric(10, 3),
  add column if not exists area_unit text,
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
      check (
        area_unit is null
        or area_unit in ('acres', 'hectares')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_cycles_area_planted_positive_check'
  ) then
    alter table public.crop_cycles
      add constraint crop_cycles_area_planted_positive_check
      check (area_planted is null or area_planted > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_cycles_plant_count_positive_check'
  ) then
    alter table public.crop_cycles
      add constraint crop_cycles_plant_count_positive_check
      check (plant_count is null or plant_count > 0);
  end if;
end $$;

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
end $$;

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
          'nursery',
          'transplanting',
          'vegetative',
          'flowering',
          'fruiting',
          'maturity',
          'harvest',
          'other'
        )
      );
  end if;
end $$;

comment on column public.crop_cycles.area_planted is 'Area planted for this crop cycle.';
comment on column public.crop_cycles.area_unit is 'Unit for area_planted: acres or hectares.';
comment on column public.crop_cycles.plant_count is 'Number of plants if known.';
comment on column public.crop_cycles.growing_environment is
  'Where this cycle is grown: open_field, shade_house, or greenhouse.';
comment on column public.crop_cycles.previous_crop is 'Crop grown on the plot before this cycle.';
