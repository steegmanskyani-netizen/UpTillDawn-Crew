-- Uptilldawn function permission cleanup
-- prevent_shift_overlap is a trigger function and must not be
-- directly executable by application users.

REVOKE ALL ON FUNCTION public.prevent_shift_overlap()
FROM PUBLIC;

REVOKE ALL ON FUNCTION public.prevent_shift_overlap()
FROM anon;

REVOKE ALL ON FUNCTION public.prevent_shift_overlap()
FROM authenticated;

-- Keep database-owner/service access.
GRANT EXECUTE ON FUNCTION public.prevent_shift_overlap()
TO postgres;

GRANT EXECUTE ON FUNCTION public.prevent_shift_overlap()
TO service_role;

