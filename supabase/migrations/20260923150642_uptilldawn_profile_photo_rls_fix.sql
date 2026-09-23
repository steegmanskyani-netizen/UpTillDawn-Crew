-- Allow approved crew to read permanent profile photos exposed by the safe crew directory.
-- The previous storage policy queried profiles directly and therefore inherited profile RLS,
-- which hid every other user's row from ordinary crew.

CREATE OR REPLACE FUNCTION public.upt_can_read_profile_photo(p_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.upt_is_approved() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.approved = true
      AND p.profile_photo_url = p_path
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upt_can_read_profile_photo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upt_can_read_profile_photo(text) TO authenticated;

DROP POLICY IF EXISTS "upt_profile_photos_read" ON storage.objects;
CREATE POLICY "upt_profile_photos_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND public.upt_is_approved()
  AND (
    split_part(name, '/', 1) = auth.uid()::text
    OR public.upt_is_admin(auth.uid())
    OR public.upt_can_read_profile_photo(name)
  )
);
