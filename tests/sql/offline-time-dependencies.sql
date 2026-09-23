-- Ordered offline time-action dependency regression test.
-- Later queued actions may reference the server entity created by an earlier
-- queued operation instead of requiring that entity ID to exist on the device.
BEGIN;

CREATE TEMP TABLE upt_dep_ids(name text primary key, id uuid default gen_random_uuid());
INSERT INTO upt_dep_ids(name) VALUES
('staff'),('event'),('workplace'),('shift'),('checkin'),('start_op'),('break_op'),('stop_break_op'),('stop_work_op');
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

INSERT INTO public.event_members(event_id,user_id)
VALUES(
 (SELECT id FROM upt_dep_ids WHERE name='event'),
 (SELECT id FROM upt_dep_ids WHERE name='staff')
);

INSERT INTO public.shifts(
 id,event_id,workplace_id,user_id,role_name,start_time,end_time,scheduled_start,scheduled_end,status
)
VALUES(
 (SELECT id FROM upt_dep_ids WHERE name='shift'),
 (SELECT id FROM upt_dep_ids WHERE name='event'),
 (SELECT id FROM upt_dep_ids WHERE name='workplace'),
 (SELECT id FROM upt_dep_ids WHERE name='staff'),
 'Bar crew',
 now()-interval '30 minutes',
 now()+interval '4 hours',
 now()-interval '30 minutes',
 now()+interval '4 hours',
 'scheduled'
);

INSERT INTO public.check_ins(
 id,user_id,event_id,workplace_id,type,status,remote,requested_at,decided_at
)
VALUES(
 (SELECT id FROM upt_dep_ids WHERE name='checkin'),
 (SELECT id FROM upt_dep_ids WHERE name='staff'),
 (SELECT id FROM upt_dep_ids WHERE name='event'),
 (SELECT id FROM upt_dep_ids WHERE name='workplace'),
 'onsite',
 'approved',
 false,
 now()-interval '10 minutes',
 now()-interval '9 minutes'
);

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_dep_ids WHERE name='staff'),true);
SET LOCAL ROLE authenticated;

SELECT public.upt_sync_operation(
 (SELECT id FROM upt_dep_ids WHERE name='start_op'),
 'start_work',
 jsonb_build_object(
   'event_id',(SELECT id FROM upt_dep_ids WHERE name='event'),
   'shift_id',(SELECT id FROM upt_dep_ids WHERE name='shift'),
   'gps_status','offline'
 )
);

SELECT public.upt_sync_operation(
 (SELECT id FROM upt_dep_ids WHERE name='break_op'),
 'start_break',
 jsonb_build_object(
   'session_operation_id',(SELECT id FROM upt_dep_ids WHERE name='start_op')
 )
);

SELECT public.upt_sync_operation(
 (SELECT id FROM upt_dep_ids WHERE name='stop_break_op'),
 'stop_break',
 jsonb_build_object(
   'break_operation_id',(SELECT id FROM upt_dep_ids WHERE name='break_op')
 )
);

SELECT public.upt_sync_operation(
 (SELECT id FROM upt_dep_ids WHERE name='stop_work_op'),
 'stop_work',
 jsonb_build_object(
   'session_operation_id',(SELECT id FROM upt_dep_ids WHERE name='start_op'),
   'gps_status','offline'
 )
);

DO $$
DECLARE
  v_session uuid;
  v_break uuid;
BEGIN
  SELECT (result->>'id')::uuid INTO v_session
  FROM public.offline_operation_records
  WHERE id=(SELECT id FROM upt_dep_ids WHERE name='start_op');

  SELECT (result->>'id')::uuid INTO v_break
  FROM public.offline_operation_records
  WHERE id=(SELECT id FROM upt_dep_ids WHERE name='break_op');

  IF v_session IS NULL OR v_break IS NULL THEN
    RAISE EXCEPTION 'FAIL dependency result IDs';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.work_sessions
    WHERE id=v_session
      AND ended_at IS NOT NULL
      AND start_gps_status='offline'
      AND stop_gps_status='offline'
  ) THEN
    RAISE EXCEPTION 'FAIL dependent work lifecycle';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.break_sessions
    WHERE id=v_break
      AND work_session_id=v_session
      AND ended_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL dependent break lifecycle';
  END IF;

  IF (SELECT count(*) FROM public.offline_operation_records
      WHERE id IN (
        (SELECT id FROM upt_dep_ids WHERE name='start_op'),
        (SELECT id FROM upt_dep_ids WHERE name='break_op'),
        (SELECT id FROM upt_dep_ids WHERE name='stop_break_op'),
        (SELECT id FROM upt_dep_ids WHERE name='stop_work_op')
      )) <> 4 THEN
    RAISE EXCEPTION 'FAIL dependency operation records';
  END IF;
END $$;

RESET ROLE;
SELECT 'PASS: queued start-work/start-break/stop-break/stop-work dependency chain' AS result;
ROLLBACK;
