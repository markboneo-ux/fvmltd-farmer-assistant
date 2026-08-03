-- =============================================================================
-- Farmer journey RPCs callable with the anon key (no service-role required)
-- =============================================================================
-- Guest farmers identify themselves with their farmer_profiles.id (stored in
-- the browser after registration). Each RPC validates that id before acting.
-- SECURITY DEFINER is used only to bypass RLS for these narrow operations.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.assert_active_farmer(p_farmer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_farmer_id is null then
    raise exception 'Farmer ID is required.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.farmer_profiles fp
    where fp.id = p_farmer_id
      and fp.is_active = true
  ) then
    raise exception 'No registered farmer was found. Please register first.'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.assert_active_farmer(uuid) from public;

create or replace function public.storage_farmer_object_allowed(object_name text)
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
      and fp.id::text = split_part(object_name, '/', 1)
  );
$$;

revoke all on function public.storage_farmer_object_allowed(text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.storage_farmer_object_allowed(text) to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.storage_farmer_object_allowed(text) to authenticated;
  end if;
end;
$$;

-- Storage policies for guest farmer photo paths: {farmer_id}/{check_id}/...
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'objects'
  ) then
    execute 'drop policy if exists case_photos_farmer_select on storage.objects';
    execute 'drop policy if exists case_photos_farmer_insert on storage.objects';
    execute 'drop policy if exists case_photos_farmer_update on storage.objects';
    execute 'drop policy if exists case_photos_farmer_delete on storage.objects';

    execute $policy$
      create policy case_photos_farmer_select
        on storage.objects
        for select
        to anon, authenticated
        using (
          bucket_id = 'case-photos'
          and public.storage_farmer_object_allowed(name)
        )
    $policy$;

    execute $policy$
      create policy case_photos_farmer_insert
        on storage.objects
        for insert
        to anon, authenticated
        with check (
          bucket_id = 'case-photos'
          and public.storage_farmer_object_allowed(name)
        )
    $policy$;

    execute $policy$
      create policy case_photos_farmer_update
        on storage.objects
        for update
        to anon, authenticated
        using (
          bucket_id = 'case-photos'
          and public.storage_farmer_object_allowed(name)
        )
        with check (
          bucket_id = 'case-photos'
          and public.storage_farmer_object_allowed(name)
        )
    $policy$;

    execute $policy$
      create policy case_photos_farmer_delete
        on storage.objects
        for delete
        to anon, authenticated
        using (
          bucket_id = 'case-photos'
          and public.storage_farmer_object_allowed(name)
        )
    $policy$;
  end if;
end;
$$;

create or replace function public.grant_anon_execute(p_signature text)
returns void
language plpgsql
set search_path = public
as $$
begin
  execute format('revoke all on function %s from public', p_signature);
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute format('grant execute on function %s to anon', p_signature);
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute format('grant execute on function %s to authenticated', p_signature);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Farms
-- ---------------------------------------------------------------------------
create or replace function public.list_farms_for_farmer(p_farmer_id uuid)
returns table (
  id uuid,
  farmer_id uuid,
  name text,
  country text,
  district text,
  region text,
  farm_size numeric,
  farm_size_unit text,
  location_description text,
  latitude numeric,
  longitude numeric,
  water_source text,
  drainage_condition text,
  growing_system text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_active_farmer(p_farmer_id);

  return query
  select
    f.id,
    f.farmer_id,
    f.name,
    f.country,
    f.district,
    f.region,
    f.farm_size,
    f.farm_size_unit,
    f.location_description,
    f.latitude,
    f.longitude,
    f.water_source,
    f.drainage_condition,
    f.growing_system
  from public.farms f
  where f.farmer_id = p_farmer_id
  order by f.created_at desc;
end;
$$;

create or replace function public.create_farm_for_farmer(
  p_farmer_id uuid,
  p_name text,
  p_country text,
  p_district text,
  p_farm_size numeric,
  p_farm_size_unit text,
  p_size_hectares numeric,
  p_location_description text,
  p_latitude numeric,
  p_longitude numeric,
  p_water_source text,
  p_drainage_condition text,
  p_growing_system text
)
returns table (
  id uuid,
  farmer_id uuid,
  name text,
  country text,
  district text,
  region text,
  farm_size numeric,
  farm_size_unit text,
  location_description text,
  latitude numeric,
  longitude numeric,
  water_source text,
  drainage_condition text,
  growing_system text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_country text := trim(coalesce(p_country, ''));
  v_district text := trim(coalesce(p_district, ''));
  v_unit text := trim(coalesce(p_farm_size_unit, ''));
begin
  perform public.assert_active_farmer(p_farmer_id);

  if char_length(v_name) < 1 then
    raise exception 'Enter a name for this farm or plot.'
      using errcode = '22023';
  end if;
  if char_length(v_country) < 2 then
    raise exception 'Select the country.'
      using errcode = '22023';
  end if;
  if char_length(v_district) < 1 then
    raise exception 'Enter the district or region.'
      using errcode = '22023';
  end if;
  if p_farm_size is null or p_farm_size <= 0 then
    raise exception 'Farm size must be a number greater than zero.'
      using errcode = '22023';
  end if;
  if v_unit not in ('acres', 'hectares') then
    raise exception 'Choose acres or hectares.'
      using errcode = '22023';
  end if;

  return query
  insert into public.farms (
    farmer_id,
    name,
    country,
    district,
    region,
    farm_size,
    farm_size_unit,
    size_hectares,
    location_description,
    latitude,
    longitude,
    water_source,
    drainage_condition,
    growing_system
  )
  values (
    p_farmer_id,
    v_name,
    v_country,
    v_district,
    v_district,
    p_farm_size,
    v_unit,
    p_size_hectares,
    nullif(trim(coalesce(p_location_description, '')), ''),
    p_latitude,
    p_longitude,
    p_water_source,
    p_drainage_condition,
    p_growing_system
  )
  returning
    farms.id,
    farms.farmer_id,
    farms.name,
    farms.country,
    farms.district,
    farms.region,
    farms.farm_size,
    farms.farm_size_unit,
    farms.location_description,
    farms.latitude,
    farms.longitude,
    farms.water_source,
    farms.drainage_condition,
    farms.growing_system;
end;
$$;

-- ---------------------------------------------------------------------------
-- Crop cycles
-- ---------------------------------------------------------------------------
create or replace function public.list_crop_cycles_for_farmer(
  p_farmer_id uuid,
  p_status text default 'active',
  p_crop text default null
)
returns table (
  id uuid,
  farm_id uuid,
  farm_name text,
  crop_name text,
  variety text,
  planting_date date,
  area_planted numeric,
  area_unit text,
  plant_count integer,
  growing_environment text,
  previous_crop text,
  growth_stage text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_crop text := nullif(trim(coalesce(p_crop, '')), '');
begin
  perform public.assert_active_farmer(p_farmer_id);

  return query
  select
    c.id,
    c.farm_id,
    coalesce(f.name, 'Farm') as farm_name,
    c.crop_name,
    c.variety,
    c.planting_date,
    c.area_planted,
    c.area_unit,
    c.plant_count,
    c.growing_environment,
    c.previous_crop,
    c.growth_stage,
    c.status
  from public.crop_cycles c
  join public.farms f on f.id = c.farm_id
  where f.farmer_id = p_farmer_id
    and (v_status is null or v_status = 'all' or c.status = v_status)
    and (v_crop is null or c.crop_name ilike v_crop)
  order by c.planting_date desc nulls last, c.created_at desc;
end;
$$;

create or replace function public.create_crop_cycle_for_farmer(
  p_farmer_id uuid,
  p_farm_id uuid,
  p_crop_name text,
  p_variety text,
  p_planting_date date,
  p_area_planted numeric,
  p_area_unit text,
  p_area_hectares numeric,
  p_plant_count integer,
  p_growing_environment text,
  p_previous_crop text,
  p_growth_stage text
)
returns table (
  id uuid,
  farm_id uuid,
  farm_name text,
  crop_name text,
  variety text,
  planting_date date,
  area_planted numeric,
  area_unit text,
  plant_count integer,
  growing_environment text,
  previous_crop text,
  growth_stage text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_farm_name text;
  v_crop text := trim(coalesce(p_crop_name, ''));
  v_unit text := trim(coalesce(p_area_unit, ''));
  v_env text := trim(coalesce(p_growing_environment, ''));
  v_stage text := trim(coalesce(p_growth_stage, ''));
begin
  perform public.assert_active_farmer(p_farmer_id);

  select f.name
    into v_farm_name
  from public.farms f
  where f.id = p_farm_id
    and f.farmer_id = p_farmer_id;

  if v_farm_name is null then
    raise exception 'Select one of your farms for this crop cycle.'
      using errcode = 'P0002';
  end if;

  if char_length(v_crop) < 1 then
    raise exception 'Enter or select the crop.'
      using errcode = '22023';
  end if;
  if p_planting_date is null then
    raise exception 'Enter the planting date.'
      using errcode = '22023';
  end if;
  if p_area_planted is null or p_area_planted <= 0 then
    raise exception 'Area planted must be a number greater than zero.'
      using errcode = '22023';
  end if;
  if v_unit not in ('acres', 'hectares') then
    raise exception 'Choose acres or hectares.'
      using errcode = '22023';
  end if;
  if v_env not in ('open_field', 'shade_house', 'greenhouse') then
    raise exception 'Choose open field, shade house, or greenhouse.'
      using errcode = '22023';
  end if;
  if v_stage not in (
    'nursery', 'transplanting', 'vegetative', 'flowering',
    'fruiting', 'maturity', 'harvest', 'other'
  ) then
    raise exception 'Select the current crop stage.'
      using errcode = '22023';
  end if;

  return query
  insert into public.crop_cycles (
    farm_id,
    crop_name,
    variety,
    planting_date,
    area_planted,
    area_unit,
    area_hectares,
    plant_count,
    growing_environment,
    previous_crop,
    growth_stage,
    status
  )
  values (
    p_farm_id,
    v_crop,
    nullif(trim(coalesce(p_variety, '')), ''),
    p_planting_date,
    p_area_planted,
    v_unit,
    p_area_hectares,
    p_plant_count,
    v_env,
    nullif(trim(coalesce(p_previous_crop, '')), ''),
    v_stage,
    'active'
  )
  returning
    crop_cycles.id,
    crop_cycles.farm_id,
    v_farm_name,
    crop_cycles.crop_name,
    crop_cycles.variety,
    crop_cycles.planting_date,
    crop_cycles.area_planted,
    crop_cycles.area_unit,
    crop_cycles.plant_count,
    crop_cycles.growing_environment,
    crop_cycles.previous_crop,
    crop_cycles.growth_stage,
    crop_cycles.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Crop checks
-- ---------------------------------------------------------------------------
create or replace function public.list_crop_checks_for_farmer(
  p_farmer_id uuid,
  p_status text default null,
  p_id uuid default null
)
returns table (
  id uuid,
  farmer_id uuid,
  farm_id uuid,
  crop_cycle_id uuid,
  crop_name text,
  title text,
  description text,
  first_observed_on date,
  symptom_location text,
  is_spreading boolean,
  percent_affected numeric,
  recent_fertilizer text,
  recent_spray text,
  irrigation_frequency text,
  drainage_condition text,
  recent_heavy_rainfall boolean,
  guided_step text,
  status text,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := nullif(trim(coalesce(p_status, '')), '');
begin
  perform public.assert_active_farmer(p_farmer_id);

  return query
  select
    c.id,
    c.farmer_id,
    c.farm_id,
    c.crop_cycle_id,
    c.crop_name,
    c.title,
    c.description,
    c.first_observed_on,
    c.symptom_location,
    c.is_spreading,
    c.percent_affected,
    c.recent_fertilizer,
    c.recent_spray,
    c.irrigation_frequency,
    c.drainage_condition,
    c.recent_heavy_rainfall,
    c.guided_step,
    c.status,
    c.completed_at
  from public.crop_checks c
  where c.farmer_id = p_farmer_id
    and (p_id is null or c.id = p_id)
    and (v_status is null or c.status = v_status)
  order by c.updated_at desc;
end;
$$;

create or replace function public.get_crop_check_for_farmer(
  p_farmer_id uuid,
  p_check_id uuid
)
returns table (
  id uuid,
  farmer_id uuid,
  farm_id uuid,
  crop_cycle_id uuid,
  crop_name text,
  title text,
  description text,
  first_observed_on date,
  symptom_location text,
  is_spreading boolean,
  percent_affected numeric,
  recent_fertilizer text,
  recent_spray text,
  irrigation_frequency text,
  drainage_condition text,
  recent_heavy_rainfall boolean,
  guided_step text,
  status text,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_active_farmer(p_farmer_id);

  return query
  select
    c.id,
    c.farmer_id,
    c.farm_id,
    c.crop_cycle_id,
    c.crop_name,
    c.title,
    c.description,
    c.first_observed_on,
    c.symptom_location,
    c.is_spreading,
    c.percent_affected,
    c.recent_fertilizer,
    c.recent_spray,
    c.irrigation_frequency,
    c.drainage_condition,
    c.recent_heavy_rainfall,
    c.guided_step,
    c.status,
    c.completed_at
  from public.crop_checks c
  where c.id = p_check_id
    and c.farmer_id = p_farmer_id;
end;
$$;

create or replace function public.create_crop_check_for_farmer(
  p_farmer_id uuid,
  p_crop_cycle_id uuid,
  p_crop_name text
)
returns table (
  id uuid,
  farmer_id uuid,
  farm_id uuid,
  crop_cycle_id uuid,
  crop_name text,
  title text,
  description text,
  first_observed_on date,
  symptom_location text,
  is_spreading boolean,
  percent_affected numeric,
  recent_fertilizer text,
  recent_spray text,
  irrigation_frequency text,
  drainage_condition text,
  recent_heavy_rainfall boolean,
  guided_step text,
  status text,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crop text := trim(coalesce(p_crop_name, ''));
  v_cycle record;
begin
  perform public.assert_active_farmer(p_farmer_id);

  if v_crop not in ('Tomato', 'Pepper', 'Cucumber') then
    raise exception 'Guided crop check currently supports Tomato, Pepper, and Cucumber only.'
      using errcode = '22023';
  end if;

  select c.id, c.farm_id, c.crop_name, f.farmer_id
    into v_cycle
  from public.crop_cycles c
  join public.farms f on f.id = c.farm_id
  where c.id = p_crop_cycle_id;

  if v_cycle.id is null or v_cycle.farmer_id <> p_farmer_id then
    raise exception 'Crop cycle not found for this farmer.'
      using errcode = 'P0002';
  end if;

  if lower(v_cycle.crop_name) <> lower(v_crop) then
    raise exception 'Selected cycle is for %, not %.', v_cycle.crop_name, v_crop
      using errcode = '22023';
  end if;

  return query
  insert into public.crop_checks (
    farmer_id,
    farm_id,
    crop_cycle_id,
    crop_name,
    title,
    status,
    guided_step
  )
  values (
    p_farmer_id,
    v_cycle.farm_id,
    p_crop_cycle_id,
    v_crop,
    v_crop || ' crop check',
    'draft',
    'problem_description'
  )
  returning
    crop_checks.id,
    crop_checks.farmer_id,
    crop_checks.farm_id,
    crop_checks.crop_cycle_id,
    crop_checks.crop_name,
    crop_checks.title,
    crop_checks.description,
    crop_checks.first_observed_on,
    crop_checks.symptom_location,
    crop_checks.is_spreading,
    crop_checks.percent_affected,
    crop_checks.recent_fertilizer,
    crop_checks.recent_spray,
    crop_checks.irrigation_frequency,
    crop_checks.drainage_condition,
    crop_checks.recent_heavy_rainfall,
    crop_checks.guided_step,
    crop_checks.status,
    crop_checks.completed_at;
end;
$$;

create or replace function public.save_crop_check_guided_answer(
  p_farmer_id uuid,
  p_check_id uuid,
  p_expected_step text,
  p_patch jsonb
)
returns table (
  id uuid,
  farmer_id uuid,
  farm_id uuid,
  crop_cycle_id uuid,
  crop_name text,
  title text,
  description text,
  first_observed_on date,
  symptom_location text,
  is_spreading boolean,
  percent_affected numeric,
  recent_fertilizer text,
  recent_spray text,
  irrigation_frequency text,
  drainage_condition text,
  recent_heavy_rainfall boolean,
  guided_step text,
  status text,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record;
  v_allowed text[] := array[
    'description', 'title', 'first_observed_on', 'symptom_location',
    'is_spreading', 'percent_affected', 'recent_fertilizer', 'recent_spray',
    'irrigation_frequency', 'drainage_condition', 'recent_heavy_rainfall',
    'guided_step', 'status'
  ];
  v_key text;
  v_set_sql text;
begin
  perform public.assert_active_farmer(p_farmer_id);

  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'A valid answer payload is required.'
      using errcode = '22023';
  end if;

  select c.id, c.status, c.guided_step
    into v_existing
  from public.crop_checks c
  where c.id = p_check_id
    and c.farmer_id = p_farmer_id;

  if v_existing.id is null then
    raise exception 'Crop case not found.'
      using errcode = 'P0002';
  end if;

  if v_existing.status <> 'draft' or v_existing.guided_step = 'completed' then
    raise exception 'This crop check is already complete.'
      using errcode = 'P0001';
  end if;

  if v_existing.guided_step is not null
     and v_existing.guided_step <> p_expected_step then
    raise exception 'Expected step "%", not "%".', v_existing.guided_step, p_expected_step
      using errcode = 'P0001';
  end if;

  for v_key in select jsonb_object_keys(p_patch)
  loop
    if not (v_key = any (v_allowed)) then
      raise exception 'Unsupported field in crop check update: %', v_key
        using errcode = '22023';
    end if;
  end loop;

  if not exists (select 1 from jsonb_object_keys(p_patch)) then
    raise exception 'No fields to update.'
      using errcode = '22023';
  end if;

  select string_agg(
    case
      when key in ('is_spreading', 'recent_heavy_rainfall') then
        format('%I = %L::boolean', key, p_patch ->> key)
      when key = 'percent_affected' then
        format('%I = %L::numeric', key, p_patch ->> key)
      when key = 'first_observed_on' then
        format('%I = %L::date', key, p_patch ->> key)
      else
        format('%I = %L', key, p_patch ->> key)
    end,
    ', '
  )
  into v_set_sql
  from jsonb_object_keys(p_patch) as key;

  execute format(
    'update public.crop_checks set %s where id = %L and farmer_id = %L',
    v_set_sql,
    p_check_id,
    p_farmer_id
  );

  return query
  select *
  from public.get_crop_check_for_farmer(p_farmer_id, p_check_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------
create or replace function public.list_crop_photos_for_farmer(
  p_farmer_id uuid,
  p_check_id uuid
)
returns table (
  id uuid,
  crop_check_id uuid,
  slot_key text,
  storage_path text,
  storage_bucket text,
  label text,
  mime_type text,
  file_size_bytes bigint,
  sort_order integer,
  is_skipped boolean,
  uploaded_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_active_farmer(p_farmer_id);

  if not exists (
    select 1 from public.crop_checks c
    where c.id = p_check_id and c.farmer_id = p_farmer_id
  ) then
    raise exception 'Crop case not found.'
      using errcode = 'P0002';
  end if;

  return query
  select
    p.id,
    p.crop_check_id,
    p.slot_key,
    p.storage_path,
    p.storage_bucket,
    p.label,
    p.mime_type,
    p.file_size_bytes,
    p.sort_order,
    p.is_skipped,
    p.uploaded_at
  from public.crop_photos p
  where p.crop_check_id = p_check_id
    and p.farmer_id = p_farmer_id
  order by p.sort_order asc;
end;
$$;

create or replace function public.upsert_crop_photo_for_farmer(
  p_farmer_id uuid,
  p_check_id uuid,
  p_slot_key text,
  p_storage_path text,
  p_storage_bucket text,
  p_label text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_sort_order integer,
  p_is_skipped boolean
)
returns table (
  id uuid,
  crop_check_id uuid,
  slot_key text,
  storage_path text,
  storage_bucket text,
  label text,
  mime_type text,
  file_size_bytes bigint,
  sort_order integer,
  is_skipped boolean,
  uploaded_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case record;
  v_slot text := trim(coalesce(p_slot_key, ''));
begin
  perform public.assert_active_farmer(p_farmer_id);

  if v_slot not in (
    'whole_field', 'whole_plant', 'leaf_front', 'leaf_back',
    'damage_detail', 'healthy_comparison'
  ) then
    raise exception 'A valid photograph slot is required.'
      using errcode = '22023';
  end if;

  select c.id, c.status, c.guided_step
    into v_case
  from public.crop_checks c
  where c.id = p_check_id
    and c.farmer_id = p_farmer_id;

  if v_case.id is null then
    raise exception 'Crop case not found.'
      using errcode = 'P0002';
  end if;

  if v_case.status <> 'draft' and v_case.guided_step = 'completed' then
    raise exception 'This crop check is already complete.'
      using errcode = 'P0001';
  end if;

  return query
  insert into public.crop_photos (
    crop_check_id,
    farmer_id,
    slot_key,
    storage_path,
    storage_bucket,
    label,
    mime_type,
    file_size_bytes,
    sort_order,
    is_skipped,
    uploaded_at,
    photo_type
  )
  values (
    p_check_id,
    p_farmer_id,
    v_slot,
    p_storage_path,
    coalesce(nullif(trim(coalesce(p_storage_bucket, '')), ''), 'case-photos'),
    p_label,
    p_mime_type,
    p_file_size_bytes,
    coalesce(p_sort_order, 0),
    coalesce(p_is_skipped, false),
    timezone('utc', now()),
    'other'
  )
  on conflict (crop_check_id, slot_key) do update
    set storage_path = excluded.storage_path,
        storage_bucket = excluded.storage_bucket,
        label = excluded.label,
        mime_type = excluded.mime_type,
        file_size_bytes = excluded.file_size_bytes,
        sort_order = excluded.sort_order,
        is_skipped = excluded.is_skipped,
        uploaded_at = excluded.uploaded_at,
        photo_type = 'other'
  returning
    crop_photos.id,
    crop_photos.crop_check_id,
    crop_photos.slot_key,
    crop_photos.storage_path,
    crop_photos.storage_bucket,
    crop_photos.label,
    crop_photos.mime_type,
    crop_photos.file_size_bytes,
    crop_photos.sort_order,
    crop_photos.is_skipped,
    crop_photos.uploaded_at;

  if v_case.guided_step is distinct from 'photos'
     and v_case.guided_step is distinct from 'completed' then
    update public.crop_checks
    set guided_step = 'photos',
        status = 'draft'
    where id = p_check_id
      and farmer_id = p_farmer_id;
  end if;
end;
$$;

create or replace function public.complete_crop_check_for_farmer(
  p_farmer_id uuid,
  p_check_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case record;
  v_slot text;
  v_label text;
  v_sort integer;
  v_missing text[] := '{}';
  v_existing record;
  v_slots text[] := array[
    'whole_field', 'whole_plant', 'leaf_front', 'leaf_back',
    'damage_detail', 'healthy_comparison'
  ];
  v_labels text[] := array[
    'Whole field or crop area',
    'Whole affected plant',
    'Front of affected leaf',
    'Back of affected leaf',
    'Stem, fruit, root, insect or damaged area',
    'Healthy comparison plant'
  ];
  v_completed_at timestamptz := timezone('utc', now());
  v_check jsonb;
  v_photos jsonb;
begin
  perform public.assert_active_farmer(p_farmer_id);

  select c.id, c.status, c.guided_step
    into v_case
  from public.crop_checks c
  where c.id = p_check_id
    and c.farmer_id = p_farmer_id;

  if v_case.id is null then
    raise exception 'Crop case not found.'
      using errcode = 'P0002';
  end if;

  if v_case.status <> 'draft' then
    select to_jsonb(g.*) into v_check
    from public.get_crop_check_for_farmer(p_farmer_id, p_check_id) g;

    select coalesce(jsonb_agg(to_jsonb(p.*) order by p.sort_order), '[]'::jsonb)
      into v_photos
    from public.list_crop_photos_for_farmer(p_farmer_id, p_check_id) p;

    return jsonb_build_object(
      'crop_check', v_check,
      'missing_slots', '[]'::jsonb,
      'photos', v_photos,
      'already_complete', true
    );
  end if;

  for i in 1..array_length(v_slots, 1) loop
    v_slot := v_slots[i];
    v_label := v_labels[i];
    v_sort := i;

    select p.id, p.is_skipped, p.storage_path
      into v_existing
    from public.crop_photos p
    where p.crop_check_id = p_check_id
      and p.slot_key = v_slot
    limit 1;

    if v_existing.id is not null
       and coalesce(v_existing.is_skipped, false) = false
       and v_existing.storage_path is not null then
      continue;
    end if;

    v_missing := array_append(v_missing, v_slot);

    if v_existing.id is null or coalesce(v_existing.is_skipped, false) = false then
      insert into public.crop_photos (
        crop_check_id,
        farmer_id,
        slot_key,
        storage_path,
        storage_bucket,
        label,
        mime_type,
        file_size_bytes,
        sort_order,
        is_skipped,
        uploaded_at,
        photo_type
      )
      values (
        p_check_id,
        p_farmer_id,
        v_slot,
        null,
        'case-photos',
        v_label,
        null,
        null,
        v_sort,
        true,
        v_completed_at,
        'other'
      )
      on conflict (crop_check_id, slot_key) do update
        set is_skipped = true,
            storage_path = coalesce(crop_photos.storage_path, excluded.storage_path),
            uploaded_at = v_completed_at;
    end if;
  end loop;

  update public.crop_checks
  set status = 'open',
      guided_step = 'completed',
      completed_at = v_completed_at
  where id = p_check_id
    and farmer_id = p_farmer_id;

  select to_jsonb(g.*) into v_check
  from public.get_crop_check_for_farmer(p_farmer_id, p_check_id) g;

  select coalesce(jsonb_agg(to_jsonb(p.*) order by p.sort_order), '[]'::jsonb)
    into v_photos
  from public.list_crop_photos_for_farmer(p_farmer_id, p_check_id) p;

  return jsonb_build_object(
    'crop_check', v_check,
    'missing_slots', to_jsonb(v_missing),
    'photos', v_photos,
    'already_complete', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Assessment + case context
-- ---------------------------------------------------------------------------
create or replace function public.get_farmer_case_context(
  p_farmer_id uuid,
  p_check_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check jsonb;
  v_farm jsonb;
  v_cycle jsonb;
  v_soil jsonb;
  v_photos jsonb;
begin
  perform public.assert_active_farmer(p_farmer_id);

  select to_jsonb(g.*) into v_check
  from public.get_crop_check_for_farmer(p_farmer_id, p_check_id) g;

  if v_check is null then
    raise exception 'Crop case not found.'
      using errcode = 'P0002';
  end if;

  select to_jsonb(f.*) into v_farm
  from (
    select
      farms.id,
      farms.name,
      farms.country,
      farms.district,
      farms.region,
      farms.village,
      farms.location_description,
      farms.latitude,
      farms.longitude,
      farms.water_source,
      farms.drainage_condition,
      farms.growing_system
    from public.farms
    where farms.id = (v_check ->> 'farm_id')::uuid
      and farms.farmer_id = p_farmer_id
  ) f;

  if (v_check ->> 'crop_cycle_id') is not null then
    select to_jsonb(c.*) into v_cycle
    from (
      select
        crop_cycles.id,
        crop_cycles.crop_name,
        crop_cycles.variety,
        crop_cycles.planting_date,
        crop_cycles.growth_stage,
        crop_cycles.area_planted,
        crop_cycles.area_unit,
        crop_cycles.growing_environment,
        crop_cycles.previous_crop
      from public.crop_cycles
      where crop_cycles.id = (v_check ->> 'crop_cycle_id')::uuid
    ) c;
  end if;

  select to_jsonb(s.*) into v_soil
  from (
    select
      soil_tests.ph,
      soil_tests.electrical_conductivity,
      soil_tests.sampled_at,
      soil_tests.notes
    from public.soil_tests
    where soil_tests.farm_id = (v_check ->> 'farm_id')::uuid
    order by soil_tests.sampled_at desc
    limit 1
  ) s;

  select coalesce(jsonb_agg(to_jsonb(p.*) order by p.sort_order), '[]'::jsonb)
    into v_photos
  from public.list_crop_photos_for_farmer(p_farmer_id, p_check_id) p
  where coalesce(p.is_skipped, false) = false
    and p.storage_path is not null;

  return jsonb_build_object(
    'crop_check', v_check,
    'farm', v_farm,
    'crop_cycle', v_cycle,
    'soil_test', v_soil,
    'photos', v_photos
  );
end;
$$;

create or replace function public.get_assessment_for_farmer(
  p_farmer_id uuid,
  p_check_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  perform public.assert_active_farmer(p_farmer_id);

  if not exists (
    select 1 from public.crop_checks c
    where c.id = p_check_id and c.farmer_id = p_farmer_id
  ) then
    raise exception 'Crop case not found.'
      using errcode = 'P0002';
  end if;

  select to_jsonb(a.*) into v_row
  from (
    select
      ar.id,
      ar.crop_check_id,
      ar.model_name,
      ar.case_summary,
      ar.summary,
      ar.likely_causes,
      ar.likely_issue,
      ar.confidence_score,
      ar.confidence,
      ar.missing_information,
      ar.immediate_safe_actions,
      ar.human_review_required,
      ar.laboratory_test_needed,
      ar.product_recommendation_allowed,
      ar.urgency_level,
      ar.severity,
      ar.assessed_at,
      ar.raw_response
    from public.assessment_results ar
    where ar.crop_check_id = p_check_id
    order by ar.assessed_at desc nulls last, ar.created_at desc
    limit 1
  ) a;

  return v_row;
end;
$$;

create or replace function public.upsert_assessment_for_farmer(
  p_farmer_id uuid,
  p_check_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_human_review boolean := coalesce((p_payload ->> 'human_review_required')::boolean, true);
  v_notes text := nullif(trim(coalesce(p_payload ->> 'follow_up_notes', '')), '');
begin
  perform public.assert_active_farmer(p_farmer_id);

  if not exists (
    select 1 from public.crop_checks c
    where c.id = p_check_id and c.farmer_id = p_farmer_id
  ) then
    raise exception 'Crop case not found.'
      using errcode = 'P0002';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Assessment payload is required.'
      using errcode = '22023';
  end if;

  insert into public.assessment_results (
    crop_check_id,
    farmer_id,
    model_name,
    case_summary,
    summary,
    likely_causes,
    likely_issue,
    confidence_score,
    confidence,
    missing_information,
    immediate_safe_actions,
    human_review_required,
    laboratory_test_needed,
    product_recommendation_allowed,
    urgency_level,
    severity,
    next_step,
    raw_response,
    assessed_at,
    review_status,
    staff_status
  )
  values (
    p_check_id,
    p_farmer_id,
    p_payload ->> 'model_name',
    p_payload ->> 'case_summary',
    p_payload ->> 'summary',
    coalesce(p_payload -> 'likely_causes', '[]'::jsonb),
    p_payload ->> 'likely_issue',
    nullif(p_payload ->> 'confidence_score', '')::numeric,
    nullif(p_payload ->> 'confidence', '')::numeric,
    coalesce(p_payload -> 'missing_information', '[]'::jsonb),
    coalesce(p_payload -> 'immediate_safe_actions', '[]'::jsonb),
    v_human_review,
    coalesce((p_payload ->> 'laboratory_test_needed')::boolean, false),
    coalesce((p_payload ->> 'product_recommendation_allowed')::boolean, false),
    p_payload ->> 'urgency_level',
    p_payload ->> 'severity',
    p_payload ->> 'next_step',
    p_payload -> 'raw_response',
    coalesce(nullif(p_payload ->> 'assessed_at', '')::timestamptz, timezone('utc', now())),
    coalesce(p_payload ->> 'review_status', 'pending'),
    coalesce(p_payload ->> 'staff_status', 'pending')
  )
  on conflict (crop_check_id) do update
    set model_name = excluded.model_name,
        case_summary = excluded.case_summary,
        summary = excluded.summary,
        likely_causes = excluded.likely_causes,
        likely_issue = excluded.likely_issue,
        confidence_score = excluded.confidence_score,
        confidence = excluded.confidence,
        missing_information = excluded.missing_information,
        immediate_safe_actions = excluded.immediate_safe_actions,
        human_review_required = excluded.human_review_required,
        laboratory_test_needed = excluded.laboratory_test_needed,
        product_recommendation_allowed = excluded.product_recommendation_allowed,
        urgency_level = excluded.urgency_level,
        severity = excluded.severity,
        next_step = excluded.next_step,
        raw_response = excluded.raw_response,
        assessed_at = excluded.assessed_at,
        review_status = excluded.review_status,
        staff_status = excluded.staff_status;

  if v_human_review then
    update public.crop_checks
    set status = 'in_review'
    where id = p_check_id
      and farmer_id = p_farmer_id;

    insert into public.follow_ups (
      crop_check_id,
      farmer_id,
      title,
      notes,
      status,
      follow_up_type
    )
    values (
      p_check_id,
      p_farmer_id,
      'Human technical review required',
      coalesce(v_notes, 'Automatic safety rules require technical review.'),
      'pending',
      'review'
    );
  end if;

  select public.get_assessment_for_farmer(p_farmer_id, p_check_id) into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
select public.grant_anon_execute('public.list_farms_for_farmer(uuid)');
select public.grant_anon_execute(
  'public.create_farm_for_farmer(uuid, text, text, text, numeric, text, numeric, text, numeric, numeric, text, text, text)'
);
select public.grant_anon_execute('public.list_crop_cycles_for_farmer(uuid, text, text)');
select public.grant_anon_execute(
  'public.create_crop_cycle_for_farmer(uuid, uuid, text, text, date, numeric, text, numeric, integer, text, text, text)'
);
select public.grant_anon_execute('public.list_crop_checks_for_farmer(uuid, text, uuid)');
select public.grant_anon_execute('public.get_crop_check_for_farmer(uuid, uuid)');
select public.grant_anon_execute('public.create_crop_check_for_farmer(uuid, uuid, text)');
select public.grant_anon_execute('public.save_crop_check_guided_answer(uuid, uuid, text, jsonb)');
select public.grant_anon_execute('public.list_crop_photos_for_farmer(uuid, uuid)');
select public.grant_anon_execute(
  'public.upsert_crop_photo_for_farmer(uuid, uuid, text, text, text, text, text, bigint, integer, boolean)'
);
select public.grant_anon_execute('public.complete_crop_check_for_farmer(uuid, uuid)');
select public.grant_anon_execute('public.get_farmer_case_context(uuid, uuid)');
select public.grant_anon_execute('public.get_assessment_for_farmer(uuid, uuid)');
select public.grant_anon_execute('public.upsert_assessment_for_farmer(uuid, uuid, jsonb)');

comment on function public.list_farms_for_farmer(uuid) is
  'Lists farms for a guest farmer id using SECURITY DEFINER. Called with the anon key.';
comment on function public.create_farm_for_farmer(
  uuid, text, text, text, numeric, text, numeric, text, numeric, numeric, text, text, text
) is
  'Creates a farm for a guest farmer id using SECURITY DEFINER. Called with the anon key.';
comment on function public.list_crop_cycles_for_farmer(uuid, text, text) is
  'Lists crop cycles for a guest farmer id using SECURITY DEFINER.';
comment on function public.create_crop_cycle_for_farmer(
  uuid, uuid, text, text, date, numeric, text, numeric, integer, text, text, text
) is
  'Creates a crop cycle owned by the farmer via farm ownership check.';
comment on function public.create_crop_check_for_farmer(uuid, uuid, text) is
  'Starts a guided crop check for an owned crop cycle.';
comment on function public.save_crop_check_guided_answer(uuid, uuid, text, jsonb) is
  'Saves one guided-question answer on a draft crop check.';
comment on function public.complete_crop_check_for_farmer(uuid, uuid) is
  'Completes a draft crop check and auto-skips missing photo slots.';
comment on function public.upsert_assessment_for_farmer(uuid, uuid, jsonb) is
  'Stores a preliminary assessment for a farmer-owned crop check.';
