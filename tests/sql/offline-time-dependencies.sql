-- Offline operation regression after QR attendance became authoritative.
-- Start/stop work must not be replayable offline; breaks and workplace transitions
-- for an already server-confirmed active session remain queueable and idempotent.
BEGIN;

CREATE TEMP TABLE upt_dep_ids(name text primary key, id uuid default gen_random_uuid());
INSERT INTO upt_dep_ids(name) VALUES
('staff'),('event'),('workplace'),('workplace2'),('shift'),('shift2'),('session'),
('start_op'),('break_op'),('stop_break_op'),('transition_op'),('stop_work_op');
GRANT SELECT ON upt_dep_ids TO authenticated;

INSERT INTO auth.users(id,email)
SELECT id,'offline-dependency@rollback.test'
FROM upt_dep_ids WHERE name='staff';

UPDATE public.profiles
SET approved=true, role='staff', full_name='Offline Dependency'
WHERE id=(SELECT id FROM upt_dep_ids WHERE name='staff');

INSERT INTO public.events(id,name,start_date,end_date,start_at,end_at,status)
VALUES(
 (SELECT id FROM upt_dep_ids WHERE name='event'),
 'Offline dependency rollback',
 now()-interval '1 hour',
 now()+interval '1 day',
 now()-interval '1 hour',
 now()+interval '1 day',
 'active'
);

UPDATE upt_dep_ids
SET id=(
  SELECT id FROM public.workplaces
  WHERE event_id=(SELECT id FROM upt_dep_ids WHERE name='event')
    AND name='Bar/Toog'
)
WHERE name='workplace';

INSERT INTO public.workplaces(id,event_id,name,sort_order)
VALUES(
 (SELECT id FROM upt_dep_ids WHERE name='workplace2'),
 (SELECT id FROM upt_dep_ids WHERE name='event'),
 'Second workplace',
 90
);

INSERT INTO public.event_members(event_id,user_id)
VALUES(
 (SELECT id FROM upt_dep_ids WHERE name='event'),
 (SELECT id FROM upt_dep_ids WHERE name='staff')
);

INSERT INTO public.shifts(
 id,event_id,workplace_id,user_id,role_name,start_time,end_time,
 scheduled_start,scheduled_end,status,confirmed_at,overlap_allowed
)
VALUES
(
 (SELECT id FROM upt_dep_ids WHERE name='shift'),
 (SELECT id FROM upt_dep_ids WHERE name='event'),
 (SELECT id FROM upt_dep_ids WHERE name='workplace'),
 (SELECT id FROM upt_dep_ids WHERE name='staff'),
 'Bar crew',
 now()-interval '30 minutes',now()+interval '4 hours',
 now()-interval '30 minutes',now()+interval '4 hours',
 'scheduled',now(),true
),
(
 (SELECT id FROM upt_dep_ids WHERE name='shift2'),
 (SELECT id FROM upt_dep_ids WHERE name='event'),
 (SELECT id FROM upt_dep_ids WHERE name='workplace2'),
 (SELECT id FROM upt_dep_ids WHERE name='staff'),
 'Second crew',
 now()-interval '30 minutes',now()+interval '4 hours',
 now()-interval '30 minutes',now()+interval '4 hours',
 'scheduled',now(),true
);

INSERT INTO public.work_sessions(id,event_id,user_id,shift_id,start_time,started_at,status)
VALUES(
 (SELECT id FROM upt_dep_ids WHERE name='session'),
 (SELECT id FROM upt_dep_ids WHERE name='event'),
 (SELECT id FROM upt_dep_ids WHERE name='staff'),
 (SELECT id FROM upt_dep_ids WHERE name='shift'),
 now()-interval '5 minutes',
 now()-interval '5 minutes',
 'active'
);

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_dep_ids WHERE name='staff'),true);
SET LOCAL ROLE authenticated;

DO $offline$
DECLARE
  v_result jsonb;
  v_repeat jsonb;
  v_break uuid;
BEGIN
  BEGIN
    PERFORM public.upt_sync_operation(
      (SELECT id FROM upt_dep_ids WHERE name='start_op'),
      'start_work',
      jsonb_build_object(
        'event_id',(SELECT id FROM upt_dep_ids WHERE name='event'),
        'shift_id',(SELECT id FROM upt_dep_ids WHERE name='shift')
      )
    );
    RAISE EXCEPTION 'FAIL retired offline start accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='FAIL retired offline start accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Direct werk starten is uitgeschakeld.%' THEN RAISE; END IF;
  END;

  v_result:=public.upt_sync_operation(
    (SELECT id FROM upt_dep_ids WHERE name='break_op'),
    'start_break',
    jsonb_build_object('session_id',(SELECT id FROM upt_dep_ids WHERE name='session'))
  );
  v_repeat:=public.upt_sync_operation(
    (SELECT id FROM upt_dep_ids WHERE name='break_op'),
    'start_break',
    jsonb_build_object('session_id',(SELECT id FROM upt_dep_ids WHERE name='session'))
  );
  IF v_result<>v_repeat THEN
    RAISE EXCEPTION 'FAIL repeated queued break was not idempotent';
  END IF;
  v_break:=(v_result->>'id')::uuid;

  PERFORM public.upt_sync_operation(
    (SELECT id FROM upt_dep_ids WHERE name='stop_break_op'),
    'stop_break',
    jsonb_build_object('break_operation_id',(SELECT id FROM upt_dep_ids WHERE name='break_op'))
  );

  PERFORM public.upt_sync_operation(
    (SELECT id FROM upt_dep_ids WHERE name='transition_op'),
    'transition',
    jsonb_build_object(
      'session_id',(SELECT id FROM upt_dep_ids WHERE name='session'),
      'workplace_id',(SELECT id FROM upt_dep_ids WHERE name='workplace2')
    )
  );

  BEGIN
    PERFORM public.upt_sync_operation(
      (SELECT id FROM upt_dep_ids WHERE name='stop_work_op'),
      'stop_work',
      jsonb_build_object('session_id',(SELECT id FROM upt_dep_ids WHERE name='session'))
    );
    RAISE EXCEPTION 'FAIL retired offline stop accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='FAIL retired offline stop accepted' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE 'Direct werk stoppen is uitgeschakeld.%' THEN RAISE; END IF;
  END;

  IF NOT EXISTS(
    SELECT 1 FROM public.break_sessions
    WHERE id=v_break
      AND work_session_id=(SELECT id FROM upt_dep_ids WHERE name='session')
      AND ended_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL queued break lifecycle';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.workplace_transitions
    WHERE work_session_id=(SELECT id FROM upt_dep_ids WHERE name='session')
      AND to_workplace_id=(SELECT id FROM upt_dep_ids WHERE name='workplace2')
  ) THEN
    RAISE EXCEPTION 'FAIL queued workplace transition';
  END IF;

  IF (SELECT count(*) FROM public.offline_operation_records
      WHERE id IN (
        (SELECT id FROM upt_dep_ids WHERE name='break_op'),
        (SELECT id FROM upt_dep_ids WHERE name='stop_break_op'),
        (SELECT id FROM upt_dep_ids WHERE name='transition_op')
      ))<>3 THEN
    RAISE EXCEPTION 'FAIL current offline operation records';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.offline_operation_records
    WHERE id IN (
      (SELECT id FROM upt_dep_ids WHERE name='start_op'),
      (SELECT id FROM upt_dep_ids WHERE name='stop_work_op')
    )
  ) THEN
    RAISE EXCEPTION 'FAIL retired clock action was persisted';
  END IF;
END
$offline$;

RESET ROLE;
SELECT 'PASS: QR owns work start/stop while offline break and workplace actions remain idempotent' AS result;
ROLLBACK;
