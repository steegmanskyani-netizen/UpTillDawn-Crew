-- Security-definer surface regression.
-- Public SECURITY DEFINER RPCs are intentionally used for validated workflows,
-- but they must never be anonymous/PUBLIC callable and must pin search_path.

BEGIN;

DO $surface$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND has_function_privilege('public', p.oid, 'EXECUTE');

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: % public SECURITY DEFINER function(s) are executable by PUBLIC', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND p.proname <> ALL(ARRAY[
      'upt_god_data_catalog','upt_god_data_mutate','upt_god_data_rows',
      'upt_god_database_connect','upt_god_database_disconnect','upt_god_database_secret',
      'upt_god_login','upt_god_logout',
      'upt_god_repository_connect','upt_god_repository_disconnect','upt_god_repository_secret',
      'upt_god_role_rules','upt_god_save_role_rules','upt_god_session_valid',
      'upt_info_admin_bootstrap_open'
    ]);

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: % unexpected SECURITY DEFINER function(s) are executable by anon', v_count;
  END IF;

  IF EXISTS(
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.prosecdef
      AND has_function_privilege('anon',p.oid,'EXECUTE')
      AND p.proname LIKE 'upt_god_%'
      AND p.proname NOT IN ('upt_god_login','upt_god_logout')
      AND position('god_session_valid' in pg_get_functiondef(p.oid))=0
  ) THEN
    RAISE EXCEPTION 'FAIL: anonymous God Mode RPC lacks token-session validation';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(coalesce(p.proconfig, '{}'::text[])) setting
      WHERE setting LIKE 'search_path=%'
    );

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: % authenticated SECURITY DEFINER function(s) do not pin search_path', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND p.proname LIKE 'upt_%'
      AND position('auth.uid()' in pg_get_functiondef(p.oid)) = 0
      AND position('upt_is_approved' in pg_get_functiondef(p.oid)) = 0
      AND position('upt_is_admin' in pg_get_functiondef(p.oid)) = 0
      AND position('god_session_valid' in pg_get_functiondef(p.oid)) = 0
      AND p.proname NOT IN ('upt_god_login','upt_god_logout','upt_info_admin_bootstrap_open')
  ) THEN
    RAISE EXCEPTION 'FAIL: authenticated Uptilldawn SECURITY DEFINER entry point lacks an explicit authorization primitive';
  END IF;
END
$surface$;

DO $god_gate$
BEGIN
  IF has_table_privilege('authenticated','upt_private.god_mode_config','SELECT')
     OR has_table_privilege('authenticated','upt_private.god_mode_sessions','SELECT')
     OR has_table_privilege('authenticated','upt_private.god_mode_attempts','SELECT')
     OR has_table_privilege('anon','upt_private.god_mode_config','SELECT')
     OR has_table_privilege('anon','upt_private.god_mode_sessions','SELECT')
     OR has_table_privilege('anon','upt_private.god_mode_attempts','SELECT') THEN
    RAISE EXCEPTION 'FAIL: browser roles can read private God Mode state';
  END IF;

  IF has_function_privilege('anon','public.upt_god_is_configured()','EXECUTE')
     OR has_function_privilege('anon','public.upt_god_set_credentials(text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anonymous caller can access owner-only God Mode setup RPC';
  END IF;

  IF NOT has_function_privilege('authenticated','public.upt_god_is_configured()','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.upt_god_set_credentials(text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: owner configuration RPC is unavailable to authenticated owner sessions';
  END IF;

  IF position(
       'is_app_owner'
       in pg_get_functiondef('public.upt_god_is_configured()'::regprocedure)
     )=0
     OR position(
       'is_app_owner'
       in pg_get_functiondef('public.upt_god_set_credentials(text,text)'::regprocedure)
     )=0 THEN
    RAISE EXCEPTION 'FAIL: God Mode configuration RPC lacks immutable owner guard';
  END IF;
END
$god_gate$;

SELECT 'PASS: SECURITY DEFINER surface, token-gated God Mode and owner-only private setup are locked down' AS result;
ROLLBACK;
