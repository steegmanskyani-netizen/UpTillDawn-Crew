-- Database role-integrity regression.
DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_constraintdef(oid)
  INTO v_definition
  FROM pg_constraint
  WHERE conrelid='public.profiles'::regclass
    AND conname='profiles_role_check';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'FAIL profiles_role_check missing';
  END IF;

  IF v_definition NOT LIKE '%staff%'
     OR v_definition NOT LIKE '%responsible_lead%'
     OR v_definition NOT LIKE '%admin%' THEN
    RAISE EXCEPTION 'FAIL profiles_role_check has unexpected definition: %', v_definition;
  END IF;
END $$;

SELECT 'PASS: profiles.role is constrained to staff/responsible_lead/admin' AS result;
