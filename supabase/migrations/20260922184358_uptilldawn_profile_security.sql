-- UPTILLDAWN profile security
-- Protect privileged profile fields and expose only limited crew contact data.

-- ============================================================
-- PROTECT PRIVILEGED PROFILE FIELDS
-- ============================================================

CREATE OR REPLACE FUNCTION public.upt_protect_profile_security_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service/database operations without a logged-in user are allowed.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins may manage approval and role.
  IF public.upt_is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- A normal user may only update their own profile.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR OLD.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this profile';
  END IF;

  -- Users may never promote/approve themselves.
  IF NEW.approved IS DISTINCT FROM OLD.approved THEN
    RAISE EXCEPTION 'Only an administrator can change approval status';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Only an administrator can change account role';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS upt_protect_profile_security_fields
ON public.profiles;

CREATE TRIGGER upt_protect_profile_security_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.upt_protect_profile_security_fields();

-- ============================================================
-- RESPONSIBLE LEAD SAFE CREW DIRECTORY
-- ============================================================

CREATE OR REPLACE FUNCTION public.upt_responsible_crew_directory(
  event_uuid UUID,
  workplace_uuid UUID
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  phone_number TEXT,
  profile_photo_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    p.id,
    p.full_name,
    p.phone_number,
    p.profile_photo_url
  FROM public.profiles p
  JOIN public.shifts s
    ON s.user_id = p.id
  WHERE s.event_id = event_uuid
    AND s.workplace_id = workplace_uuid
    AND p.approved = true
    AND (
      public.upt_is_admin(auth.uid())
      OR public.upt_is_responsible(
        event_uuid,
        workplace_uuid,
        auth.uid()
      )
    );
$$;

REVOKE ALL
ON FUNCTION public.upt_responsible_crew_directory(UUID, UUID)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.upt_responsible_crew_directory(UUID, UUID)
TO authenticated;

