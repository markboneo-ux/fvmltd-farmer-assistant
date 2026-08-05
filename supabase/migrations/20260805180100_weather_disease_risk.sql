-- =============================================================================
-- Weather snapshots + versioned disease-risk models/rules/alerts
-- Additive only. Thresholds are stored as editable configuration.
-- =============================================================================

create table if not exists public.weather_locations (
  id uuid primary key default gen_random_uuid(),
  country_id uuid references public.countries (id) on delete set null,
  country_name text not null,
  district text,
  latitude double precision not null,
  longitude double precision not null,
  label text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.weather_snapshots (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references public.weather_locations (id) on delete cascade,
  provider text not null,
  forecast_location text not null,
  observation_or_forecast_time timestamptz not null,
  retrieved_at timestamptz not null default timezone('utc', now()),
  forecast_horizon_hours integer not null default 168,
  payload jsonb not null default '{}'::jsonb,
  consecutive_wet_or_humid_hours integer,
  estimated_leaf_wetness_risk text check (
    estimated_leaf_wetness_risk in ('low', 'moderate', 'high')
  ),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.disease_risk_models (
  id uuid primary key default gen_random_uuid(),
  model_key text not null unique,
  crop text not null,
  version text not null,
  description text,
  agronomist_approved boolean not null default false,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.disease_risk_rules (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.disease_risk_models (id) on delete cascade,
  rule_key text not null,
  version text not null,
  disease_or_pest text not null,
  production_systems text[] not null default '{}',
  thresholds jsonb not null default '{}'::jsonb,
  risk_window_hours integer not null default 72,
  weather_drivers text[] not null default '{}',
  recommended_checks text[] not null default '{}',
  preventive_actions text[] not null default '{}',
  base_risk_level text not null default 'moderate' check (
    base_risk_level in ('low', 'moderate', 'high', 'urgent')
  ),
  escalate_thresholds jsonb not null default '{}'::jsonb,
  agronomist_approved boolean not null default false,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (model_id, rule_key, version)
);

create table if not exists public.disease_risk_assessments (
  id uuid primary key default gen_random_uuid(),
  country_name text not null,
  district text,
  crop text not null,
  variety text,
  crop_stage text,
  production_system text,
  weather_snapshot_id uuid references public.weather_snapshots (id) on delete set null,
  alerts jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.farmer_risk_alerts (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid references public.farmer_profiles (id) on delete set null,
  assessment_id uuid references public.disease_risk_assessments (id) on delete cascade,
  disease_or_pest text not null,
  risk_level text not null check (
    risk_level in ('low', 'moderate', 'high', 'urgent')
  ),
  risk_window text not null,
  weather_drivers text[] not null default '{}',
  crop_stage text,
  recommended_checks text[] not null default '{}',
  preventive_actions text[] not null default '{}',
  confidence text not null default 'medium',
  data_source text not null,
  generated_at timestamptz not null default timezone('utc', now()),
  acknowledged_at timestamptz
);

create index if not exists weather_snapshots_retrieved_at_idx
  on public.weather_snapshots (retrieved_at desc);
create index if not exists farmer_risk_alerts_level_idx
  on public.farmer_risk_alerts (risk_level, generated_at desc);

alter table public.weather_locations enable row level security;
alter table public.weather_snapshots enable row level security;
alter table public.disease_risk_models enable row level security;
alter table public.disease_risk_rules enable row level security;
alter table public.disease_risk_assessments enable row level security;
alter table public.farmer_risk_alerts enable row level security;

-- Seed approved tomato foliar model (editable thresholds in JSON).
insert into public.disease_risk_models (
  model_key, crop, version, description, agronomist_approved, approved_by, approved_at
)
values (
  'model_tomato_foliar_caribbean_v1',
  'tomato',
  '1.0.0',
  'Tropical Caribbean tomato foliar disease pressure model',
  true,
  'FVMLTD Agronomy (Phase 1 seed)',
  timezone('utc', now())
)
on conflict (model_key) do update
set version = excluded.version,
    agronomist_approved = excluded.agronomist_approved,
    updated_at = timezone('utc', now());
