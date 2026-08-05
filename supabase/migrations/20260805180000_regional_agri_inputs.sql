-- =============================================================================
-- Regional agricultural-input catalogue (Caribbean-ready)
-- Additive only — does not drop existing tables.
-- Phase 1 seed focus: Trinidad and Tobago / tomato architecture.
-- =============================================================================

create table if not exists public.countries (
  id uuid primary key default gen_random_uuid(),
  iso_code text not null unique,
  name text not null unique,
  region_group text not null default 'caribbean',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.agri_inputs (
  id uuid primary key default gen_random_uuid(),
  product_type text not null check (
    product_type in (
      'fertilizer',
      'insecticide',
      'fungicide',
      'herbicide',
      'biological_control',
      'other'
    )
  ),
  brand_name text not null,
  active_ingredient text not null,
  nutrient_analysis text,
  formulation text,
  manufacturer text,
  biological_or_chemical text not null default 'chemical' check (
    biological_or_chemical in ('biological', 'chemical', 'nutrient', 'other')
  ),
  mode_of_action_group text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.input_registrations (
  id uuid primary key default gen_random_uuid(),
  input_id uuid not null references public.agri_inputs (id) on delete cascade,
  country_id uuid not null references public.countries (id) on delete cascade,
  registration_number text,
  registration_status text not null default 'registration_unknown' check (
    registration_status in (
      'registered',
      'expired',
      'suspended',
      'registration_unknown'
    )
  ),
  registration_expiry date,
  official_source_url text,
  last_verified_at timestamptz not null default timezone('utc', now()),
  verified_by text not null default 'system',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (input_id, country_id, registration_number)
);

create table if not exists public.input_crop_uses (
  id uuid primary key default gen_random_uuid(),
  input_id uuid not null references public.agri_inputs (id) on delete cascade,
  country_id uuid not null references public.countries (id) on delete cascade,
  crop text not null,
  target_pest_or_disease text not null,
  label_rate_text text,
  maximum_applications integer,
  pre_harvest_interval text,
  re_entry_interval text,
  registered_tank_mix_only boolean not null default false,
  label_source_url text,
  agronomist_approved boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.supplier_inventory (
  id uuid primary key default gen_random_uuid(),
  input_id uuid not null references public.agri_inputs (id) on delete cascade,
  country_id uuid not null references public.countries (id) on delete cascade,
  supplier_name text not null,
  district_or_region text,
  availability_status text not null default 'availability_unknown' check (
    availability_status in (
      'in_stock',
      'temporarily_out_of_stock',
      'availability_unknown'
    )
  ),
  pack_sizes text,
  last_stock_check_at timestamptz not null default timezone('utc', now()),
  source_type text not null default 'other' check (
    source_type in (
      'fvmltd_inventory',
      'approved_distributor',
      'fertilizer_supplier',
      'biological_control_supplier',
      'official_authority',
      'other'
    )
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.input_sources (
  id uuid primary key default gen_random_uuid(),
  country_id uuid references public.countries (id) on delete set null,
  source_type text not null,
  source_name text not null,
  source_url text,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.input_verification_history (
  id uuid primary key default gen_random_uuid(),
  input_id uuid references public.agri_inputs (id) on delete set null,
  country_id uuid references public.countries (id) on delete set null,
  verification_type text not null,
  previous_status text,
  new_status text,
  verified_by text not null,
  source_type text,
  notes text,
  verified_at timestamptz not null default timezone('utc', now())
);

create index if not exists agri_inputs_product_type_idx
  on public.agri_inputs (product_type);
create index if not exists input_crop_uses_country_crop_idx
  on public.input_crop_uses (country_id, crop);
create index if not exists supplier_inventory_country_status_idx
  on public.supplier_inventory (country_id, availability_status);

alter table public.countries enable row level security;
alter table public.agri_inputs enable row level security;
alter table public.input_registrations enable row level security;
alter table public.input_crop_uses enable row level security;
alter table public.supplier_inventory enable row level security;
alter table public.input_sources enable row level security;
alter table public.input_verification_history enable row level security;

-- Seed Trinidad and Tobago country row (idempotent).
insert into public.countries (iso_code, name, region_group)
values ('TT', 'Trinidad and Tobago', 'caribbean')
on conflict (iso_code) do update
set name = excluded.name,
    region_group = excluded.region_group,
    updated_at = timezone('utc', now());

insert into public.countries (iso_code, name, region_group)
values ('JM', 'Jamaica', 'caribbean')
on conflict (iso_code) do update
set name = excluded.name,
    region_group = excluded.region_group,
    updated_at = timezone('utc', now());
