-- Extend farmers for registration: Farmer ID, farm size, crops, consent.
-- Apply after 20260731180000_initial_schema.sql

alter table public.farmers
  add column if not exists farmer_code text,
  add column if not exists farm_size numeric(10, 3),
  add column if not exists farm_size_unit text,
  add column if not exists main_crops text[] not null default '{}',
  add column if not exists consent_store_data boolean not null default false,
  add column if not exists consent_at timestamptz;

-- Backfill any rows that lack a farmer_code (none expected on a fresh project)
update public.farmers
set farmer_code = 'FVM-' || upper(substr(replace(id::text, '-', ''), 1, 6))
where farmer_code is null;

alter table public.farmers
  alter column farmer_code set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'farmers_farmer_code_key'
  ) then
    alter table public.farmers
      add constraint farmers_farmer_code_key unique (farmer_code);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'farmers_farm_size_unit_check'
  ) then
    alter table public.farmers
      add constraint farmers_farm_size_unit_check
      check (
        farm_size_unit is null
        or farm_size_unit in ('acres', 'hectares')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'farmers_farm_size_positive_check'
  ) then
    alter table public.farmers
      add constraint farmers_farm_size_positive_check
      check (farm_size is null or farm_size > 0);
  end if;
end $$;

create index if not exists farmers_farmer_code_idx on public.farmers (farmer_code);
create index if not exists farmers_phone_idx on public.farmers (phone);

comment on column public.farmers.farmer_code is
  'Public unique Farmer ID shown to the farmer (e.g. FVM-A1B2C3).';
comment on column public.farmers.phone is
  'WhatsApp number used as the primary contact for the farmer.';
comment on column public.farmers.region is
  'District or region where the farm is located.';
comment on column public.farmers.farm_size is
  'Numeric farm size as reported at registration.';
comment on column public.farmers.farm_size_unit is
  'Unit for farm_size: acres or hectares.';
comment on column public.farmers.main_crops is
  'Primary crops grown, captured at registration.';
comment on column public.farmers.consent_store_data is
  'Farmer consented to store farm information and crop photographs.';
comment on column public.farmers.consent_at is
  'Timestamp when consent was given.';
