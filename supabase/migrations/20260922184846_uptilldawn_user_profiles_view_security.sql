-- UPTILLDAWN user_profiles view security
-- Ensure the view respects the permissions/RLS of the calling user.

ALTER VIEW public.user_profiles
SET (security_invoker = true);

-- Do not expose this view anonymously.
REVOKE ALL ON public.user_profiles FROM anon;

-- Authenticated users may query the view.
-- Under security_invoker, profiles RLS still determines which profile
-- rows they are allowed to access.
GRANT SELECT ON public.user_profiles TO authenticated;

