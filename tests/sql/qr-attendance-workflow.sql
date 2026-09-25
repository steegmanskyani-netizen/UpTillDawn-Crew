-- QR attendance workflow regression for the confirmed production rules.
-- Synthetic data only; everything is rolled back.
BEGIN;

CREATE TEMP TABLE qr_ids(name text primary key, id uuid default gen_random_uuid());
INSERT INTO qr_ids(name) VALUES
 ('staff_early'),('staff_ten'),('staff_stop'),('staff_remote'),('staff_contact'),
 ('lead'),('admin'),('event'),('wp'),
 ('shift_early_1'),('shift_early_2'),('shift_ten'),('shift_stop'),('shift_remote'),('shift_contact'),('shift_lead');
GRANT SELECT ON qr_ids TO authenticated;

INSERT INTO auth.users(id,email)
SELECT id,name||'@qr-regression.test'
FROM qr_ids
WHERE name IN ('staff_early','staff_ten','staff_stop','staff_remote','staff_contact','lead','admin');

UPDATE public.profiles p
SET approved=true,
    role=CASE
      WHEN i.name='lead' THEN 'responsible_lead'
      WHEN i.name='admin' THEN 'admin'
      ELSE 'staff'
    END,
    full_name='QR '||i.name
FROM qr_ids i
WHERE p.id=i.id
  AND i.name IN ('staff_early','staff_ten','staff_stop','staff_remote','staff_contact','lead','admin');

INSERT INTO public.events(id,name,start_date,end_date,start_at,end_at,status)
VALUES(
 (SELECT id FROM qr_ids WHERE name='event'),
 'QR regression event',
 now()-interval '1 hour',now()+interval '6 hours',
 now()-interval '1 hour',now()+interval '6 hours',
 'active'
);

INSERT INTO public.workplaces(id,event_id,name,sort_order)
VALUES(
 (SELECT id FROM qr_ids WHERE name='wp'),
 (SELECT id FROM qr_ids WHERE name='event'),
 'QR workplace',
 10
);

INSERT INTO public.event_members(event_id,user_id,event_role)
SELECT
 (SELECT id FROM qr_ids WHERE name='event'),
 i.id,
 CASE WHEN i.name='lead' THEN 'responsible_lead' ELSE 'employee' END
FROM qr_ids i
WHERE i.name IN ('staff_early','staff_ten','staff_stop','staff_remote','staff_contact','lead');

INSERT INTO public.shifts(
 id,event_id,workplace_id,user_id,role_name,
 start_time,end_time,scheduled_start,scheduled_end,status,confirmed_at
)
VALUES
(
 (SELECT id FROM qr_ids WHERE name='shift_early_1'),
 (SELECT id FROM qr_ids WHERE name='event'),
 (SELECT id FROM qr_ids WHERE name='wp'),
 (SELECT id FROM qr_ids WHERE name='staff_early'),
 'Personeel',
 now()+interval '20 minutes',now()+interval '2 hours',
 now()+interval '20 minutes',now()+interval '2 hours','scheduled',now()
),
(
 (SELECT id FROM qr_ids WHERE name='shift_early_2'),
 (SELECT id FROM qr_ids WHERE name='event'),
 (SELECT id FROM qr_ids WHERE name='wp'),
 (SELECT id FROM qr_ids WHERE name='staff_early'),
 'Personeel',
 now()+interval '30 minutes',now()+interval '3 hours',
 now()+interval '30 minutes',now()+interval '3 hours','scheduled',now()
),
(
 (SELECT id FROM qr_ids WHERE name='shift_ten'),
 (SELECT id FROM qr_ids WHERE name='event'),
 (SELECT id FROM qr_ids WHERE name='wp'),
 (SELECT id FROM qr_ids WHERE name='staff_ten'),
 'Personeel',
 now()+interval '5 minutes',now()+interval '2 hours',
 now()+interval '5 minutes',now()+interval '2 hours','scheduled',now()
),
(
 (SELECT id FROM qr_ids WHERE name='shift_stop'),
 (SELECT id FROM qr_ids WHERE name='event'),
 (SELECT id FROM qr_ids WHERE name='wp'),
 (SELECT id FROM qr_ids WHERE name='staff_stop'),
 'Personeel',
 now()-interval '30 minutes',now()+interval '2 hours',
 now()-interval '30 minutes',now()+interval '2 hours','scheduled',now()
),
(
 (SELECT id FROM qr_ids WHERE name='shift_remote'),
 (SELECT id FROM qr_ids WHERE name='event'),
 (SELECT id FROM qr_ids WHERE name='wp'),
 (SELECT id FROM qr_ids WHERE name='staff_remote'),
 'Personeel',
 now()+interval '5 minutes',now()+interval '2 hours',
 now()+interval '5 minutes',now()+interval '2 hours','scheduled',now()
),
(
 (SELECT id FROM qr_ids WHERE name='shift_contact'),
 (SELECT id FROM qr_ids WHERE name='event'),
 (SELECT id FROM qr_ids WHERE name='wp'),
 (SELECT id FROM qr_ids WHERE name='staff_contact'),
 'Personeel',
 now()+interval '5 minutes',now()+interval '2 hours',
 now()+interval '5 minutes',now()+interval '2 hours','scheduled',now()
),
(
 (SELECT id FROM qr_ids WHERE name='shift_lead'),
 (SELECT id FROM qr_ids WHERE name='event'),
 (SELECT id FROM qr_ids WHERE name='wp'),
 (SELECT id FROM qr_ids WHERE name='lead'),
 'Verantwoordelijke',
 now()-interval '30 minutes',now()+interval '3 hours',
 now()-interval '30 minutes',now()+interval '3 hours','scheduled',now()
);

INSERT INTO public.responsible_assignments(event_id,workplace_id,user_id)
VALUES(
 (SELECT id FROM qr_ids WHERE name='event'),
 (SELECT id FROM qr_ids WHERE name='wp'),
 (SELECT id FROM qr_ids WHERE name='lead')
);

INSERT INTO public.work_sessions(event_id,user_id,shift_id,start_time,started_at,status)
VALUES
(
 (SELECT id FROM qr_ids WHERE name='event'),
 (SELECT id FROM qr_ids WHERE name='lead'),
 (SELECT id FROM qr_ids WHERE name='shift_lead'),
 now()-interval '20 minutes',now()-interval '20 minutes','active'
),
(
 (SELECT id FROM qr_ids WHERE name='event'),
 (SELECT id FROM qr_ids WHERE name='staff_stop'),
 (SELECT id FROM qr_ids WHERE name='shift_stop'),
 now()-interval '20 minutes',now()-interval '20 minutes','active'
);

-- Rule 2 + Rule 3 (>10 minutes early): choose the first upcoming valid shift,
-- use the request moment as effective start, and retain the early-start reason.
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM qr_ids WHERE name='staff_early'),true);
SET LOCAL ROLE authenticated;
DO $qr$
DECLARE
  v_result jsonb;
  v_request uuid;
  v_row public.check_ins%rowtype;
BEGIN
  v_result:=public.upt_qr_request(false,true,'QR regression early reason');
  IF v_result->>'action'<>'requested' THEN
    RAISE EXCEPTION 'FAIL early start request action: %',v_result;
  END IF;
  v_request:=(v_result->>'request_id')::uuid;
  SELECT * INTO v_row FROM public.check_ins WHERE id=v_request;
  IF v_row.shift_id<>(SELECT id FROM qr_ids WHERE name='shift_early_1') THEN
    RAISE EXCEPTION 'FAIL first upcoming shift was not selected';
  END IF;
  IF v_row.effective_start_at IS DISTINCT FROM v_row.requested_at THEN
    RAISE EXCEPTION 'FAIL >10 minute early start should use request moment';
  END IF;
  IF v_row.early_reason<>'QR regression early reason' THEN
    RAISE EXCEPTION 'FAIL early reason was not retained';
  END IF;
END
$qr$;
RESET ROLE;

-- Rule 3 (<=10 minutes before shift): effective start is corrected to scheduled start.
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM qr_ids WHERE name='staff_ten'),true);
SET LOCAL ROLE authenticated;
DO $qr$
DECLARE
  v_result jsonb;
  v_request uuid;
  v_effective timestamptz;
  v_scheduled timestamptz;
BEGIN
  v_result:=public.upt_qr_request(false,true,null);
  IF v_result->>'action'<>'requested' THEN
    RAISE EXCEPTION 'FAIL <=10 minute request action: %',v_result;
  END IF;
  v_request:=(v_result->>'request_id')::uuid;
  SELECT ci.effective_start_at,s.scheduled_start
  INTO v_effective,v_scheduled
  FROM public.check_ins ci
  JOIN public.shifts s ON s.id=ci.shift_id
  WHERE ci.id=v_request;
  IF v_effective IS DISTINCT FROM v_scheduled THEN
    RAISE EXCEPTION 'FAIL <=10 minute start was not corrected to shift start';
  END IF;
END
$qr$;
RESET ROLE;

-- Rule 4: stop request records the request moment and approval closes the timer at that moment.
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM qr_ids WHERE name='staff_stop'),true);
SET LOCAL ROLE authenticated;
DO $qr$
DECLARE
  v_result jsonb;
  v_request uuid;
  v_requested timestamptz;
  v_effective timestamptz;
BEGIN
  v_result:=public.upt_qr_request(false,true,null);
  IF v_result->>'action'<>'requested' OR v_result->>'kind'<>'stop' THEN
    RAISE EXCEPTION 'FAIL stop request action: %',v_result;
  END IF;
  v_request:=(v_result->>'request_id')::uuid;
  SELECT requested_at,effective_end_at INTO v_requested,v_effective
  FROM public.check_outs WHERE id=v_request;
  IF v_effective IS DISTINCT FROM v_requested THEN
    RAISE EXCEPTION 'FAIL stop effective time differs from request moment';
  END IF;
  PERFORM set_config('qr.stop_request',v_request::text,true);
END
$qr$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM qr_ids WHERE name='admin'),true);
SET LOCAL ROLE authenticated;
DO $qr$
DECLARE
  v_request uuid:=current_setting('qr.stop_request')::uuid;
  v_end timestamptz;
  v_requested timestamptz;
BEGIN
  PERFORM public.upt_decide_check_out(v_request,true,null);
  SELECT co.requested_at,ws.ended_at
  INTO v_requested,v_end
  FROM public.check_outs co
  JOIN public.work_sessions ws ON ws.id=co.work_session_id
  WHERE co.id=v_request;
  IF v_end IS DISTINCT FROM v_requested THEN
    RAISE EXCEPTION 'FAIL approved stop did not end at request moment';
  END IF;
END
$qr$;
RESET ROLE;

-- Rule 5: if a Responsible is active, "no contact" requires a remote request
-- and that remote request is still routed to the Responsible.
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM qr_ids WHERE name='staff_remote'),true);
SET LOCAL ROLE authenticated;
DO $qr$
DECLARE
  v_result jsonb;
  v_request uuid;
  v_remote boolean;
  v_reviewer text;
BEGIN
  v_result:=public.upt_qr_request(false,false,null);
  IF v_result->>'action'<>'remote_required' OR v_result->>'reviewer'<>'responsible' THEN
    RAISE EXCEPTION 'FAIL remote escalation routing: %',v_result;
  END IF;

  v_result:=public.upt_qr_request(false,true,null);
  IF v_result->>'action'<>'requested' OR v_result->>'reviewer'<>'responsible' THEN
    RAISE EXCEPTION 'FAIL remote request reviewer: %',v_result;
  END IF;
  v_request:=(v_result->>'request_id')::uuid;
  SELECT remote,reviewer_kind INTO v_remote,v_reviewer
  FROM public.check_ins WHERE id=v_request;
  IF NOT v_remote OR v_reviewer<>'responsible' THEN
    RAISE EXCEPTION 'FAIL remote request was not persisted for Responsible review';
  END IF;
END
$qr$;
RESET ROLE;

-- Contact succeeded: normal request is routed to the Responsible without the remote flag.
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM qr_ids WHERE name='staff_contact'),true);
SET LOCAL ROLE authenticated;
DO $qr$
DECLARE
  v_result jsonb;
  v_request uuid;
  v_remote boolean;
  v_reviewer text;
BEGIN
  v_result:=public.upt_qr_request(true,false,null);
  IF v_result->>'action'<>'requested' OR v_result->>'reviewer'<>'responsible' THEN
    RAISE EXCEPTION 'FAIL contacted Responsible routing: %',v_result;
  END IF;
  v_request:=(v_result->>'request_id')::uuid;
  SELECT remote,reviewer_kind INTO v_remote,v_reviewer
  FROM public.check_ins WHERE id=v_request;
  IF v_remote OR v_reviewer<>'responsible' THEN
    RAISE EXCEPTION 'FAIL contacted request persistence';
  END IF;
END
$qr$;
RESET ROLE;

SELECT 'PASS: permanent QR workflow semantics, first upcoming shift, 10-minute start rule, request-time stop and Responsible remote routing' AS result;
ROLLBACK;
