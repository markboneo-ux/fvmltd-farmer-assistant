-- Register farmer against canonical public.farmer_profiles (not public.farmers).
-- Callable with the anon key via SECURITY DEFINER — no service-role key required.

alter table public.farmer_profiles
  alter column country set default 'Trinidad and Tobago';

-- Drop prior signatures so return-type changes (main_crops → primary_crops) apply cleanly
drop function if exists public.register_farmer(
  text, text, text, text, numeric, text, text[], boolean
);

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

  -- Normalize to digits with leading + for E.164-ish storage when possible
  v_phone_e164 := regexp_replace(v_phone, '[^0-9+]', '', 'g');
  if v_phone_e164 !~ '^\+' and v_phone_e164 ~ '^[0-9]+$' then
    v_phone_e164 := '+' || v_phone_e164;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := 'FVM-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 6));

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
        -- farmer_code collision — retry
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
