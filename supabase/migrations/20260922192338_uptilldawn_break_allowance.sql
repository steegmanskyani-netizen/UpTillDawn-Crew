-- Uptilldawn break allowance
-- Default allowance: 60 minutes per work session/event work period.
-- Breaks may be split across multiple break sessions.
-- Excess break time is deducted from payable/net work time.

-- ============================================================
-- 1. Break allowance on work sessions
-- ============================================================

ALTER TABLE public.work_sessions
ADD COLUMN IF NOT EXISTS break_allowance_minutes INTEGER
NOT NULL DEFAULT 60;

ALTER TABLE public.work_sessions
ADD CONSTRAINT work_sessions_break_allowance_nonnegative
CHECK (break_allowance_minutes >= 0);

-- ============================================================
-- 2. Timekeeping summary function
--
-- Gross:
--   full elapsed work-session duration
--
-- Regular break:
--   break time up to allowance
--
-- Excess break:
--   break time above allowance
--
-- Net payable:
--   gross - excess break
--
-- IMPORTANT:
-- Normal break allowance remains payable.
-- Only excess break is deducted.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upt_work_session_time_summary(
  p_work_session UUID
)
RETURNS TABLE (
  work_session_id UUID,
  gross_seconds BIGINT,
  break_seconds BIGINT,
  break_allowance_seconds BIGINT,
  regular_break_seconds BIGINT,
  excess_break_seconds BIGINT,
  break_balance_seconds BIGINT,
  net_payable_seconds BIGINT,
  active_break BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws public.work_sessions%ROWTYPE;
  calculation_time TIMESTAMPTZ := now();
  total_break_seconds BIGINT := 0;
  calculated_gross_seconds BIGINT := 0;
  allowance_seconds BIGINT := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO ws
  FROM public.work_sessions
  WHERE id = p_work_session;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work session not found';
  END IF;

  -- Staff can see their own summary.
  -- Admins can see every summary.
  -- Responsible leads can see sessions belonging to their
  -- assigned workplace through the linked shift.
  IF ws.user_id <> auth.uid()
     AND NOT public.upt_is_admin(auth.uid())
     AND NOT EXISTS (
       SELECT 1
       FROM public.shifts s
       WHERE s.id = ws.shift_id
         AND public.upt_is_responsible(
           ws.event_id,
           s.workplace_id,
           auth.uid()
         )
     )
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  calculated_gross_seconds :=
    GREATEST(
      0,
      FLOOR(
        EXTRACT(
          EPOCH FROM (
            COALESCE(ws.ended_at, calculation_time) - ws.started_at
          )
        )
      )::BIGINT
    );

  SELECT
    COALESCE(
      SUM(
        GREATEST(
          0,
          FLOOR(
            EXTRACT(
              EPOCH FROM (
                COALESCE(bs.ended_at, calculation_time) - bs.started_at
              )
            )
          )::BIGINT
        )
      ),
      0
    )
  INTO total_break_seconds
  FROM public.break_sessions bs
  WHERE bs.work_session_id = p_work_session;

  allowance_seconds :=
    GREATEST(0, ws.break_allowance_minutes::BIGINT * 60);

  work_session_id := ws.id;
  gross_seconds := calculated_gross_seconds;
  break_seconds := total_break_seconds;
  break_allowance_seconds := allowance_seconds;

  regular_break_seconds :=
    LEAST(total_break_seconds, allowance_seconds);

  excess_break_seconds :=
    GREATEST(total_break_seconds - allowance_seconds, 0);

  break_balance_seconds :=
    GREATEST(allowance_seconds - total_break_seconds, 0);

  net_payable_seconds :=
    GREATEST(
      calculated_gross_seconds
      - GREATEST(total_break_seconds - allowance_seconds, 0),
      0
    );

  active_break := EXISTS (
    SELECT 1
    FROM public.break_sessions bs
    WHERE bs.work_session_id = p_work_session
      AND bs.ended_at IS NULL
  );

  RETURN NEXT;
END;
$$;

-- ============================================================
-- 3. Restrict execution
-- ============================================================

REVOKE ALL ON FUNCTION
public.upt_work_session_time_summary(UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
public.upt_work_session_time_summary(UUID)
TO authenticated;

