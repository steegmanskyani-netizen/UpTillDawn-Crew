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
END
$surface$;

DO $edit_gate$
DECLARE
  v_policy_count integer;
BEGIN
  IF has_table_privilege('authenticated','upt_private.admin_edit_unlocks','SELECT')
     OR has_table_privilege('authenticated','upt_private.admin_edit_attempts','SELECT') THEN
    RAISE EXCEPTION 'FAIL: authenticated can read private Edit-mode gate state';
  END IF;

  IF has_function_privilege('anon','public.upt_has_admin_edit_unlock()','EXECUTE')
     OR has_function_privilege('anon','public.upt_revoke_admin_edit_unlock()','EXECUTE')
     OR has_function_privilege('anon','public.upt_verify_admin_edit_code(text)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: anonymous caller can access Edit-mode gate RPC';
  END IF;

  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename='role_ui_rules'
    AND policyname IN (
      'role_ui_rules_admin_insert',
      'role_ui_rules_admin_update',
      'role_ui_rules_admin_delete'
    )
    AND coalesce(qual,'')||' '||coalesce(with_check,'') LIKE '%upt_has_admin_edit_unlock%';

  IF v_policy_count <> 3 THEN
    RAISE EXCEPTION 'FAIL: Edit-mode unlock is not enforced on all role_ui_rules write policies';
  END IF;
END
$edit_gate$;

SELECT 'PASS: SECURITY DEFINER surface, Edit-mode gate and private state are locked down' AS result;
ROLLBACK;
