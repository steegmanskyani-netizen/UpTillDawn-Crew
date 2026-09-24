-- ============================================================
-- UPTILLDAWN — CHECK-IN / CHECK-OUT APPROVAL WORKFLOW
-- ============================================================


-- ============================================================
-- 1. REMOVE LEGACY TRIGGER
--
-- Approval must NOT automatically start/stop work sessions.
-- START WORK / STOP WORK are separate controlled actions.
-- ============================================================

DROP TRIGGER IF EXISTS on_check_in_approved
ON public.check_ins;

DROP FUNCTION IF EXISTS public.handle_check_in_approval();

-- ============================================================
-- 2. CHECK-OUT NEEDS WORKPLACE CONTEXT
--
-- This allows the correct Responsible Lead to approve checkout.
-- Existing historical rows may remain NULL.
-- ============================================================

ALTER TABLE public.check_outs
ADD COLUMN IF NOT EXISTS workplace_id UUID
REFERENCES public.workplaces(id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS check_ins_user_event_idx
ON public.check_ins(user_id, event_id);

CREATE INDEX IF NOT EXISTS check_ins_status_idx
ON public.check_ins(status);

CREATE INDEX IF NOT EXISTS check_outs_user_event_idx
ON public.check_outs(user_id, event_id);

CREATE INDEX IF NOT EXISTS check_outs_workplace_idx
ON public.check_outs(workplace_id);

CREATE INDEX IF NOT EXISTS check_outs_status_idx
ON public.check_outs(status);

-- ============================================================
-- 3. NORMALIZE LEGACY CHECK-IN DATA
-- ============================================================

UPDATE public.check_ins
SET type = 'check-in'
WHERE type IS NULL
   OR type <> 'check-in';

-- Keep legacy approval fields synchronized with the newer fields.

UPDATE public.check_ins
SET
  decided_at = COALESCE(decided_at, approved_at),
  decided_by = COALESCE(decided_by, approved_by)
WHERE status = 'approved';

-- ============================================================
-- 4. STATUS CONSTRAINTS
-- ============================================================

ALTER TABLE public.check_ins
DROP CONSTRAINT IF EXISTS check_ins_status_check;

ALTER TABLE public.check_ins
ADD CONSTRAINT check_ins_status_check
CHECK (
  status IN (
    'pending',
    'approved',
    'rejected'
  )
);

ALTER TABLE public.check_outs
DROP CONSTRAINT IF EXISTS check_outs_status_check;

ALTER TABLE public.check_outs
ADD CONSTRAINT check_outs_status_check
CHECK (
  status IN (
    'pending',
    'approved',
    'rejected'
  )
);

-- ============================================================
-- 5. REMOVE OLD RLS POLICIES
-- ============================================================

DROP POLICY IF EXISTS checkins_insert
ON public.check_ins;

DROP POLICY IF EXISTS checkins_manage
ON public.check_ins;

DROP POLICY IF EXISTS checkins_read
ON public.check_ins;

DROP POLICY IF EXISTS checkouts_insert
ON public.check_outs;

DROP POLICY IF EXISTS checkouts_manage
ON public.check_outs;

DROP POLICY IF EXISTS checkouts_read
ON public.check_outs;

-- ============================================================
-- 6. CHECK-IN RLS
-- ============================================================

ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY checkins_read
ON public.check_ins
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()

  OR public.upt_is_admin(auth.uid())

  OR public.upt_is_responsible(
    event_id,
    workplace_id,
    auth.uid()
  )
);

-- ============================================================
-- 7. CHECK-OUT RLS
-- ============================================================

ALTER TABLE public.check_outs ENABLE ROW LEVEL SECURITY;

CREATE POLICY checkouts_read
ON public.check_outs
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()

  OR public.upt_is_admin(auth.uid())

  OR (
    workplace_id IS NOT NULL
    AND public.upt_is_responsible(
      event_id,
      workplace_id,
      auth.uid()
    )
  )
);

-- ============================================================
-- 8. REQUEST CHECK-IN
--
-- Employee cannot forge:
-- - user_id
-- - requested_at
-- - status
-- - approval
--
-- GPS is recorded, but this function does NOT pretend GPS was
-- verified. Actual radius validation can be added separately
-- using the event's configured coordinates/radius.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upt_request_check_in(
  p_event UUID,
  p_workplace UUID,
  p_remote BOOLEAN DEFAULT false,
  p_selfie_path TEXT DEFAULT NULL,
  p_latitude NUMERIC DEFAULT NULL,
  p_longitude NUMERIC DEFAULT NULL,
  p_accuracy_m NUMERIC DEFAULT NULL,
  p_gps_status TEXT DEFAULT 'not_checked'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;


  -- User must be approved.
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.approved = true
  ) THEN
    RAISE EXCEPTION 'ACCOUNT NOT APPROVED';
  END IF;


  -- User must belong to the event.
  IF NOT EXISTS (
    SELECT 1
    FROM public.event_members em
    WHERE em.event_id = p_event
      AND em.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'User is not a member of this event';
  END IF;


  -- Workplace must belong to the same event.
  IF NOT EXISTS (
    SELECT 1
    FROM public.workplaces w
    WHERE w.id = p_workplace
      AND w.event_id = p_event
  ) THEN
    RAISE EXCEPTION 'Invalid workplace for this event';
  END IF;


  -- User must actually have a shift for this workplace.
  IF NOT EXISTS (
    SELECT 1
    FROM public.shifts s
    WHERE s.event_id = p_event
      AND s.workplace_id = p_workplace
      AND s.user_id = auth.uid()
      AND COALESCE(s.status, '') <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'No shift assigned for this workplace';
  END IF;


  -- Remote check-in requires a fresh workplace selfie path.
  IF p_remote = true
     AND (
       p_selfie_path IS NULL
       OR length(trim(p_selfie_path)) = 0
     )
  THEN
    RAISE EXCEPTION 'Remote check-in requires a fresh selfie';
  END IF;


  -- Prevent multiple pending requests for same event.
  IF EXISTS (
    SELECT 1
    FROM public.check_ins ci
    WHERE ci.user_id = auth.uid()
      AND ci.event_id = p_event
      AND ci.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A check-in request is already pending';
  END IF;


  INSERT INTO public.check_ins (
    user_id,
    event_id,
    workplace_id,
    type,
    status,

    selfie_path,
    selfie_url,

    gps_status,
    latitude,
    longitude,
    accuracy_m,

    remote,

    requested_at,
    created_at,

    approved_by,
    approved_at,
    decided_by,
    decided_at
  )
  VALUES (
    auth.uid(),
    p_event,
    p_workplace,
    'check-in',
    'pending',

    p_selfie_path,
    NULL,

    COALESCE(NULLIF(trim(p_gps_status), ''), 'not_checked'),
    p_latitude,
    p_longitude,
    p_accuracy_m,

    p_remote,

    now(),
    now(),

    NULL,
    NULL,
    NULL,
    NULL
  )
  RETURNING id INTO v_id;


  INSERT INTO public.upt_audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    auth.uid(),
    'CHECK_IN_REQUESTED',
    'check_in',
    v_id,
    jsonb_build_object(
      'event_id', p_event,
      'workplace_id', p_workplace,
      'remote', p_remote,
      'gps_status', p_gps_status
    )
  );


  RETURN v_id;
END;
$$;

-- ============================================================
-- 9. DECIDE CHECK-IN
--
-- Admin:
--   any check-in
--
-- Responsible:
--   only own assigned workplace
--
-- Decision timestamp is server-controlled.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upt_decide_check_in(
  p_check_in UUID,
  p_approve BOOLEAN,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_in public.check_ins%ROWTYPE;
  v_status TEXT;
BEGIN

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;


  SELECT *
  INTO v_check_in
  FROM public.check_ins
  WHERE id = p_check_in
  FOR UPDATE;


  IF NOT FOUND THEN
    RAISE EXCEPTION 'Check-in request not found';
  END IF;


  IF v_check_in.status <> 'pending' THEN
    RAISE EXCEPTION 'Check-in request has already been decided';
  END IF;


  IF NOT (
    public.upt_is_admin(auth.uid())

    OR public.upt_is_responsible(
      v_check_in.event_id,
      v_check_in.workplace_id,
      auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to decide this check-in';
  END IF;


  IF p_approve THEN
    v_status := 'approved';
  ELSE
    v_status := 'rejected';
  END IF;


  UPDATE public.check_ins
  SET
    status = v_status,

    decided_by = auth.uid(),
    decided_at = now(),

    approved_by =
      CASE
        WHEN p_approve THEN auth.uid()
        ELSE NULL
      END,

    approved_at =
      CASE
        WHEN p_approve THEN now()
        ELSE NULL
      END,

    notes = p_notes

  WHERE id = p_check_in;


  INSERT INTO public.upt_audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    auth.uid(),

    CASE
      WHEN p_approve
        THEN 'CHECK_IN_APPROVED'
      ELSE 'CHECK_IN_REJECTED'
    END,

    'check_in',
    p_check_in,

    jsonb_build_object(
      'user_id', v_check_in.user_id,
      'event_id', v_check_in.event_id,
      'workplace_id', v_check_in.workplace_id,
      'notes', p_notes
    )
  );


  RETURN p_check_in;
END;
$$;

-- ============================================================
-- 10. REQUEST CHECK-OUT
--
-- Workplace is derived from the user's latest approved
-- check-in for the event. The client cannot choose a different
-- workplace to manipulate Responsible authorization.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upt_request_check_out(
  p_event UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_workplace UUID;
BEGIN

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM public.event_members em
    WHERE em.event_id = p_event
      AND em.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'User is not a member of this event';
  END IF;


  -- A checkout requires an approved check-in.
  SELECT ci.workplace_id
  INTO v_workplace
  FROM public.check_ins ci
  WHERE ci.user_id = auth.uid()
    AND ci.event_id = p_event
    AND ci.status = 'approved'
  ORDER BY COALESCE(
    ci.decided_at,
    ci.approved_at,
    ci.requested_at,
    ci.created_at
  ) DESC
  LIMIT 1;


  IF v_workplace IS NULL THEN
    RAISE EXCEPTION 'No approved check-in found for this event';
  END IF;


  IF EXISTS (
    SELECT 1
    FROM public.check_outs co
    WHERE co.user_id = auth.uid()
      AND co.event_id = p_event
      AND co.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'A check-out request is already pending';
  END IF;


  INSERT INTO public.check_outs (
    event_id,
    user_id,
    workplace_id,
    status,
    requested_at,
    decided_at,
    decided_by,
    notes
  )
  VALUES (
    p_event,
    auth.uid(),
    v_workplace,
    'pending',
    now(),
    NULL,
    NULL,
    p_notes
  )
  RETURNING id INTO v_id;


  INSERT INTO public.upt_audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    auth.uid(),
    'CHECK_OUT_REQUESTED',
    'check_out',
    v_id,
    jsonb_build_object(
      'event_id', p_event,
      'workplace_id', v_workplace
    )
  );


  RETURN v_id;
END;
$$;

-- ============================================================
-- 11. DECIDE CHECK-OUT
-- ============================================================

CREATE OR REPLACE FUNCTION public.upt_decide_check_out(
  p_check_out UUID,
  p_approve BOOLEAN,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_check_out public.check_outs%ROWTYPE;
  v_status TEXT;
BEGIN

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;


  SELECT *
  INTO v_check_out
  FROM public.check_outs
  WHERE id = p_check_out
  FOR UPDATE;


  IF NOT FOUND THEN
    RAISE EXCEPTION 'Check-out request not found';
  END IF;


  IF v_check_out.status <> 'pending' THEN
    RAISE EXCEPTION 'Check-out request has already been decided';
  END IF;


  IF NOT (
    public.upt_is_admin(auth.uid())

    OR (
      v_check_out.workplace_id IS NOT NULL
      AND public.upt_is_responsible(
        v_check_out.event_id,
        v_check_out.workplace_id,
        auth.uid()
      )
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to decide this check-out';
  END IF;


  IF p_approve THEN
    v_status := 'approved';
  ELSE
    v_status := 'rejected';
  END IF;


  UPDATE public.check_outs
  SET
    status = v_status,
    decided_by = auth.uid(),
    decided_at = now(),
    notes = p_notes
  WHERE id = p_check_out;


  INSERT INTO public.upt_audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    auth.uid(),

    CASE
      WHEN p_approve
        THEN 'CHECK_OUT_APPROVED'
      ELSE 'CHECK_OUT_REJECTED'
    END,

    'check_out',
    p_check_out,

    jsonb_build_object(
      'user_id', v_check_out.user_id,
      'event_id', v_check_out.event_id,
      'workplace_id', v_check_out.workplace_id,
      'notes', p_notes
    )
  );


  RETURN p_check_out;
END;
$$;

-- ============================================================
-- 12. TABLE PERMISSIONS
--
-- Clients may READ through RLS.
-- They may NOT directly INSERT/UPDATE/DELETE approval records.
-- Mutations must use the controlled RPCs above.
-- ============================================================

REVOKE ALL ON TABLE public.check_ins FROM anon;

REVOKE ALL ON TABLE public.check_outs FROM anon;

GRANT SELECT
ON TABLE public.check_ins
TO authenticated;

GRANT SELECT
ON TABLE public.check_outs
TO authenticated;

REVOKE INSERT, UPDATE, DELETE
ON TABLE public.check_ins
FROM authenticated;

REVOKE INSERT, UPDATE, DELETE
ON TABLE public.check_outs
FROM authenticated;

-- ============================================================
-- 13. RPC PERMISSIONS
-- ============================================================

REVOKE ALL ON FUNCTION
public.upt_request_check_in(
  UUID,
  UUID,
  BOOLEAN,
  TEXT,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  TEXT
)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
public.upt_request_check_in(
  UUID,
  UUID,
  BOOLEAN,
  TEXT,
  NUMERIC,
  NUMERIC,
  NUMERIC,
  TEXT
)
TO authenticated;

REVOKE ALL ON FUNCTION
public.upt_decide_check_in(
  UUID,
  BOOLEAN,
  TEXT
)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
public.upt_decide_check_in(
  UUID,
  BOOLEAN,
  TEXT
)
TO authenticated;

REVOKE ALL ON FUNCTION
public.upt_request_check_out(
  UUID,
  TEXT
)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
public.upt_request_check_out(
  UUID,
  TEXT
)
TO authenticated;

REVOKE ALL ON FUNCTION
public.upt_decide_check_out(
  UUID,
  BOOLEAN,
  TEXT
)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
public.upt_decide_check_out(
  UUID,
  BOOLEAN,
  TEXT
)
TO authenticated;

