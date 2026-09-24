-- UPTILLDAWN function permission hardening
-- Remove unnecessary PUBLIC/anon execution rights.

-- ============================================================
-- TRIGGER FUNCTIONS
-- These are invoked by PostgreSQL triggers, not directly by clients.
-- ============================================================

REVOKE ALL ON FUNCTION public.handle_check_in_approval() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.handle_check_in_approval() FROM anon;

REVOKE ALL ON FUNCTION public.handle_check_in_approval() FROM authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

REVOKE ALL ON FUNCTION public.upt_protect_profile_security_fields() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upt_protect_profile_security_fields() FROM anon;

REVOKE ALL ON FUNCTION public.upt_protect_profile_security_fields() FROM authenticated;

-- ============================================================
-- AUTHORIZATION HELPERS
-- Required internally by RLS/policies and authenticated operations.
-- ============================================================

REVOKE ALL ON FUNCTION public.upt_is_admin(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upt_is_admin(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.upt_is_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.upt_is_responsible(uuid, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upt_is_responsible(uuid, uuid, uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.upt_is_responsible(uuid, uuid, uuid) TO authenticated;

-- ============================================================
-- RESPONSIBLE CREW DIRECTORY
-- ============================================================

REVOKE ALL ON FUNCTION public.upt_responsible_crew_directory(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upt_responsible_crew_directory(uuid, uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.upt_responsible_crew_directory(uuid, uuid)
TO authenticated;

-- ============================================================
-- SERVER-AUTHORITATIVE TIME TRACKING RPCs
-- Logged-in users only.
-- Authorization is additionally checked inside each function.
-- ============================================================

REVOKE ALL ON FUNCTION public.upt_start_work(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upt_start_work(uuid, uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.upt_start_work(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.upt_start_break(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upt_start_break(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.upt_start_break(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.upt_stop_break(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upt_stop_break(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.upt_stop_break(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.upt_stop_work(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.upt_stop_work(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.upt_stop_work(uuid) TO authenticated;

