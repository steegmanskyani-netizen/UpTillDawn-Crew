-- Controlled online URGENT incident creation with optional private photo.
-- Text-only incidents can continue using the idempotent offline sync queue.

CREATE OR REPLACE FUNCTION public.upt_create_incident(
  p_event uuid,
  p_workplace uuid,
  p_message text,
  p_photo_path text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_accuracy_m numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_message text := trim(coalesce(p_message, ''));
  v_photo text := NULLIF(trim(coalesce(p_photo_path, '')), '');
  v_incident uuid;
  v_mime text;
BEGIN
  IF NOT public.upt_is_approved() THEN
    RAISE EXCEPTION 'ACCOUNT NOT APPROVED';
  END IF;

  IF length(v_message) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'Ongeldige melding.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.event_members em
    WHERE em.event_id = p_event AND em.user_id = v_actor
  ) THEN
    RAISE EXCEPTION 'Geen toegang tot event.';
  END IF;

  IF p_workplace IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.event_id = p_event
      AND s.workplace_id = p_workplace
      AND s.user_id = v_actor
      AND s.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Geen toegang tot werkplek.';
  END IF;

  IF v_photo IS NOT NULL THEN
    IF split_part(v_photo, '/', 1) <> v_actor::text THEN
      RAISE EXCEPTION 'Ongeldig fotopad.';
    END IF;

    SELECT o.metadata->>'mimetype'
    INTO v_mime
    FROM storage.objects o
    WHERE o.bucket_id = 'incident-photos'
      AND o.name = v_photo;

    IF v_mime IS NULL OR v_mime NOT IN ('image/jpeg','image/png','image/webp') THEN
      RAISE EXCEPTION 'Ongeldige incidentfoto.';
    END IF;
  END IF;

  IF (p_latitude IS NULL) <> (p_longitude IS NULL) THEN
    RAISE EXCEPTION 'Onvolledige GPS-coördinaten.';
  END IF;
  IF p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90 OR p_longitude < -180 OR p_longitude > 180) THEN
    RAISE EXCEPTION 'Ongeldige GPS-coördinaten.';
  END IF;
  IF p_accuracy_m IS NOT NULL AND p_accuracy_m < 0 THEN
    RAISE EXCEPTION 'Ongeldige GPS-nauwkeurigheid.';
  END IF;

  INSERT INTO public.incidents(
    user_id,
    reporter_id,
    event_id,
    workplace_id,
    message,
    description,
    photo_path,
    latitude,
    longitude,
    gps_accuracy_m
  )
  VALUES (
    v_actor,
    v_actor,
    p_event,
    p_workplace,
    v_message,
    v_message,
    v_photo,
    p_latitude,
    p_longitude,
    p_accuracy_m
  )
  RETURNING id INTO v_incident;

  INSERT INTO public.crew_notifications(user_id,title,body,kind)
  SELECT DISTINCT p.id, 'URGENT', v_incident::text, 'incident'
  FROM public.profiles p
  WHERE p.approved
    AND (
      p.role = 'admin'
      OR EXISTS (
        SELECT 1
        FROM public.responsible_assignments r
        WHERE r.user_id = p.id
          AND r.event_id = p_event
          AND (p_workplace IS NULL OR r.workplace_id = p_workplace)
      )
    );

  INSERT INTO public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES (
    v_actor,
    'URGENT',
    'incidents',
    v_incident,
    jsonb_build_object(
      'has_photo', v_photo IS NOT NULL,
      'has_gps', p_latitude IS NOT NULL,
      'gps_accuracy_m', p_accuracy_m
    )
  );

  RETURN v_incident;
END;
$$;

REVOKE ALL ON FUNCTION public.upt_create_incident(uuid,uuid,text,text,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upt_create_incident(uuid,uuid,text,text,numeric,numeric,numeric) TO authenticated;
