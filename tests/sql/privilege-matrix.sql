-- Public API privilege/RLS regression matrix.
-- Read-only assertions only.

DO $$
DECLARE
  v_missing_rls text;
  v_anon_tables text;
  v_public_policies text;
  v_anon_rpcs text;
  v_executable_triggers text;
BEGIN
  SELECT string_agg(format('%I.%I', n.nspname, c.relname), ', ')
  INTO v_missing_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relkind='r'
    AND NOT c.relrowsecurity;

  IF v_missing_rls IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL public tables without RLS: %', v_missing_rls;
  END IF;

  SELECT string_agg(table_name||':'||privilege_type, ', ' ORDER BY table_name, privilege_type)
  INTO v_anon_tables
  FROM information_schema.role_table_grants
  WHERE table_schema='public'
    AND grantee='anon';

  IF v_anon_tables IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL anonymous public-table grants: %', v_anon_tables;
  END IF;

  SELECT string_agg(tablename||':'||policyname, ', ' ORDER BY tablename, policyname)
  INTO v_public_policies
  FROM pg_policies
  WHERE schemaname='public'
    AND 'public'=ANY(roles);

  IF v_public_policies IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL RLS policies still granted to PUBLIC: %', v_public_policies;
  END IF;

  SELECT string_agg(routine_name, ', ' ORDER BY routine_name)
  INTO v_anon_rpcs
  FROM information_schema.role_routine_grants
  WHERE routine_schema='public'
    AND grantee='anon'
    AND routine_name LIKE 'upt_%';

  IF v_anon_rpcs IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL anonymous Uptilldawn RPC execute grants: %', v_anon_rpcs;
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
  INTO v_executable_triggers
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.prorettype='trigger'::regtype
    AND (
      has_function_privilege('public',p.oid,'EXECUTE')
      OR has_function_privilege('anon',p.oid,'EXECUTE')
      OR has_function_privilege('authenticated',p.oid,'EXECUTE')
    );

  IF v_executable_triggers IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL directly executable trigger functions: %', v_executable_triggers;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema='public'
      AND grantee='authenticated'
      AND privilege_type IN ('INSERT','UPDATE','DELETE')
      AND table_name = ANY(ARRAY[
        'break_sessions','chat_channels','chat_members','crew_notifications',
        'event_templates','shifts','tasks','upt_audit_logs',
        'work_sessions','workplace_transitions'
      ])
  ) THEN
    RAISE EXCEPTION 'FAIL direct mutation grant remains on an RPC-only table';
  END IF;
END $;

SELECT 'PASS: public RLS/anon surface is locked down, trigger functions are non-callable and RPC-only tables have no direct mutation grants' AS result;
