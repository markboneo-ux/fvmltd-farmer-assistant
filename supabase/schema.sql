-- =============================================================================
-- FVMLTD Farmer Crop Assistant — Supabase schema
-- Safe to run in a new Supabase project (idempotent where practical).
-- =============================================================================

create extension if not exists "pgcrypto";

-- =============================================================================
-- Utility: updated_at trigger
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- =============================================================================
-- 1. farmer_profiles  (linked to auth.users)
-- =============================================================================

create table if not exists public.farmer_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text,
  village text,
  region text,
  country text default 'Tanzania',
  preferred_language text default 'en',
  primary_crops text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists farmer_profiles_set_updated_at on public.farmer_profiles;
create trigger farmer_profiles_set_updated_at
before update on public.farmer_profiles
for each row
execute function public.set_updated_at();

create index if not exists farmer_profiles_region_idx
  on public.farmer_profiles (region);

create index if not exists farmer_profiles_village_idx
  on public.farmer_profiles (village);

create index if not exists farmer_profiles_is_active_idx
  on public.farmer_profiles (is_active);

-- =============================================================================
-- 2. farms
-- =============================================================================

create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  name text not null,
  village text,
  region text,
  country text default 'Tanzania',
  size_hectares numeric(10, 2),
  soil_type text,
  water_source text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint farms_size_hectares_nonnegative
    check (size_hectares is null or size_hectares >= 0)
);

drop trigger if exists farms_set_updated_at on public.farms;
create trigger farms_set_updated_at
before update on public.farms
for each row
execute function public.set_updated_at();

create index if not exists farms_farmer_id_idx
  on public.farms (farmer_id);

create index if not exists farms_region_idx
  on public.farms (region);

create index if not exists farms_is_active_idx
  on public.farms (is_active);

-- =============================================================================
-- 3. crop_checks
-- reviewed_by FK is added after staff_profiles exists.
-- =============================================================================

create table if not exists public.crop_checks (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  farm_id uuid references public.farms (id) on delete set null,
  crop_name text not null,
  growth_stage text,
  symptoms text,
  notes text,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'in_review', 'completed', 'archived')),
  severity text
    check (severity is null or severity in ('low', 'mild', 'moderate', 'high')),
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists crop_checks_set_updated_at on public.crop_checks;
create trigger crop_checks_set_updated_at
before update on public.crop_checks
for each row
execute function public.set_updated_at();

create index if not exists crop_checks_farmer_id_idx
  on public.crop_checks (farmer_id);

create index if not exists crop_checks_farm_id_idx
  on public.crop_checks (farm_id);

create index if not exists crop_checks_status_idx
  on public.crop_checks (status);

create index if not exists crop_checks_created_at_idx
  on public.crop_checks (created_at desc);

create index if not exists crop_checks_crop_name_idx
  on public.crop_checks (crop_name);

-- =============================================================================
-- 4. crop_photos
-- =============================================================================

create table if not exists public.crop_photos (
  id uuid primary key default gen_random_uuid(),
  crop_check_id uuid not null references public.crop_checks (id) on delete cascade,
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  storage_path text not null,
  public_url text,
  caption text,
  photo_type text not null default 'other'
    check (photo_type in ('whole_plant', 'affected_leaves', 'stem_base', 'other')),
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists crop_photos_set_updated_at on public.crop_photos;
create trigger crop_photos_set_updated_at
before update on public.crop_photos
for each row
execute function public.set_updated_at();

create index if not exists crop_photos_crop_check_id_idx
  on public.crop_photos (crop_check_id);

create index if not exists crop_photos_farmer_id_idx
  on public.crop_photos (farmer_id);

create index if not exists crop_photos_photo_type_idx
  on public.crop_photos (photo_type);

-- =============================================================================
-- 5. chat_messages
-- =============================================================================

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  crop_check_id uuid references public.crop_checks (id) on delete set null,
  role text not null
    check (role in ('farmer', 'assistant', 'staff', 'system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint chat_messages_content_not_blank
    check (char_length(trim(content)) > 0)
);

drop trigger if exists chat_messages_set_updated_at on public.chat_messages;
create trigger chat_messages_set_updated_at
before update on public.chat_messages
for each row
execute function public.set_updated_at();

create index if not exists chat_messages_farmer_id_idx
  on public.chat_messages (farmer_id);

create index if not exists chat_messages_crop_check_id_idx
  on public.chat_messages (crop_check_id);

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at);

create index if not exists chat_messages_role_idx
  on public.chat_messages (role);

-- =============================================================================
-- 6. assessment_results
-- reviewed_by FK is added after staff_profiles exists.
-- =============================================================================

create table if not exists public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  crop_check_id uuid not null unique references public.crop_checks (id) on delete cascade,
  farmer_id uuid not null references public.farmer_profiles (id) on delete cascade,
  likely_issue text,
  summary text,
  severity text
    check (severity is null or severity in ('low', 'mild', 'moderate', 'high')),
  confidence numeric(5, 2)
    check (confidence is null or (confidence >= 0 and confidence <= 100)),
  recommendations text[] not null default '{}',
  next_step text,
  model_name text,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'in_review', 'approved', 'rejected', 'needs_info')),
  staff_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists assessment_results_set_updated_at on public.assessment_results;
create trigger assessment_results_set_updated_at
before update on public.assessment_results
for each row
execute function public.set_updated_at();

create index if not exists assessment_results_farmer_id_idx
  on public.assessment_results (farmer_id);

create index if not exists assessment_results_review_status_idx
  on public.assessment_results (review_status);

create index if not exists assessment_results_severity_idx
  on public.assessment_results (severity);

create index if not exists assessment_results_created_at_idx
  on public.assessment_results (created_at desc);

-- =============================================================================
-- 7. staff_profiles  (linked to auth.users)
-- =============================================================================

create table if not exists public.staff_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  role text not null default 'agronomist'
    check (role in ('agronomist', 'reviewer', 'admin')),
  organization text default 'FVMLTD',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists staff_profiles_set_updated_at on public.staff_profiles;
create trigger staff_profiles_set_updated_at
before update on public.staff_profiles
for each row
execute function public.set_updated_at();

create index if not exists staff_profiles_role_idx
  on public.staff_profiles (role);

create index if not exists staff_profiles_is_active_idx
  on public.staff_profiles (is_active);

-- Deferred foreign keys to staff_profiles
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crop_checks_reviewed_by_fkey'
  ) then
    alter table public.crop_checks
      add constraint crop_checks_reviewed_by_fkey
      foreign key (reviewed_by)
      references public.staff_profiles (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'assessment_results_reviewed_by_fkey'
  ) then
    alter table public.assessment_results
      add constraint assessment_results_reviewed_by_fkey
      foreign key (reviewed_by)
      references public.staff_profiles (id)
      on delete set null;
  end if;
end;
$$;

create index if not exists crop_checks_reviewed_by_idx
  on public.crop_checks (reviewed_by);

create index if not exists assessment_results_reviewed_by_idx
  on public.assessment_results (reviewed_by);

-- =============================================================================
-- Role / ownership helpers (SECURITY DEFINER to avoid RLS recursion)
-- =============================================================================

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.id = auth.uid()
      and sp.is_active = true
  );
$$;

create or replace function public.is_farmer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.farmer_profiles fp
    where fp.id = auth.uid()
      and fp.is_active = true
  );
$$;

create or replace function public.owns_crop_check(check_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.crop_checks cc
    where cc.id = check_id
      and cc.farmer_id = auth.uid()
  );
$$;

revoke all on function public.is_staff() from public;
revoke all on function public.is_farmer() from public;
revoke all on function public.owns_crop_check(uuid) from public;

grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_farmer() to authenticated;
grant execute on function public.owns_crop_check(uuid) to authenticated;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.farmer_profiles enable row level security;
alter table public.farms enable row level security;
alter table public.crop_checks enable row level security;
alter table public.crop_photos enable row level security;
alter table public.chat_messages enable row level security;
alter table public.assessment_results enable row level security;
alter table public.staff_profiles enable row level security;

-- ----- farmer_profiles -----
drop policy if exists "farmers_select_own_profile" on public.farmer_profiles;
create policy "farmers_select_own_profile"
  on public.farmer_profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_staff());

drop policy if exists "farmers_insert_own_profile" on public.farmer_profiles;
create policy "farmers_insert_own_profile"
  on public.farmer_profiles
  for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "farmers_update_own_profile" on public.farmer_profiles;
create policy "farmers_update_own_profile"
  on public.farmer_profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ----- farms -----
drop policy if exists "farmers_select_own_farms" on public.farms;
create policy "farmers_select_own_farms"
  on public.farms
  for select
  to authenticated
  using (farmer_id = auth.uid() or public.is_staff());

drop policy if exists "farmers_insert_own_farms" on public.farms;
create policy "farmers_insert_own_farms"
  on public.farms
  for insert
  to authenticated
  with check (farmer_id = auth.uid());

drop policy if exists "farmers_update_own_farms" on public.farms;
create policy "farmers_update_own_farms"
  on public.farms
  for update
  to authenticated
  using (farmer_id = auth.uid())
  with check (farmer_id = auth.uid());

drop policy if exists "farmers_delete_own_farms" on public.farms;
create policy "farmers_delete_own_farms"
  on public.farms
  for delete
  to authenticated
  using (farmer_id = auth.uid());

-- ----- crop_checks -----
drop policy if exists "farmers_select_own_crop_checks" on public.crop_checks;
create policy "farmers_select_own_crop_checks"
  on public.crop_checks
  for select
  to authenticated
  using (farmer_id = auth.uid() or public.is_staff());

drop policy if exists "farmers_insert_own_crop_checks" on public.crop_checks;
create policy "farmers_insert_own_crop_checks"
  on public.crop_checks
  for insert
  to authenticated
  with check (farmer_id = auth.uid());

drop policy if exists "farmers_update_own_crop_checks" on public.crop_checks;
create policy "farmers_update_own_crop_checks"
  on public.crop_checks
  for update
  to authenticated
  using (farmer_id = auth.uid())
  with check (farmer_id = auth.uid());

drop policy if exists "staff_update_crop_checks_for_review" on public.crop_checks;
create policy "staff_update_crop_checks_for_review"
  on public.crop_checks
  for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "farmers_delete_own_crop_checks" on public.crop_checks;
create policy "farmers_delete_own_crop_checks"
  on public.crop_checks
  for delete
  to authenticated
  using (farmer_id = auth.uid());

-- ----- crop_photos -----
drop policy if exists "farmers_select_own_crop_photos" on public.crop_photos;
create policy "farmers_select_own_crop_photos"
  on public.crop_photos
  for select
  to authenticated
  using (farmer_id = auth.uid() or public.is_staff());

drop policy if exists "farmers_insert_own_crop_photos" on public.crop_photos;
create policy "farmers_insert_own_crop_photos"
  on public.crop_photos
  for insert
  to authenticated
  with check (
    farmer_id = auth.uid()
    and public.owns_crop_check(crop_check_id)
  );

drop policy if exists "farmers_update_own_crop_photos" on public.crop_photos;
create policy "farmers_update_own_crop_photos"
  on public.crop_photos
  for update
  to authenticated
  using (farmer_id = auth.uid())
  with check (farmer_id = auth.uid());

drop policy if exists "farmers_delete_own_crop_photos" on public.crop_photos;
create policy "farmers_delete_own_crop_photos"
  on public.crop_photos
  for delete
  to authenticated
  using (farmer_id = auth.uid());

-- ----- chat_messages -----
drop policy if exists "farmers_select_own_chat_messages" on public.chat_messages;
create policy "farmers_select_own_chat_messages"
  on public.chat_messages
  for select
  to authenticated
  using (farmer_id = auth.uid() or public.is_staff());

drop policy if exists "farmers_insert_own_chat_messages" on public.chat_messages;
create policy "farmers_insert_own_chat_messages"
  on public.chat_messages
  for insert
  to authenticated
  with check (
    farmer_id = auth.uid()
    and role in ('farmer', 'assistant', 'system')
  );

drop policy if exists "staff_insert_chat_messages" on public.chat_messages;
create policy "staff_insert_chat_messages"
  on public.chat_messages
  for insert
  to authenticated
  with check (
    public.is_staff()
    and role in ('staff', 'assistant', 'system')
  );

-- ----- assessment_results -----
drop policy if exists "farmers_select_own_assessment_results" on public.assessment_results;
create policy "farmers_select_own_assessment_results"
  on public.assessment_results
  for select
  to authenticated
  using (farmer_id = auth.uid() or public.is_staff());

drop policy if exists "farmers_insert_own_assessment_results" on public.assessment_results;
create policy "farmers_insert_own_assessment_results"
  on public.assessment_results
  for insert
  to authenticated
  with check (
    farmer_id = auth.uid()
    and public.owns_crop_check(crop_check_id)
  );

drop policy if exists "farmers_update_own_pending_assessments" on public.assessment_results;
create policy "farmers_update_own_pending_assessments"
  on public.assessment_results
  for update
  to authenticated
  using (
    farmer_id = auth.uid()
    and review_status in ('pending', 'needs_info')
  )
  with check (farmer_id = auth.uid());

drop policy if exists "staff_update_assessment_results" on public.assessment_results;
create policy "staff_update_assessment_results"
  on public.assessment_results
  for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ----- staff_profiles -----
drop policy if exists "staff_select_profiles" on public.staff_profiles;
create policy "staff_select_profiles"
  on public.staff_profiles
  for select
  to authenticated
  using (id = auth.uid() or public.is_staff());

drop policy if exists "staff_insert_own_profile" on public.staff_profiles;
create policy "staff_insert_own_profile"
  on public.staff_profiles
  for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "staff_update_own_profile" on public.staff_profiles;
create policy "staff_update_own_profile"
  on public.staff_profiles
  for update
  to authenticated
  using (id = auth.uid() or public.is_staff())
  with check (id = auth.uid() or public.is_staff());

-- =============================================================================
-- Grants
-- =============================================================================

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.farmer_profiles to authenticated;
grant select, insert, update, delete on public.farms to authenticated;
grant select, insert, update, delete on public.crop_checks to authenticated;
grant select, insert, update, delete on public.crop_photos to authenticated;
grant select, insert on public.chat_messages to authenticated;
grant select, insert, update on public.assessment_results to authenticated;
grant select, insert, update on public.staff_profiles to authenticated;

-- =============================================================================
-- Done
-- =============================================================================
-- After running this file:
-- 1. Create Auth users in Supabase Authentication.
-- 2. Insert matching rows into farmer_profiles or staff_profiles (id = auth.users.id).
-- 3. Farmers will only see their own farms/checks/photos/messages/assessments.
-- 4. Active staff can review crop_checks, crop_photos, and assessment_results.
