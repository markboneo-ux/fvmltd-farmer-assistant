-- Additive: staff case-review flags, trusted sources, chemical verification,
-- and web-research usage logs. Does not drop or rename existing tables.

alter table public.crop_cases
  add column if not exists diagnosis_incorrect boolean not null default false,
  add column if not exists needs_review boolean not null default false,
  add column if not exists useful_for_trend boolean not null default false,
  add column if not exists exclude_from_learning boolean not null default false,
  add column if not exists review_notes text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid;

create table if not exists public.trusted_sources (
  id text primary key,
  name text not null,
  country text not null,
  url text not null,
  domain text not null,
  category text not null,
  trust_level text not null,
  last_checked_at timestamptz not null default timezone('utc', now()),
  notes text
);

create table if not exists public.country_registered_chemicals (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  crop text,
  target_pest_or_disease text,
  active_ingredient text not null,
  trade_name text,
  registration_status text not null default 'unverified',
  registration_source text,
  source_url text,
  last_verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists country_registered_chemicals_country_idx
  on public.country_registered_chemicals (country, active_ingredient);

create table if not exists public.web_research_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid,
  used_web boolean not null default false,
  need text not null,
  sources text[] not null default '{}',
  failures jsonb not null default '[]'::jsonb,
  outdated_sources text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.trusted_sources enable row level security;
alter table public.country_registered_chemicals enable row level security;
alter table public.web_research_events enable row level security;

drop policy if exists trusted_sources_staff_select on public.trusted_sources;
create policy trusted_sources_staff_select on public.trusted_sources
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles s
      where s.is_active = true
        and (s.auth_user_id = auth.uid() or s.id = auth.uid())
    )
  );

drop policy if exists country_registered_chemicals_staff_select on public.country_registered_chemicals;
create policy country_registered_chemicals_staff_select on public.country_registered_chemicals
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles s
      where s.is_active = true
        and (s.auth_user_id = auth.uid() or s.id = auth.uid())
    )
  );

drop policy if exists web_research_events_staff_select on public.web_research_events;
create policy web_research_events_staff_select on public.web_research_events
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles s
      where s.is_active = true
        and (s.auth_user_id = auth.uid() or s.id = auth.uid())
    )
  );

grant select on public.trusted_sources to authenticated;
grant select on public.country_registered_chemicals to authenticated;
grant select on public.web_research_events to authenticated;

insert into public.trusted_sources (id, name, country, url, domain, category, trust_level, last_checked_at, notes)
values
  ('tt-namis', 'NAMDEVCO NAMIS market data', 'Trinidad and Tobago', 'https://namistt.com/', 'namistt.com', 'market_prices', 'statutory_authority', '2026-09-01T00:00:00Z', 'Wholesale prices and volumes'),
  ('tt-namdevco', 'NAMDEVCO', 'Trinidad and Tobago', 'https://www.namdevco.com/market-information', 'namdevco.com', 'market_prices', 'statutory_authority', '2026-09-01T00:00:00Z', null),
  ('tt-malaf', 'Ministry of Agriculture, Land and Fisheries', 'Trinidad and Tobago', 'https://agriculture.gov.tt/', 'agriculture.gov.tt', 'government_guidance', 'official_government', '2026-09-01T00:00:00Z', null),
  ('cardi', 'CARDI', 'Caribbean', 'https://www.cardi.org/', 'cardi.org', 'research', 'research_institution', '2026-09-01T00:00:00Z', null),
  ('uwi-sta', 'The University of the West Indies', 'Caribbean', 'https://sta.uwi.edu/', 'uwi.edu', 'research', 'research_institution', '2026-09-01T00:00:00Z', null),
  ('gy-ptccb', 'Guyana Pesticides and Toxic Chemicals Control Board', 'Guyana', 'https://ptccb.org.gy/', 'ptccb.org.gy', 'pesticide_registration', 'official_government', '2026-09-01T00:00:00Z', null)
on conflict (id) do nothing;
