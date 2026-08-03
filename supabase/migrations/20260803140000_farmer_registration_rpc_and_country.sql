-- Repair farmer registration for public (anon) access under RLS,
-- and set the default country to Trinidad and Tobago.

-- ---------------------------------------------------------------------------
-- Default country
-- ---------------------------------------------------------------------------
alter table public.farmers
  alter column country set default 'Trinidad and Tobago';

-- ---------------------------------------------------------------------------
-- Public registration function (SECURITY DEFINER bypasses RLS safely)
-- Callable with the anon key from the Next.js API route — does not require
-- the service-role key in the browser or for this specific operation.
-- ---------------------------------------------------------------------------
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
  main_crops text[],
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

  loop
    v_attempt := v_attempt + 1;
    v_code := 'FVM-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 6));

    begin
      return query
      insert into public.farmers (
        farmer_code,
        full_name,
        phone,
        country,
        region,
        farm_size,
        farm_size_unit,
        main_crops,
        consent_store_data,
        consent_at,
        member_since
      )
      values (
        v_code,
        v_name,
        v_phone,
        v_country,
        v_district,
        p_farm_size,
        v_unit,
        v_crops,
        true,
        timezone('utc', now()),
        current_date
      )
      returning
        farmers.id,
        farmers.farmer_code,
        farmers.full_name,
        farmers.phone,
        farmers.country,
        farmers.region,
        farmers.farm_size,
        farmers.farm_size_unit,
        farmers.main_crops,
        farmers.member_since;

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
  'Registers a farmer under RLS using SECURITY DEFINER. Called by POST /api/farmers/register with the anon key.';

revoke all on function public.register_farmer(
  text, text, text, text, numeric, text, text[], boolean
) from public;

grant execute on function public.register_farmer(
  text, text, text, text, numeric, text, text[], boolean
) to anon, authenticated;
