-- Security-definer surface regression.
-- Public SECURITY DEFINER RPCs are intentionally used for validated workflows,
-- but they must never be anonymous/PUBLIC callable and must pin search_path.

BEGIN;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('public', p.oid, 'EXECUTE')
    );

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: % public SECURITY DEFINER function(s) are executable by anon/PUBLIC', v_count;
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
  ) THEN
    RAISE EXCEPTION 'FAIL: authenticated Uptilldawn SECURITY DEFINER entry point lacks an explicit authorization primitive';
  END IF;
END $$;

SELECT 'PASS: SECURITY DEFINER surface is authenticated-only, search_path-pinned and authorization-guarded' AS result;
ROLLBACK;
