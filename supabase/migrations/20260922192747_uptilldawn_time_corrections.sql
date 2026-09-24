-- Uptilldawn time correction history
-- Admin-only corrections with immutable audit history.

CREATE TABLE IF NOT EXISTS public.time_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  work_session_id UUID
    REFERENCES public.work_sessions(id)
    ON DELETE CASCADE,

  break_session_id UUID
    REFERENCES public.break_sessions(id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES public.profiles(id)
    ON DELETE CASCADE,

  field_name TEXT NOT NULL,

  original_value TIMESTAMPTZ NOT NULL,
  corrected_value TIMESTAMPTZ NOT NULL,

  reason TEXT NOT NULL,

  corrected_by UUID NOT NULL
    REFERENCES public.profiles(id)
    ON DELETE RESTRICT,

  corrected_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT time_corrections_target_check
  CHECK (
    (work_session_id IS NOT NULL AND break_session_id IS NULL)
    OR
    (work_session_id IS NULL AND break_session_id IS NOT NULL)
  ),

  CONSTRAINT time_corrections_field_check
  CHECK (
    field_name IN ('started_at', 'ended_at')
  ),

  CONSTRAINT time_corrections_reason_check
  CHECK (length(trim(reason)) > 0)
);

CREATE INDEX IF NOT EXISTS time_corrections_work_session_idx
ON public.time_corrections(work_session_id);

CREATE INDEX IF NOT EXISTS time_corrections_break_session_idx
ON public.time_corrections(break_session_id);

CREATE INDEX IF NOT EXISTS time_corrections_user_idx
ON public.time_corrections(user_id);

CREATE INDEX IF NOT EXISTS time_corrections_corrected_at_idx
ON public.time_corrections(corrected_at);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.time_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY time_corrections_admin_read
ON public.time_corrections
FOR SELECT
TO authenticated
USING (
  public.upt_is_admin(auth.uid())
);

-- No INSERT / UPDATE / DELETE policy is intentionally provided.
-- Corrections are created through the controlled RPC below.


-- ============================================================
-- Admin correction RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.upt_admin_correct_time(
  p_target_type TEXT,
  p_target_id UUID,
  p_field_name TEXT,
  p_corrected_value TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  correction_id UUID;
  target_user UUID;
  original_timestamp TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.upt_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_target_type NOT IN ('work_session', 'break_session') THEN
    RAISE EXCEPTION 'Invalid target type';
  END IF;

  IF p_field_name NOT IN ('started_at', 'ended_at') THEN
    RAISE EXCEPTION 'Invalid field';
  END IF;

  IF p_corrected_value IS NULL THEN
    RAISE EXCEPTION 'Corrected value is required';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Correction reason is required';
  END IF;


  -- ==========================================================
  -- Work-session correction
  -- ==========================================================

  IF p_target_type = 'work_session' THEN

    SELECT
      user_id,
      CASE
        WHEN p_field_name = 'started_at' THEN started_at
        WHEN p_field_name = 'ended_at' THEN ended_at
      END
    INTO
      target_user,
      original_timestamp
    FROM public.work_sessions
    WHERE id = p_target_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Work session not found';
    END IF;

    IF original_timestamp IS NULL THEN
      RAISE EXCEPTION 'Original timestamp is empty';
    END IF;

    IF p_field_name = 'started_at' THEN

      IF EXISTS (
        SELECT 1
        FROM public.work_sessions
        WHERE id = p_target_id
          AND ended_at IS NOT NULL
          AND p_corrected_value >= ended_at
      ) THEN
        RAISE EXCEPTION 'Start time must be before end time';
      END IF;

      UPDATE public.work_sessions
      SET
        started_at = p_corrected_value,
        start_time = p_corrected_value
      WHERE id = p_target_id;

    ELSE

      IF EXISTS (
        SELECT 1
        FROM public.work_sessions
        WHERE id = p_target_id
          AND p_corrected_value <= started_at
      ) THEN
        RAISE EXCEPTION 'End time must be after start time';
      END IF;

      UPDATE public.work_sessions
      SET
        ended_at = p_corrected_value,
        end_time = p_corrected_value
      WHERE id = p_target_id;

    END IF;

    INSERT INTO public.time_corrections (
      work_session_id,
      user_id,
      field_name,
      original_value,
      corrected_value,
      reason,
      corrected_by
    )
    VALUES (
      p_target_id,
      target_user,
      p_field_name,
      original_timestamp,
      p_corrected_value,
      trim(p_reason),
      auth.uid()
    )
    RETURNING id INTO correction_id;


  -- ==========================================================
  -- Break-session correction
  -- ==========================================================

  ELSE

    SELECT
      user_id,
      CASE
        WHEN p_field_name = 'started_at' THEN started_at
        WHEN p_field_name = 'ended_at' THEN ended_at
      END
    INTO
      target_user,
      original_timestamp
    FROM public.break_sessions
    WHERE id = p_target_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Break session not found';
    END IF;

    IF original_timestamp IS NULL THEN
      RAISE EXCEPTION 'Original timestamp is empty';
    END IF;

    IF p_field_name = 'started_at' THEN

      IF EXISTS (
        SELECT 1
        FROM public.break_sessions
        WHERE id = p_target_id
          AND ended_at IS NOT NULL
          AND p_corrected_value >= ended_at
      ) THEN
        RAISE EXCEPTION 'Break start must be before break end';
      END IF;

      UPDATE public.break_sessions
      SET
        started_at = p_corrected_value,
        start_time = p_corrected_value
      WHERE id = p_target_id;

    ELSE

      IF EXISTS (
        SELECT 1
        FROM public.break_sessions
        WHERE id = p_target_id
          AND p_corrected_value <= started_at
      ) THEN
        RAISE EXCEPTION 'Break end must be after break start';
      END IF;

      UPDATE public.break_sessions
      SET
        ended_at = p_corrected_value,
        end_time = p_corrected_value
      WHERE id = p_target_id;

    END IF;

    INSERT INTO public.time_corrections (
      break_session_id,
      user_id,
      field_name,
      original_value,
      corrected_value,
      reason,
      corrected_by
    )
    VALUES (
      p_target_id,
      target_user,
      p_field_name,
      original_timestamp,
      p_corrected_value,
      trim(p_reason),
      auth.uid()
    )
    RETURNING id INTO correction_id;

  END IF;


  -- ==========================================================
  -- General audit log
  -- ==========================================================

  INSERT INTO public.upt_audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    auth.uid(),
    'TIME_CORRECTION',
    p_target_type,
    p_target_id,
    jsonb_build_object(
      'correction_id', correction_id,
      'user_id', target_user,
      'field', p_field_name,
      'original_value', original_timestamp,
      'corrected_value', p_corrected_value,
      'reason', trim(p_reason)
    )
  );

  RETURN correction_id;
END;
$$;

-- ============================================================
-- Permissions
-- ============================================================

REVOKE ALL ON TABLE public.time_corrections
FROM anon;

REVOKE INSERT, UPDATE, DELETE
ON TABLE public.time_corrections
FROM authenticated;

GRANT SELECT
ON TABLE public.time_corrections
TO authenticated;

REVOKE ALL ON FUNCTION public.upt_admin_correct_time(
  TEXT,
  UUID,
  TEXT,
  TIMESTAMPTZ,
  TEXT
)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.upt_admin_correct_time(
  TEXT,
  UUID,
  TEXT,
  TIMESTAMPTZ,
  TEXT
)
TO authenticated;

