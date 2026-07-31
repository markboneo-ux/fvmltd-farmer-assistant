-- Staff Review Dashboard: workflow fields, messages, lab requests, staff RLS helper

-- ---------------------------------------------------------------------------
-- crop_cases: staff queue + closure fields; awaiting_info status
-- ---------------------------------------------------------------------------
alter table public.crop_cases
  add column if not exists is_urgent boolean not null default false,
  add column if not exists awaiting_farmer_reply boolean not null default false,
  add column if not exists staff_notes text,
  add column if not exists closed_reason text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by_staff_id uuid references public.staff_users (id) on delete set null;

alter table public.crop_cases drop constraint if exists crop_cases_status_check;
alter table public.crop_cases
  add constraint crop_cases_status_check
  check (
    status in (
      'draft',
      'open',
      'in_review',
      'awaiting_info',
      'resolved',
      'closed'
    )
  );

create index if not exists crop_cases_is_urgent_idx
  on public.crop_cases (is_urgent)
  where is_urgent = true;

create index if not exists crop_cases_reviewed_by_staff_id_idx
  on public.crop_cases (reviewed_by_staff_id);

-- ---------------------------------------------------------------------------
-- ai_assessments: staff approval / edit layer (AI row kept; staff overrides)
-- ---------------------------------------------------------------------------
alter table public.ai_assessments
  add column if not exists staff_status text not null default 'pending'
    check (staff_status in ('pending', 'approved', 'edited', 'rejected')),
  add column if not exists approved_by_staff_id uuid references public.staff_users (id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists staff_case_summary text,
  add column if not exists staff_likely_causes jsonb,
  add column if not exists staff_immediate_actions jsonb,
  add column if not exists staff_missing_information jsonb,
  add column if not exists staff_urgency_level text
    check (
      staff_urgency_level is null
      or staff_urgency_level in ('low', 'moderate', 'high', 'critical')
    ),
  add column if not exists staff_edit_notes text;

create index if not exists ai_assessments_staff_status_idx
  on public.ai_assessments (staff_status);

-- ---------------------------------------------------------------------------
-- follow_ups: typed follow-up work
-- ---------------------------------------------------------------------------
alter table public.follow_ups
  add column if not exists follow_up_type text not null default 'review'
    check (
      follow_up_type in (
        'review',
        'ask_farmer',
        'soil_test',
        'lab_test',
        'monitor',
        'other'
      )
    );

-- ---------------------------------------------------------------------------
-- case_messages: staff questions / farmer replies
-- ---------------------------------------------------------------------------
create table if not exists public.case_messages (
  id uuid primary key default gen_random_uuid(),
  crop_case_id uuid not null references public.crop_cases (id) on delete cascade,
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  author_type text not null
    check (author_type in ('staff', 'farmer', 'system')),
  staff_user_id uuid references public.staff_users (id) on delete set null,
  body text not null,
  requires_reply boolean not null default false,
  answered_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists case_messages_crop_case_id_idx
  on public.case_messages (crop_case_id, created_at);

create index if not exists case_messages_farmer_id_idx
  on public.case_messages (farmer_id);

alter table public.case_messages enable row level security;

comment on table public.case_messages is
  'Staff questions and farmer replies linked to a crop case.';

-- ---------------------------------------------------------------------------
-- lab_test_requests: soil / laboratory test requests from staff
-- ---------------------------------------------------------------------------
create table if not exists public.lab_test_requests (
  id uuid primary key default gen_random_uuid(),
  crop_case_id uuid not null references public.crop_cases (id) on delete cascade,
  farmer_id uuid not null references public.farmers (id) on delete cascade,
  farm_id uuid not null references public.farms (id) on delete cascade,
  requested_by_staff_id uuid references public.staff_users (id) on delete set null,
  request_type text not null default 'soil'
    check (request_type in ('soil', 'laboratory', 'tissue', 'water', 'pathogen', 'other')),
  status text not null default 'requested'
    check (
      status in (
        'requested',
        'sample_collected',
        'in_lab',
        'completed',
        'cancelled'
      )
    ),
  notes text,
  soil_test_id uuid references public.soil_tests (id) on delete set null,
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists lab_test_requests_crop_case_id_idx
  on public.lab_test_requests (crop_case_id);

create index if not exists lab_test_requests_status_idx
  on public.lab_test_requests (status);

create trigger lab_test_requests_set_updated_at
before update on public.lab_test_requests
for each row execute function public.set_updated_at();

alter table public.lab_test_requests enable row level security;

comment on table public.lab_test_requests is
  'Soil and laboratory test requests raised by FVMLTD staff.';

-- ---------------------------------------------------------------------------
-- Staff can read their own staff_users row (for session verification)
-- Trusted staff APIs still use the service role after auth checks.
-- ---------------------------------------------------------------------------
drop policy if exists staff_users_select_own on public.staff_users;
create policy staff_users_select_own
  on public.staff_users
  for select
  to authenticated
  using (auth_user_id = auth.uid() and is_active = true);
