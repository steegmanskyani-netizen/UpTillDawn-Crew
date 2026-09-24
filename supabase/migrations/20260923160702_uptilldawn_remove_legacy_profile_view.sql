-- Remove the retired StaffPortal compatibility view.
-- The active Uptilldawn application and RPCs use public.profiles directly.
-- The view had no anon/authenticated grants and no function dependencies.

DROP VIEW IF EXISTS public.user_profiles;
