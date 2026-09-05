-- Additive hardening: stop silently assigning Trinidad and Tobago.
-- Existing country values are left unchanged, including legitimate Trinidad rows.
-- Future inserts with no country stay NULL / unknown.

alter table public.farmer_profiles
  alter column country drop default;

alter table public.farms
  alter column country drop default;

comment on column public.farmer_profiles.country is
  'Farmer-selected country. NULL means unknown. Never default to Trinidad and Tobago.';
