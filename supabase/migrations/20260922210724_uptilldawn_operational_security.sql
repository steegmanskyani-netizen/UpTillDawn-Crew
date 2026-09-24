CREATE OR REPLACE FUNCTION public.upt_is_approved() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved) $$;
REVOKE ALL ON FUNCTION public.upt_is_approved() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upt_is_approved() TO authenticated;
CREATE OR REPLACE FUNCTION public.upt_start_work(p_event uuid, p_shift uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  wid UUID;
  server_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'ACCOUNT NOT APPROVED'; END IF;
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

  IF p_shift IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.shifts s JOIN public.check_ins c
    ON c.event_id=s.event_id AND c.workplace_id=s.workplace_id AND c.user_id=s.user_id
    WHERE s.id=p_shift AND s.user_id=auth.uid() AND c.status='approved'
  ) THEN RAISE EXCEPTION 'Approved check-in for assigned shift required'; END IF;
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
$function$
;
CREATE OR REPLACE FUNCTION public.upt_confirm_workplace_transition(p_work_session uuid, p_to_workplace uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  transition_id UUID;
  session_event UUID;
  session_user UUID;
  current_workplace UUID;
  destination_event UUID;
BEGIN
  IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'ACCOUNT NOT APPROVED'; END IF;
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
      AND s.scheduled_start <= now() AND s.scheduled_end > now()
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
$function$
;
CREATE OR REPLACE FUNCTION public.upt_start_break(p_work_session uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  bid UUID;
  server_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'ACCOUNT NOT APPROVED'; END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM 1 FROM public.work_sessions WHERE id=p_work_session AND user_id=auth.uid() FOR UPDATE;
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
$function$
;
CREATE OR REPLACE FUNCTION public.upt_stop_break(p_break uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  server_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'ACCOUNT NOT APPROVED'; END IF;
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
$function$
;
CREATE OR REPLACE FUNCTION public.upt_stop_work(p_work_session uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  server_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'ACCOUNT NOT APPROVED'; END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Verify ownership before modifying anything.
  PERFORM 1 FROM public.work_sessions WHERE id=p_work_session AND user_id=auth.uid() FOR UPDATE;
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
$function$
;
CREATE OR REPLACE FUNCTION public.upt_assign_task(p_task uuid, p_user uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_assignment UUID;
  v_allowed BOOLEAN := false;
BEGIN
  IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'ACCOUNT NOT APPROVED'; END IF;

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
$function$
;
CREATE OR REPLACE FUNCTION public.upt_admin_correct_time(p_target_type text, p_target_id uuid, p_field_name text, p_corrected_value timestamp with time zone, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  correction_id UUID;
  target_user UUID;
  original_timestamp TIMESTAMPTZ;
BEGIN
  IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'ACCOUNT NOT APPROVED'; END IF;
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
$function$
;
CREATE OR REPLACE FUNCTION public.upt_acknowledge_personal_instruction(p_instruction uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  instruction_user UUID;
  instruction_version INTEGER;
  acknowledgement_id UUID;
BEGIN
  IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'ACCOUNT NOT APPROVED'; END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    user_id,
    version
  INTO
    instruction_user,
    instruction_version
  FROM public.personal_instructions
  WHERE id = p_instruction;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Personal instruction not found';
  END IF;

  IF instruction_user <> auth.uid() THEN
    RAISE EXCEPTION 'Instruction is not assigned to this user';
  END IF;

  INSERT INTO public.personal_instruction_acknowledgements (
    instruction_id,
    user_id,
    version,
    acknowledged_at
  )
  VALUES (
    p_instruction,
    auth.uid(),
    instruction_version,
    now()
  )
  ON CONFLICT (instruction_id, user_id, version)
  DO UPDATE SET
    acknowledged_at =
      public.personal_instruction_acknowledgements.acknowledged_at
  RETURNING id INTO acknowledgement_id;

  INSERT INTO public.upt_audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    auth.uid(),
    'PERSONAL_INSTRUCTION_ACKNOWLEDGED',
    'personal_instruction',
    p_instruction,
    jsonb_build_object(
      'version', instruction_version,
      'acknowledgement_id', acknowledgement_id
    )
  );

  RETURN acknowledgement_id;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.upt_request_check_out(p_event uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID;
  v_workplace UUID;
BEGIN
  IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'ACCOUNT NOT APPROVED'; END IF;

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
$function$
;
CREATE OR REPLACE FUNCTION public.upt_update_task_status(p_assignment uuid, p_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_assignment public.task_assignments%ROWTYPE;
BEGIN
  IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'ACCOUNT NOT APPROVED'; END IF;

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
$function$
;
CREATE OR REPLACE FUNCTION public.upt_remove_task_assignment(p_assignment uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_assignment public.task_assignments%ROWTYPE;
  v_task public.tasks%ROWTYPE;
BEGIN
  IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'ACCOUNT NOT APPROVED'; END IF;

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
$function$
;
CREATE OR REPLACE FUNCTION public.upt_request_check_in(p_event uuid, p_workplace uuid, p_remote boolean DEFAULT false, p_selfie_path text DEFAULT NULL::text, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric, p_accuracy_m numeric DEFAULT NULL::numeric, p_gps_status text DEFAULT 'not_checked'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'ACCOUNT NOT APPROVED'; END IF;

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


  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_event::text,0));
  IF EXISTS(SELECT 1 FROM public.check_ins WHERE user_id=auth.uid() AND event_id=p_event AND status='pending')
    THEN RAISE EXCEPTION 'A check-in request is already pending'; END IF;
  IF p_remote AND NOT EXISTS(
    SELECT 1 FROM storage.objects o WHERE o.bucket_id='checkin-selfies' AND o.name=p_selfie_path
      AND split_part(o.name,'/',1)=auth.uid()::text AND o.created_at > now()-interval '10 minutes'
      AND NOT EXISTS(SELECT 1 FROM public.check_ins c WHERE c.selfie_path=o.name)
  ) THEN RAISE EXCEPTION 'Fresh uploaded selfie required'; END IF;
  p_gps_status := CASE WHEN p_gps_status IN ('denied','unavailable','offline') THEN p_gps_status ELSE 'not_checked' END;
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
$function$
;
CREATE OR REPLACE FUNCTION public.upt_decide_check_in(p_check_in uuid, p_approve boolean, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_check_in public.check_ins%ROWTYPE;
  v_status TEXT;
BEGIN
  IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'ACCOUNT NOT APPROVED'; END IF;

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
$function$
;
CREATE OR REPLACE FUNCTION public.upt_decide_check_out(p_check_out uuid, p_approve boolean, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_check_out public.check_outs%ROWTYPE;
  v_status TEXT;
BEGIN
  IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'ACCOUNT NOT APPROVED'; END IF;

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
$function$
;

-- RLS approval gate also invalidates access with an already-issued JWT.
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'profiles' LOOP
 EXECUTE format('CREATE POLICY upt_approved_gate ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.upt_is_approved()) WITH CHECK (public.upt_is_approved())',t);
 END LOOP;
END $$;
DROP POLICY work_sessions_read ON public.work_sessions;
CREATE POLICY work_sessions_read ON public.work_sessions FOR SELECT TO authenticated USING (
 user_id=auth.uid() OR public.upt_is_admin() OR EXISTS (
 SELECT 1 FROM public.shifts s WHERE s.id=work_sessions.shift_id AND public.upt_is_responsible(s.event_id,s.workplace_id)));
DROP POLICY break_sessions_read ON public.break_sessions;
CREATE POLICY break_sessions_read ON public.break_sessions FOR SELECT TO authenticated USING (
 user_id=auth.uid() OR public.upt_is_admin() OR EXISTS (
 SELECT 1 FROM public.work_sessions ws JOIN public.shifts s ON s.id=ws.shift_id
 WHERE ws.id=break_sessions.work_session_id AND public.upt_is_responsible(s.event_id,s.workplace_id)));
DROP POLICY briefing_manage ON public.briefings;
CREATE POLICY briefing_manage ON public.briefings FOR ALL TO authenticated
USING (public.upt_is_admin() OR (workplace_id IS NOT NULL AND public.upt_is_responsible(event_id,workplace_id)))
WITH CHECK (public.upt_is_admin() OR (workplace_id IS NOT NULL AND public.upt_is_responsible(event_id,workplace_id)));
DROP POLICY tasks_manage ON public.tasks;
CREATE POLICY tasks_manage ON public.tasks FOR ALL TO authenticated
USING (public.upt_is_admin() OR (workplace_id IS NOT NULL AND public.upt_is_responsible(event_id,workplace_id)))
WITH CHECK (public.upt_is_admin() OR (workplace_id IS NOT NULL AND public.upt_is_responsible(event_id,workplace_id)));

-- One allowance for an employee's event, allocated chronologically across sessions.
CREATE OR REPLACE FUNCTION public.upt_work_session_time_summary(p_work_session uuid)
RETURNS TABLE(work_session_id uuid,gross_seconds bigint,break_seconds bigint,break_allowance_seconds bigint,regular_break_seconds bigint,excess_break_seconds bigint,break_balance_seconds bigint,net_payable_seconds bigint,active_break boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ws public.work_sessions%ROWTYPE; prior_break bigint; used bigint; available bigint; calculation_time timestamptz:=now();
BEGIN
 IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'ACCOUNT NOT APPROVED'; END IF;
 SELECT * INTO ws FROM public.work_sessions WHERE id=p_work_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'Work session not found'; END IF;
 IF ws.user_id<>auth.uid() AND NOT public.upt_is_admin() AND NOT EXISTS(
 SELECT 1 FROM public.shifts s WHERE s.id=ws.shift_id AND public.upt_is_responsible(ws.event_id,s.workplace_id)) THEN
 RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT coalesce(sum(greatest(0,floor(extract(epoch from (least(coalesce(b.ended_at,calculation_time),coalesce(w.ended_at,calculation_time))-greatest(b.started_at,w.started_at)))))),0)::bigint
 INTO prior_break FROM public.break_sessions b JOIN public.work_sessions w ON w.id=b.work_session_id
 WHERE w.user_id=ws.user_id AND w.event_id=ws.event_id AND (w.started_at,w.id)<(ws.started_at,ws.id);
 SELECT coalesce(sum(greatest(0,floor(extract(epoch from (least(coalesce(b.ended_at,calculation_time),coalesce(ws.ended_at,calculation_time))-greatest(b.started_at,ws.started_at)))))),0)::bigint
 INTO used FROM public.break_sessions b WHERE b.work_session_id=ws.id;
 available:=greatest(3600-prior_break,0);
 work_session_id:=ws.id;
 gross_seconds:=greatest(0,floor(extract(epoch from(coalesce(ws.ended_at,calculation_time)-ws.started_at))))::bigint;
 break_seconds:=used; break_allowance_seconds:=3600;
 regular_break_seconds:=least(used,available); excess_break_seconds:=greatest(used-available,0);
 break_balance_seconds:=greatest(available-used,0); net_payable_seconds:=greatest(gross_seconds-excess_break_seconds,0);
 active_break:=EXISTS(SELECT 1 FROM public.break_sessions b WHERE b.work_session_id=ws.id AND b.ended_at IS NULL);
 RETURN NEXT;
END $$;

DROP POLICY upt_checkin_selfies_read ON storage.objects;
CREATE POLICY upt_checkin_selfies_read ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id='checkin-selfies' AND public.upt_is_approved() AND
 (split_part(name,'/',1)=auth.uid()::text OR public.upt_is_admin() OR EXISTS(
 SELECT 1 FROM public.check_ins c WHERE c.selfie_path=name AND public.upt_is_responsible(c.event_id,c.workplace_id))));
DROP POLICY upt_incident_photos_read ON storage.objects;
CREATE POLICY upt_incident_photos_read ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id='incident-photos' AND public.upt_is_approved() AND
 (split_part(name,'/',1)=auth.uid()::text OR public.upt_is_admin() OR EXISTS(
 SELECT 1 FROM public.incidents i WHERE i.photo_path=name AND public.upt_is_responsible(i.event_id,i.workplace_id))));
