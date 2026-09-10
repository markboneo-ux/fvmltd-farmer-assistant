-- Voice-note metadata on case_messages.
-- Audio files stay private; this table only stores a storage path and transcript fields.

alter table public.case_messages
  add column if not exists input_mode text not null default 'text';

alter table public.case_messages
  add column if not exists audio_duration_seconds numeric;

alter table public.case_messages
  add column if not exists audio_storage_path text;

alter table public.case_messages
  add column if not exists transcription_confidence numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'case_messages_input_mode_check'
  ) then
    alter table public.case_messages
      add constraint case_messages_input_mode_check
      check (input_mode in ('text', 'photo', 'voice'));
  end if;
end $$;
