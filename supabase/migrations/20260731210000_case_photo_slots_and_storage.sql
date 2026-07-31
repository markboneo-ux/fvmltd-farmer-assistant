-- Case photo slots + private Storage bucket for Crop Check photographs.
-- Apply after 20260731200000_crop_check_guided_fields.sql

-- ---------------------------------------------------------------------------
-- case_photos: one row per required slot; skips allowed
-- ---------------------------------------------------------------------------
alter table public.case_photos
  add column if not exists slot_key text,
  add column if not exists is_skipped boolean not null default false;

-- Existing rows (if any) get a generic slot key before NOT NULL
update public.case_photos
set slot_key = coalesce(slot_key, 'legacy_' || id::text)
where slot_key is null;

alter table public.case_photos
  alter column slot_key set not null;

-- Skipped slots do not need a storage object
alter table public.case_photos
  alter column storage_path drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'case_photos_slot_key_check'
  ) then
    alter table public.case_photos
      add constraint case_photos_slot_key_check
      check (
        slot_key in (
          'whole_field',
          'whole_plant',
          'leaf_front',
          'leaf_back',
          'damage_detail',
          'healthy_comparison'
        )
        or slot_key like 'legacy_%'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'case_photos_skip_or_path_check'
  ) then
    alter table public.case_photos
      add constraint case_photos_skip_or_path_check
      check (
        (is_skipped = true and storage_path is null)
        or (is_skipped = false and storage_path is not null)
      );
  end if;
end $$;

create unique index if not exists case_photos_case_slot_uidx
  on public.case_photos (crop_case_id, slot_key);

comment on column public.case_photos.slot_key is
  'Required Crop Check photo slot identifier.';
comment on column public.case_photos.is_skipped is
  'True when the farmer skipped this required photograph.';

-- ---------------------------------------------------------------------------
-- Private Storage bucket (service-role uploads; not public)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'case-photos',
  'case-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
