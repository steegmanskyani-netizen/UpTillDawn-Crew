-- Make the global approval gate restrictive so it is ANDed with table-specific
-- authorization policies instead of accidentally granting every approved user
-- every operation allowed by the table grants.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_policies
    WHERE schemaname = 'public' AND policyname = 'upt_approved_gate'
  LOOP
    EXECUTE format('DROP POLICY upt_approved_gate ON public.%I', r.tablename);
    EXECUTE format(
      'CREATE POLICY upt_approved_gate ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.upt_is_approved()) WITH CHECK (public.upt_is_approved())',
      r.tablename
    );
  END LOOP;
END $$;
