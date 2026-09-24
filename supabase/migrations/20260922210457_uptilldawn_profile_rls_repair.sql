-- Repair recursive profile policies without changing existing accounts.
DROP POLICY IF EXISTS "Users can view their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles." ON public.profiles;
CREATE POLICY profiles_self_or_admin_read ON public.profiles FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()) OR public.upt_is_admin());
CREATE POLICY profiles_self_or_admin_update ON public.profiles FOR UPDATE TO authenticated
USING (id = (SELECT auth.uid()) OR public.upt_is_admin())
WITH CHECK (id = (SELECT auth.uid()) OR public.upt_is_admin());
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.profiles FROM authenticated;
-- RLS does not govern TRUNCATE. No browser role needs this grant on any table.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
-- The legacy view joins auth.users; clients now use profiles, never this view.
REVOKE ALL ON TABLE public.user_profiles FROM anon, authenticated;
