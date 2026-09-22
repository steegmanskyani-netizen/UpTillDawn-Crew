-- UPTILLDAWN operational RLS hardening

-- ============================================================
-- CHAT MEMBERS
-- Users may see their own memberships.
-- Admin may see/manage all memberships.
-- Membership creation/removal for normal users stays blocked.
-- ============================================================

DROP POLICY IF EXISTS "chat_members_read" ON public.chat_members;

DROP POLICY IF EXISTS "chat_members_admin" ON public.chat_members;

CREATE POLICY "chat_members_read"
ON public.chat_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.upt_is_admin(auth.uid())
);

CREATE POLICY "chat_members_admin"
ON public.chat_members
FOR ALL
TO authenticated
USING (
  public.upt_is_admin(auth.uid())
)
WITH CHECK (
  public.upt_is_admin(auth.uid())
);

-- ============================================================
-- MESSAGE ATTACHMENTS
-- An attachment record may only be created for a message
-- actually sent by the logged-in user.
-- ============================================================

DROP POLICY IF EXISTS "message_attachments_insert"
ON public.message_attachments;

CREATE POLICY "message_attachments_insert"
ON public.message_attachments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = message_attachments.message_id
      AND m.sender_id = auth.uid()
  )
);

-- ============================================================
-- WORKPLACE TRANSITIONS
-- Direct client INSERT is intentionally NOT granted.
--
-- Transitions must use the RPC below so transitioned_at and
-- confirmed_at are authoritative server timestamps.
-- ============================================================

DROP POLICY IF EXISTS "transitions_insert"
ON public.workplace_transitions;

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
  current_workplace UUID;
  session_event UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Session must belong to the logged-in user and still be active.
  SELECT
    ws.event_id
  INTO
    session_event
  FROM public.work_sessions ws
  WHERE ws.id = p_work_session
    AND ws.user_id = auth.uid()
    AND ws.ended_at IS NULL;

  IF session_event IS NULL THEN
    RAISE EXCEPTION 'No active work session';
  END IF;

  -- Destination workplace must belong to the same event.
  IF NOT EXISTS (
    SELECT 1
    FROM public.workplaces w
    WHERE w.id = p_to_workplace
      AND w.event_id = session_event
  ) THEN
    RAISE EXCEPTION 'Invalid destination workplace';
  END IF;

  -- Determine current workplace from latest transition first,
  -- otherwise from the shift linked to the work session.
  SELECT wt.to_workplace_id
  INTO current_workplace
  FROM public.workplace_transitions wt
  WHERE wt.work_session_id = p_work_session
  ORDER BY wt.transitioned_at DESC
  LIMIT 1;

  IF current_workplace IS NULL THEN
    SELECT s.workplace_id
    INTO current_workplace
    FROM public.work_sessions ws
    JOIN public.shifts s ON s.id = ws.shift_id
    WHERE ws.id = p_work_session;
  END IF;

  IF current_workplace IS NOT NULL
     AND current_workplace = p_to_workplace THEN
    RAISE EXCEPTION 'Already at this workplace';
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
    entity_id
  )
  VALUES (
    auth.uid(),
    'WORKPLACE_TRANSITION',
    'workplace_transition',
    transition_id
  );

  RETURN transition_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.upt_confirm_workplace_transition(UUID, UUID)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.upt_confirm_workplace_transition(UUID, UUID)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.upt_confirm_workplace_transition(UUID, UUID)
TO authenticated;

