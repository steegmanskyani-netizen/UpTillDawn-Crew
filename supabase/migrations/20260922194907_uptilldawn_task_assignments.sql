-- ============================================================
-- UPTILLDAWN — TASK ASSIGNMENTS
-- Individual task assignment, status and confirmation
-- ============================================================


-- ------------------------------------------------------------
-- 1. Task assignments
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  task_id UUID NOT NULL
    REFERENCES public.tasks(id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES public.profiles(id)
    ON DELETE CASCADE,

  assigned_by UUID
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'NOT STARTED',

  confirmed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT task_assignment_unique
    UNIQUE (task_id, user_id),

  CONSTRAINT task_assignment_status_check
    CHECK (
      status IN (
        'NOT STARTED',
        'IN PROGRESS',
        'COMPLETED'
      )
    )
);

CREATE INDEX IF NOT EXISTS task_assignments_task_idx
ON public.task_assignments(task_id);

CREATE INDEX IF NOT EXISTS task_assignments_user_idx
ON public.task_assignments(user_id);

CREATE INDEX IF NOT EXISTS task_assignments_status_idx
ON public.task_assignments(status);

-- ------------------------------------------------------------
-- 2. Enable RLS
-- ------------------------------------------------------------

ALTER TABLE public.task_assignments
ENABLE ROW LEVEL SECURITY;

-- Employee can see own task assignments.
CREATE POLICY task_assignments_read_own
ON public.task_assignments
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
);

-- Admin can see/manage everything.
CREATE POLICY task_assignments_admin_manage
ON public.task_assignments
FOR ALL
TO authenticated
USING (
  public.upt_is_admin(auth.uid())
)
WITH CHECK (
  public.upt_is_admin(auth.uid())
);

-- Responsible lead can see assignments belonging to tasks
-- for workplaces they are responsible for.
CREATE POLICY task_assignments_responsible_read
ON public.task_assignments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = task_assignments.task_id
      AND t.workplace_id IS NOT NULL
      AND public.upt_is_responsible(
        t.event_id,
        t.workplace_id,
        auth.uid()
      )
  )
);

-- ------------------------------------------------------------
-- 3. RPC: update own task status
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upt_update_task_status(
  p_assignment UUID,
  p_status TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.task_assignments%ROWTYPE;
BEGIN

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_status NOT IN (
    'NOT STARTED',
    'IN PROGRESS',
    'COMPLETED'
  ) THEN
    RAISE EXCEPTION 'Invalid task status';
  END IF;


  SELECT *
  INTO v_assignment
  FROM public.task_assignments
  WHERE id = p_assignment
  FOR UPDATE;


  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task assignment not found';
  END IF;


  IF v_assignment.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Task assignment does not belong to this user';
  END IF;


  UPDATE public.task_assignments
  SET
    status = p_status,

    confirmed_at =
      CASE
        WHEN p_status = 'COMPLETED'
          THEN COALESCE(confirmed_at, now())
        ELSE NULL
      END,

    updated_at = now()

  WHERE id = p_assignment;


  INSERT INTO public.upt_audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    auth.uid(),
    'TASK_STATUS_CHANGED',
    'task_assignment',
    p_assignment,
    jsonb_build_object(
      'old_status', v_assignment.status,
      'new_status', p_status,
      'task_id', v_assignment.task_id
    )
  );


  RETURN p_assignment;
END;
$$;

-- ------------------------------------------------------------
-- 4. RPC: responsible/admin assign employee to task
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upt_assign_task(
  p_task UUID,
  p_user UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_assignment UUID;
  v_allowed BOOLEAN := false;
BEGIN

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;


  SELECT *
  INTO v_task
  FROM public.tasks
  WHERE id = p_task;


  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;


  -- Admin may assign any valid event member.
  IF public.upt_is_admin(auth.uid()) THEN
    v_allowed := true;

  -- Responsible may only assign within own workplace.
  ELSIF v_task.workplace_id IS NOT NULL
    AND public.upt_is_responsible(
      v_task.event_id,
      v_task.workplace_id,
      auth.uid()
    )
  THEN
    v_allowed := true;
  END IF;


  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorized to assign this task';
  END IF;


  -- Target must be an approved event member.
  IF NOT EXISTS (
    SELECT 1
    FROM public.event_members em
    JOIN public.profiles p
      ON p.id = em.user_id
    WHERE em.event_id = v_task.event_id
      AND em.user_id = p_user
      AND p.approved = true
  ) THEN
    RAISE EXCEPTION 'User is not an approved member of this event';
  END IF;


  INSERT INTO public.task_assignments (
    task_id,
    user_id,
    assigned_by,
    status
  )
  VALUES (
    p_task,
    p_user,
    auth.uid(),
    'NOT STARTED'
  )
  ON CONFLICT (task_id, user_id)
  DO NOTHING
  RETURNING id INTO v_assignment;


  IF v_assignment IS NULL THEN
    SELECT id
    INTO v_assignment
    FROM public.task_assignments
    WHERE task_id = p_task
      AND user_id = p_user;
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
    'TASK_ASSIGNED',
    'task_assignment',
    v_assignment,
    jsonb_build_object(
      'task_id', p_task,
      'user_id', p_user
    )
  );


  RETURN v_assignment;
END;
$$;

-- ------------------------------------------------------------
-- 5. RPC: remove task assignment
-- Admin or responsible for that workplace.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upt_remove_task_assignment(
  p_assignment UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.task_assignments%ROWTYPE;
  v_task public.tasks%ROWTYPE;
BEGIN

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;


  SELECT *
  INTO v_assignment
  FROM public.task_assignments
  WHERE id = p_assignment
  FOR UPDATE;


  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task assignment not found';
  END IF;


  SELECT *
  INTO v_task
  FROM public.tasks
  WHERE id = v_assignment.task_id;


  IF NOT (
    public.upt_is_admin(auth.uid())
    OR (
      v_task.workplace_id IS NOT NULL
      AND public.upt_is_responsible(
        v_task.event_id,
        v_task.workplace_id,
        auth.uid()
      )
    )
  ) THEN
    RAISE EXCEPTION 'Not authorized to remove this assignment';
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
    'TASK_ASSIGNMENT_REMOVED',
    'task_assignment',
    p_assignment,
    jsonb_build_object(
      'task_id', v_assignment.task_id,
      'user_id', v_assignment.user_id,
      'status', v_assignment.status
    )
  );


  DELETE FROM public.task_assignments
  WHERE id = p_assignment;

END;
$$;

-- ------------------------------------------------------------
-- 6. Permissions
-- No direct client mutation of task_assignments.
-- Changes go through controlled RPCs.
-- ------------------------------------------------------------

REVOKE ALL
ON TABLE public.task_assignments
FROM anon;

GRANT SELECT
ON TABLE public.task_assignments
TO authenticated;

REVOKE INSERT, UPDATE, DELETE
ON TABLE public.task_assignments
FROM authenticated;

REVOKE ALL ON FUNCTION
public.upt_update_task_status(UUID, TEXT)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
public.upt_update_task_status(UUID, TEXT)
TO authenticated;

REVOKE ALL ON FUNCTION
public.upt_assign_task(UUID, UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
public.upt_assign_task(UUID, UUID)
TO authenticated;

REVOKE ALL ON FUNCTION
public.upt_remove_task_assignment(UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
public.upt_remove_task_assignment(UUID)
TO authenticated;

