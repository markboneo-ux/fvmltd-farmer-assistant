-- Additive: country research, web citations, and staff review signals.
-- Does not drop or rename existing tables.

alter table public.crop_cases
  add column if not exists diagnosis_incorrect boolean not null default false,
  add column if not exists needs_review boolean not null default false,
  add column if not exists include_in_trend_learning boolean not null default true;

create table if not exists public.trusted_sources (
  id text primary key,
  country text not null,
  source_name text not null,
  domain text,
  homepage_url text,
  source_type text not null,
  trust_level text not null default 'unreviewed',
  active boolean not null default false,
  notes text,
  last_reviewed_at timestamptz,
  preferred_for text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.web_research_events (
  id uuid primary key default gen_random_uuid(),
  country text,
  topics text[] not null default '{}',
  used boolean not null default false,
  failed boolean not null default false,
  stale_warnings integer not null default 0,
  source_names text[] not null default '{}',
  correlation_id text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.case_web_citations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.crop_cases (id) on delete cascade,
  url text not null,
  retrieved_at timestamptz not null default timezone('utc', now()),
  title text,
  source_name text,
  country text,
  source_type text,
  published_at timestamptz
);

create index if not exists web_research_events_created_idx
  on public.web_research_events (created_at desc);

alter table public.trusted_sources enable row level security;
alter table public.web_research_events enable row level security;
alter table public.case_web_citations enable row level security;

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

drop policy if exists case_web_citations_staff_select on public.case_web_citations;
create policy case_web_citations_staff_select on public.case_web_citations
  for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles s
      where s.is_active = true
        and (s.auth_user_id = auth.uid() or s.id = auth.uid())
    )
  );

grant select on public.trusted_sources to authenticated;
grant select on public.web_research_events to authenticated;
grant select on public.case_web_citations to authenticated;
