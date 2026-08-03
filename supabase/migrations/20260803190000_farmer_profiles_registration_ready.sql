-- Production still has the pre-repair farmer_profiles shape:
--   id → auth.users(id), and no registration columns.
-- The rewritten baseline was marked applied without running, so
-- register_farmer could not insert. This migration makes registration
-- work with the anon key + SECURITY DEFINER RPC only.

-- 1) Detach id from auth.users so public registration can insert rows
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

-- 2) Add registration columns expected by the app + register_farmer RPC
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

alter table public.farmer_profiles
  alter column country set default 'Trinidad and Tobago';

-- Preserve auth linkage when a row id still matches auth.users
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

update public.farmer_profiles
set farmer_code = 'FVM-' || upper(substr(replace(id::text, '-', ''), 1, 6))
where farmer_code is null;

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
  when undefined_table then null;
  when duplicate_object then null;
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

-- 3) Recreate register_farmer with qualified pgcrypto + grants for anon
create or replace function public.register_farmer(
  p_full_name text,
  p_phone text,
  p_country text,
  p_district text,
  p_farm_size numeric,
  p_farm_size_unit text,
  p_main_crops text[],
  p_consent boolean
)
returns table (
  id uuid,
  farmer_code text,
  full_name text,
  phone text,
  country text,
  region text,
  farm_size numeric,
  farm_size_unit text,
  primary_crops text[],
  member_since date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_attempt integer := 0;
  v_name text := trim(coalesce(p_full_name, ''));
  v_phone text := trim(coalesce(p_phone, ''));
  v_phone_e164 text;
  v_country text := trim(coalesce(p_country, ''));
  v_district text := trim(coalesce(p_district, ''));
  v_unit text := trim(coalesce(p_farm_size_unit, ''));
  v_crops text[] := coalesce(p_main_crops, '{}'::text[]);
begin
  if p_consent is not true then
    raise exception 'Consent is required to store farm information and crop photographs.'
      using errcode = '22023';
  end if;

  if char_length(v_name) < 2 then
    raise exception 'Enter your full name.'
      using errcode = '22023';
  end if;

  if char_length(v_phone) < 8 then
    raise exception 'Enter a valid WhatsApp number, including country code.'
      using errcode = '22023';
  end if;

  if char_length(v_country) < 2 then
    raise exception 'Select or enter your country.'
      using errcode = '22023';
  end if;

  if char_length(v_district) < 1 then
    raise exception 'Enter your district or region.'
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

  if coalesce(array_length(v_crops, 1), 0) < 1 then
    raise exception 'Select at least one main crop.'
      using errcode = '22023';
  end if;

  v_phone_e164 := regexp_replace(v_phone, '[^0-9+]', '', 'g');
  if v_phone_e164 !~ '^\+' and v_phone_e164 ~ '^[0-9]+$' then
    v_phone_e164 := '+' || v_phone_e164;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := 'FVM-' || upper(substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 6));

    begin
      return query
      insert into public.farmer_profiles (
        farmer_code,
        full_name,
        phone,
        phone_e164,
        country,
        region,
        district,
        farm_size,
        farm_size_unit,
        primary_crops,
        consent_store_data,
        consent_at,
        member_since,
        is_active
      )
      values (
        v_code,
        v_name,
        v_phone,
        nullif(v_phone_e164, ''),
        v_country,
        v_district,
        v_district,
        p_farm_size,
        v_unit,
        v_crops,
        true,
        timezone('utc', now()),
        current_date,
        true
      )
      returning
        farmer_profiles.id,
        farmer_profiles.farmer_code,
        farmer_profiles.full_name,
        farmer_profiles.phone,
        farmer_profiles.country,
        farmer_profiles.region,
        farmer_profiles.farm_size,
        farmer_profiles.farm_size_unit,
        farmer_profiles.primary_crops,
        farmer_profiles.member_since;

      return;
    exception
      when unique_violation then
        if SQLERRM ilike '%phone%' then
          raise exception 'This WhatsApp number is already registered.'
            using errcode = '23505';
        end if;

        if v_attempt >= 5 then
          raise exception 'Could not generate a unique Farmer ID. Please try again.'
            using errcode = '23505';
        end if;
    end;
  end loop;
end;
$$;

comment on function public.register_farmer(
  text, text, text, text, numeric, text, text[], boolean
) is
  'Registers a farmer into public.farmer_profiles under RLS using SECURITY DEFINER. Called by POST /api/farmers/register with the anon key.';

revoke all on function public.register_farmer(
  text, text, text, text, numeric, text, text[], boolean
) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.register_farmer(
      text, text, text, text, numeric, text, text[], boolean
    ) to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.register_farmer(
      text, text, text, text, numeric, text, text[], boolean
    ) to authenticated;
  end if;
end;
$$;
