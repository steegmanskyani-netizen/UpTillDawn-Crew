-- Complete self-service personnel details while keeping sensitive fields private from ordinary SELECTs.
-- Adds scoped profile-photo access for responsible leads and an admin-only personnel view.

CREATE OR REPLACE FUNCTION public.upt_own_profile_details()
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  home_address text,
  phone_number text,
  date_of_birth date,
  national_register_number text,
  iban text,
  profile_photo_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Aanmelden vereist.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    p.full_name,
    p.home_address,
    p.phone_number,
    p.date_of_birth,
    p.national_register_number,
    p.iban,
    p.profile_photo_url
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.upt_update_own_profile(
  p_full_name text,
  p_home_address text DEFAULT NULL,
  p_phone_number text DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL,
  p_national_register_number text DEFAULT NULL,
  p_iban text DEFAULT NULL,
  p_profile_photo_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_iban text := NULLIF(upper(regexp_replace(coalesce(p_iban, ''), '\s+', '', 'g')), '');
  v_address text := NULLIF(trim(coalesce(p_home_address, '')), '');
  v_phone text := NULLIF(trim(coalesce(p_phone_number, '')), '');
  v_nrn text := NULLIF(trim(coalesce(p_national_register_number, '')), '');
  v_photo text := NULLIF(trim(coalesce(p_profile_photo_path, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Aanmelden vereist.';
  END IF;

  IF p_full_name IS NULL OR length(trim(p_full_name)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Ongeldige naam.';
  END IF;
  IF v_address IS NOT NULL AND length(v_address) > 500 THEN
    RAISE EXCEPTION 'Adres is te lang.';
  END IF;
  IF v_phone IS NOT NULL AND length(v_phone) > 40 THEN
    RAISE EXCEPTION 'Telefoonnummer is te lang.';
  END IF;
  IF v_nrn IS NOT NULL AND length(v_nrn) > 32 THEN
    RAISE EXCEPTION 'Rijksregisternummer is te lang.';
  END IF;
  IF v_iban IS NOT NULL AND length(v_iban) NOT BETWEEN 15 AND 34 THEN
    RAISE EXCEPTION 'Ongeldige IBAN-lengte.';
  END IF;
  IF p_date_of_birth IS NOT NULL AND
     (p_date_of_birth > current_date OR p_date_of_birth < current_date - interval '120 years') THEN
    RAISE EXCEPTION 'Ongeldige geboortedatum.';
  END IF;

  IF v_photo IS NOT NULL THEN
    IF split_part(v_photo, '/', 1) <> v_uid::text THEN
      RAISE EXCEPTION 'Ongeldig fotopad.';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM storage.objects o
      WHERE o.bucket_id = 'profile-photos'
        AND o.name = v_photo
    ) THEN
      RAISE EXCEPTION 'Profielfoto bestaat niet.';
    END IF;
  END IF;

  UPDATE public.profiles
  SET full_name = trim(p_full_name),
      home_address = v_address,
      phone_number = v_phone,
      date_of_birth = p_date_of_birth,
      national_register_number = v_nrn,
      iban = v_iban,
      profile_photo_url = v_photo,
      updated_at = now()
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profiel niet gevonden.';
  END IF;

  INSERT INTO public.upt_audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_uid, 'PROFILE_UPDATED', 'profile', v_uid, jsonb_build_object('self_service', true));
END;
$$;

CREATE OR REPLACE FUNCTION public.upt_admin_personnel_details()
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  home_address text,
  phone_number text,
  date_of_birth date,
  national_register_number text,
  iban text,
  profile_photo_url text,
  approved boolean,
  role text,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.upt_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Geen toegang.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    u.email::text,
    p.full_name,
    p.home_address,
    p.phone_number,
    p.date_of_birth,
    p.national_register_number,
    p.iban,
    p.profile_photo_url,
    p.approved,
    p.role,
    p.updated_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY p.full_name NULLS LAST, u.email;
END;
$$;

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
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.shifts s ON s.user_id = p.id
      WHERE p.profile_photo_url = name
        AND s.status <> 'cancelled'
        AND public.upt_is_responsible(s.event_id, s.workplace_id, auth.uid())
    )
  )
);

REVOKE ALL ON FUNCTION public.upt_own_profile_details() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upt_update_own_profile(text,text,text,date,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upt_admin_personnel_details() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.upt_own_profile_details() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upt_update_own_profile(text,text,text,date,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upt_admin_personnel_details() TO authenticated;
