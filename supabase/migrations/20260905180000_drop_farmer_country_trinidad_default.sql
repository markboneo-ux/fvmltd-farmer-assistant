-- Additive hardening: stop silently assigning Trinidad and Tobago.
-- Existing country values are left unchanged, including legitimate Trinidad rows.
-- Future inserts with no country stay NULL / unknown.
-- Blank strings are treated as unknown. Trinidad rows are not rewritten.

alter table public.farmer_profiles
  alter column country drop default;

alter table public.farms
  alter column country drop default;

update public.farmer_profiles
  set country = null
  where country is not null and btrim(country) = '';

update public.farms
  set country = null
  where country is not null and btrim(country) = '';

comment on column public.farmer_profiles.country is
  'Farmer-selected country. NULL means unknown. Never default to Trinidad and Tobago.';

comment on column public.farms.country is
  'Farm country. NULL means unknown. Never default to Trinidad and Tobago.';
