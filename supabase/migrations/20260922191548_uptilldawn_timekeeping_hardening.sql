-- Uptilldawn timekeeping hardening
-- Server-authoritative work/break timestamps and duplicate-session protection.

-- ============================================================
-- 1. Prevent more than one active work session per user
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS
  work_sessions_one_active_per_user_idx
ON public.work_sessions (user_id)
WHERE ended_at IS NULL;

-- ============================================================
-- 2. Prevent more than one active break per work session
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS
  break_sessions_one_active_per_work_session_idx
ON public.break_sessions (work_session_id)
WHERE ended_at IS NULL;

-- ============================================================
-- 3. START WORK
-- ============================================================

CREATE OR REPLACE FUNCTION public.upt_start_work(
  p_event UUID,
  p_shift UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wid UUID;
  server_now TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.event_members
    WHERE event_id = p_event
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not an event member';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.check_ins
    WHERE event_id = p_event
      AND user_id = auth.uid()
      AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Approved check-in required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.work_sessions
    WHERE user_id = auth.uid()
      AND ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Active work session already exists';
  END IF;

  IF p_shift IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.shifts
       WHERE id = p_shift
         AND event_id = p_event
         AND user_id = auth.uid()
         AND status <> 'cancelled'
     )
  THEN
    RAISE EXCEPTION 'Invalid shift';
  END IF;

  INSERT INTO public.work_sessions (
    event_id,
    user_id,
    shift_id,
    start_time,
    started_at,
    status
  )
  VALUES (
    p_event,
    auth.uid(),
    p_shift,
    server_now,
    server_now,
    'active'
  )
  RETURNING id INTO wid;

  INSERT INTO public.upt_audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    auth.uid(),
    'START_WORK',
    'work_session',
    wid,
    jsonb_build_object(
      'event_id', p_event,
      'shift_id', p_shift,
      'server_timestamp', server_now
    )
  );

  RETURN wid;
END;
$$;

-- ============================================================
-- 4. START BREAK
-- ============================================================

CREATE OR REPLACE FUNCTION public.upt_start_break(
  p_work_session UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bid UUID;
  server_now TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.work_sessions
    WHERE id = p_work_session
      AND user_id = auth.uid()
      AND ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'No active work session';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.break_sessions
    WHERE work_session_id = p_work_session
      AND ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Active break already exists';
  END IF;

  INSERT INTO public.break_sessions (
    work_session_id,
    user_id,
    start_time,
    started_at
  )
  VALUES (
    p_work_session,
    auth.uid(),
    server_now,
    server_now
  )
  RETURNING id INTO bid;

  INSERT INTO public.upt_audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    auth.uid(),
    'START_BREAK',
    'break_session',
    bid,
    jsonb_build_object(
      'work_session_id', p_work_session,
      'server_timestamp', server_now
    )
  );

  RETURN bid;
END;
$$;

-- ============================================================
-- 5. STOP BREAK
-- ============================================================

CREATE OR REPLACE FUNCTION public.upt_stop_break(
  p_break UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  server_now TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.break_sessions
  SET
    end_time = server_now,
    ended_at = server_now
  WHERE id = p_break
    AND user_id = auth.uid()
    AND ended_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active break';
  END IF;

  INSERT INTO public.upt_audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    auth.uid(),
    'STOP_BREAK',
    'break_session',
    p_break,
    jsonb_build_object(
      'server_timestamp', server_now
    )
  );
END;
$$;

-- ============================================================
-- 6. STOP WORK
-- Automatically closes an active break first.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upt_stop_work(
  p_work_session UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  server_now TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify ownership before modifying anything.
  IF NOT EXISTS (
    SELECT 1
    FROM public.work_sessions
    WHERE id = p_work_session
      AND user_id = auth.uid()
      AND ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'No active work session';
  END IF;

  -- Close active break, if any.
  UPDATE public.break_sessions
  SET
    end_time = server_now,
    ended_at = server_now
  WHERE work_session_id = p_work_session
    AND user_id = auth.uid()
    AND ended_at IS NULL;

  UPDATE public.work_sessions
  SET
    end_time = server_now,
    ended_at = server_now,
    status = 'completed'
  WHERE id = p_work_session
    AND user_id = auth.uid()
    AND ended_at IS NULL;

  INSERT INTO public.upt_audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    auth.uid(),
    'STOP_WORK',
    'work_session',
    p_work_session,
    jsonb_build_object(
      'server_timestamp', server_now
    )
  );
END;
$$;

-- ============================================================
-- 7. Function execution permissions
-- ============================================================

REVOKE ALL ON FUNCTION public.upt_start_work(UUID, UUID)
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.upt_start_break(UUID)
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.upt_stop_break(UUID)
FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.upt_stop_work(UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.upt_start_work(UUID, UUID)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.upt_start_break(UUID)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.upt_stop_break(UUID)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.upt_stop_work(UUID)
TO authenticated;

