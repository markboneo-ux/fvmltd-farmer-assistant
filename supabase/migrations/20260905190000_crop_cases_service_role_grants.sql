-- Conversational persistence tables must be visible to PostgREST and writable
-- by the server service_role client. Preview and Production share this schema.

grant all on table public.crop_cases to postgres, service_role;
grant all on table public.case_messages to postgres, service_role;
grant all on table public.case_observations to postgres, service_role;
grant all on table public.case_assessments to postgres, service_role;
grant all on table public.case_actions to postgres, service_role;
grant all on table public.case_outcomes to postgres, service_role;
grant all on table public.case_photos to postgres, service_role;
grant all on table public.case_followups to postgres, service_role;
grant all on table public.guest_sessions to postgres, service_role;
grant all on table public.usage_events to postgres, service_role;
grant all on table public.user_entitlements to postgres, service_role;
grant all on table public.app_settings to postgres, service_role;
grant all on table public.promo_codes to postgres, service_role;
grant all on table public.promo_redemptions to postgres, service_role;
grant all on table public.case_trends to postgres, service_role;
grant all on table public.trusted_sources to postgres, service_role;
grant all on table public.country_registered_chemicals to postgres, service_role;
grant all on table public.web_research_events to postgres, service_role;
grant all on table public.case_web_citations to postgres, service_role;

grant select on table public.crop_cases to authenticated;
grant select on table public.case_messages to authenticated;

notify pgrst, 'reload schema';
