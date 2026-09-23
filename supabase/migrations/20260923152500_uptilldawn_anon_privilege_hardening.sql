-- Tighten the public API surface:
-- 1) anonymous users do not need direct access to crew tables,
-- 2) public-role RLS policies become authenticated-only,
-- 3) trigger functions are not directly executable,
-- 4) future public-schema objects default to no anonymous table/function privileges.

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

ALTER POLICY notifications_read ON public.crew_notifications TO authenticated;
ALTER POLICY notifications_update ON public.crew_notifications TO authenticated;

ALTER POLICY event_members_admin ON public.event_members TO authenticated;
ALTER POLICY event_members_read ON public.event_members TO authenticated;

ALTER POLICY templates_admin ON public.event_templates TO authenticated;

ALTER POLICY events_admin ON public.events TO authenticated;
ALTER POLICY events_read ON public.events TO authenticated;

ALTER POLICY incidents_create ON public.incidents TO authenticated;
ALTER POLICY incidents_manage ON public.incidents TO authenticated;
ALTER POLICY incidents_read ON public.incidents TO authenticated;

ALTER POLICY responsible_admin ON public.responsible_assignments TO authenticated;
ALTER POLICY responsible_read ON public.responsible_assignments TO authenticated;

ALTER POLICY shifts_admin ON public.shifts TO authenticated;
ALTER POLICY shifts_read ON public.shifts TO authenticated;

ALTER POLICY audit_admin ON public.upt_audit_logs TO authenticated;

ALTER POLICY transitions_read ON public.workplace_transitions TO authenticated;

ALTER POLICY workplaces_admin ON public.workplaces TO authenticated;
ALTER POLICY workplaces_read ON public.workplaces TO authenticated;

REVOKE ALL ON FUNCTION public.upt_version_briefing() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upt_version_briefing() TO postgres, service_role;
