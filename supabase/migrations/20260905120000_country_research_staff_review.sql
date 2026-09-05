-- Additive: country research, web citations, and staff review signals.
-- Extends the production research_admin_review schema without dropping columns.

alter table public.crop_cases
  add column if not exists diagnosis_incorrect boolean not null default false,
  add column if not exists needs_review boolean not null default false,
  add column if not exists include_in_trend_learning boolean not null default true;

-- Extra columns on production trusted_sources / web_research_events so both
-- the production catalog and the country-research engine can persist.
alter table public.trusted_sources
  add column if not exists source_name text,
  add column if not exists homepage_url text,
  add column if not exists source_type text,
  add column if not exists active boolean not null default true,
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists preferred_for text[] not null default '{}',
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.web_research_events
  add column if not exists country text,
  add column if not exists topics text[] not null default '{}',
  add column if not exists used boolean,
  add column if not exists failed boolean not null default false,
  add column if not exists stale_warnings integer not null default 0,
  add column if not exists source_names text[] not null default '{}',
  add column if not exists correlation_id text;

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

alter table public.case_web_citations enable row level security;

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

grant select on public.case_web_citations to authenticated;

update public.trusted_sources
set source_name = coalesce(source_name, name),
    homepage_url = coalesce(homepage_url, url),
    source_type = coalesce(source_type, category),
    last_reviewed_at = coalesce(last_reviewed_at, last_checked_at)
where source_name is null or homepage_url is null;
