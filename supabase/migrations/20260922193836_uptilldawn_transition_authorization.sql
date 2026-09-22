-- Uptilldawn workplace transition authorization
-- A crew member may only transition to a workplace for which
-- they have a valid, non-cancelled assigned shift in the same event.

CREATE OR REPLACE FUNCTION public.upt_confirm_workplace_transition(
  p_work_session UUID,
  p_to_workplace UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  transition_id UUID;
  session_event UUID;
  session_user UUID;
  current_workplace UUID;
  destination_event UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Lock and verify the active work session.
  SELECT
    ws.event_id,
    ws.user_id
  INTO
    session_event,
    session_user
  FROM public.work_sessions ws
  WHERE ws.id = p_work_session
    AND ws.user_id = auth.uid()
    AND ws.ended_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active work session';
  END IF;

  -- Destination workplace must exist.
  SELECT w.event_id
  INTO destination_event
  FROM public.workplaces w
  WHERE w.id = p_to_workplace;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Destination workplace not found';
  END IF;

  -- Destination must belong to the same event.
  IF destination_event <> session_event THEN
    RAISE EXCEPTION 'Workplace belongs to another event';
  END IF;

  -- Crew member must actually have a valid shift for
  -- the destination workplace.
  IF NOT EXISTS (
    SELECT 1
    FROM public.shifts s
    WHERE s.event_id = session_event
      AND s.user_id = auth.uid()
      AND s.workplace_id = p_to_workplace
      AND s.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'No valid shift for destination workplace';
  END IF;

  -- Determine current workplace:
  -- latest confirmed transition first.
  SELECT wt.to_workplace_id
  INTO current_workplace
  FROM public.workplace_transitions wt
  WHERE wt.work_session_id = p_work_session
  ORDER BY wt.confirmed_at DESC
  LIMIT 1;

  -- If there has been no transition yet, use the workplace
  -- from the shift that started this work session.
  IF current_workplace IS NULL THEN
    SELECT s.workplace_id
    INTO current_workplace
    FROM public.work_sessions ws
    JOIN public.shifts s
      ON s.id = ws.shift_id
    WHERE ws.id = p_work_session;
  END IF;

  IF current_workplace IS NULL THEN
    RAISE EXCEPTION 'Current workplace could not be determined';
  END IF;

  IF current_workplace = p_to_workplace THEN
    RAISE EXCEPTION 'Already working at this workplace';
  END IF;

  INSERT INTO public.workplace_transitions (
    work_session_id,
    user_id,
    from_workplace_id,
    to_workplace_id,
    transitioned_at,
    confirmed_at
  )
  VALUES (
    p_work_session,
    auth.uid(),
    current_workplace,
    p_to_workplace,
    now(),
    now()
  )
  RETURNING id INTO transition_id;

  INSERT INTO public.upt_audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    auth.uid(),
    'WORKPLACE_TRANSITION',
    'workplace_transition',
    transition_id,
    jsonb_build_object(
      'work_session_id', p_work_session,
      'event_id', session_event,
      'from_workplace_id', current_workplace,
      'to_workplace_id', p_to_workplace
    )
  );

  RETURN transition_id;
END;
$$;

REVOKE ALL ON FUNCTION
public.upt_confirm_workplace_transition(UUID, UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
public.upt_confirm_workplace_transition(UUID, UUID)
TO authenticated;

