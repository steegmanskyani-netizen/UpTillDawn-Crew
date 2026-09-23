-- Responsible leads may manage scheduling and tasks only for workplaces assigned to them.
-- Returned crew-directory fields deliberately exclude sensitive personnel data.

CREATE OR REPLACE FUNCTION public.upt_responsible_event_members(
  p_event uuid,
  p_workplace uuid
)
RETURNS TABLE(
  id uuid,
  full_name text,
  phone_number text,
  profile_photo_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.upt_is_approved() THEN
    RAISE EXCEPTION 'ACCOUNT NOT APPROVED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workplaces w
    WHERE w.id = p_workplace AND w.event_id = p_event
  ) THEN
    RAISE EXCEPTION 'Werkplek niet gevonden.';
  END IF;

  IF NOT (public.upt_is_admin(auth.uid()) OR public.upt_is_responsible(p_event, p_workplace, auth.uid())) THEN
    RAISE EXCEPTION 'Geen toegang.';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.phone_number, p.profile_photo_url
  FROM public.event_members em
  JOIN public.profiles p ON p.id = em.user_id
  WHERE em.event_id = p_event
    AND p.approved = true
  ORDER BY p.full_name NULLS LAST, p.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upt_create_shift(
  p_workplace uuid,
  p_user uuid,
  p_role_name text,
  p_start timestamptz,
  p_end timestamptz,
  p_overlap_allowed boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_event uuid;
  v_shift uuid;
BEGIN
  IF NOT public.upt_is_approved() THEN
    RAISE EXCEPTION 'ACCOUNT NOT APPROVED';
  END IF;

  SELECT w.event_id INTO v_event
  FROM public.workplaces w
  WHERE w.id = p_workplace AND w.is_active = true;

  IF v_event IS NULL THEN
    RAISE EXCEPTION 'Actieve werkplek niet gevonden.';
  END IF;

  IF NOT (public.upt_is_admin(v_actor) OR public.upt_is_responsible(v_event, p_workplace, v_actor)) THEN
    RAISE EXCEPTION 'Geen toegang.';
  END IF;

  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RAISE EXCEPTION 'Ongeldige shiftperiode.';
  END IF;

  IF p_role_name IS NULL OR length(trim(p_role_name)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Ongeldige rol.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.event_members em
    JOIN public.profiles p ON p.id = em.user_id
    WHERE em.event_id = v_event
      AND em.user_id = p_user
      AND p.approved = true
  ) THEN
    RAISE EXCEPTION 'Goedgekeurd eventlid vereist.';
  END IF;

  IF NOT coalesce(p_overlap_allowed, false) AND EXISTS (
    SELECT 1
    FROM public.shifts s
    WHERE s.user_id = p_user
      AND s.status <> 'cancelled'
      AND s.scheduled_start < p_end
      AND s.scheduled_end > p_start
  ) THEN
    RAISE EXCEPTION 'Shift overlapt met een bestaande shift.';
  END IF;

  INSERT INTO public.shifts(
    event_id,
    workplace_id,
    user_id,
    role_name,
    scheduled_start,
    scheduled_end,
    start_time,
    end_time,
    overlap_allowed,
    status
  )
  VALUES (
    v_event,
    p_workplace,
    p_user,
    trim(p_role_name),
    p_start,
    p_end,
    p_start,
    p_end,
    coalesce(p_overlap_allowed, false),
    'scheduled'
  )
  RETURNING id INTO v_shift;

  RETURN v_shift;
END;
$$;

CREATE OR REPLACE FUNCTION public.upt_update_shift(
  p_shift uuid,
  p_role_name text,
  p_start timestamptz,
  p_end timestamptz,
  p_overlap_allowed boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_shift public.shifts%ROWTYPE;
BEGIN
  IF NOT public.upt_is_approved() THEN
    RAISE EXCEPTION 'ACCOUNT NOT APPROVED';
  END IF;

  SELECT * INTO v_shift
  FROM public.shifts
  WHERE id = p_shift
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift niet gevonden.';
  END IF;

  IF NOT (public.upt_is_admin(v_actor) OR public.upt_is_responsible(v_shift.event_id, v_shift.workplace_id, v_actor)) THEN
    RAISE EXCEPTION 'Geen toegang.';
  END IF;

  IF v_shift.status = 'cancelled' THEN
    RAISE EXCEPTION 'Geannuleerde shift kan niet worden gewijzigd.';
  END IF;

  IF p_start IS NULL OR p_end IS NULL OR p_end <= p_start THEN
    RAISE EXCEPTION 'Ongeldige shiftperiode.';
  END IF;

  IF p_role_name IS NULL OR length(trim(p_role_name)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Ongeldige rol.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.work_sessions ws
    WHERE ws.shift_id = p_shift AND ws.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Actieve werktijd verhindert shiftwijziging.';
  END IF;

  IF NOT coalesce(p_overlap_allowed, false) AND EXISTS (
    SELECT 1
    FROM public.shifts s
    WHERE s.id <> p_shift
      AND s.user_id = v_shift.user_id
      AND s.status <> 'cancelled'
      AND s.scheduled_start < p_end
      AND s.scheduled_end > p_start
  ) THEN
    RAISE EXCEPTION 'Shift overlapt met een bestaande shift.';
  END IF;

  UPDATE public.shifts
  SET role_name = trim(p_role_name),
      scheduled_start = p_start,
      scheduled_end = p_end,
      start_time = p_start,
      end_time = p_end,
      overlap_allowed = coalesce(p_overlap_allowed, false),
      updated_at = now()
  WHERE id = p_shift;
END;
$$;

CREATE OR REPLACE FUNCTION public.upt_cancel_shift(
  p_shift uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_shift public.shifts%ROWTYPE;
  v_reason text := NULLIF(trim(coalesce(p_reason, '')), '');
BEGIN
  IF NOT public.upt_is_approved() THEN
    RAISE EXCEPTION 'ACCOUNT NOT APPROVED';
  END IF;

  SELECT * INTO v_shift
  FROM public.shifts
  WHERE id = p_shift
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift niet gevonden.';
  END IF;

  IF NOT (public.upt_is_admin(v_actor) OR public.upt_is_responsible(v_shift.event_id, v_shift.workplace_id, v_actor)) THEN
    RAISE EXCEPTION 'Geen toegang.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.work_sessions ws
    WHERE ws.shift_id = p_shift AND ws.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Actieve werktijd verhindert annulering.';
  END IF;

  UPDATE public.shifts
  SET status = 'cancelled',
      notes = CASE
        WHEN v_reason IS NULL THEN notes
        WHEN notes IS NULL OR trim(notes) = '' THEN 'Geannuleerd: ' || left(v_reason, 500)
        ELSE notes || E'\nGeannuleerd: ' || left(v_reason, 500)
      END,
      updated_at = now()
  WHERE id = p_shift;
END;
$$;

REVOKE ALL ON FUNCTION public.upt_responsible_event_members(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upt_create_shift(uuid,uuid,text,timestamptz,timestamptz,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upt_update_shift(uuid,text,timestamptz,timestamptz,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upt_cancel_shift(uuid,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.upt_responsible_event_members(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upt_create_shift(uuid,uuid,text,timestamptz,timestamptz,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upt_update_shift(uuid,text,timestamptz,timestamptz,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upt_cancel_shift(uuid,text) TO authenticated;
