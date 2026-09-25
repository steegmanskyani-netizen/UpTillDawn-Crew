-- Run in one connection. All synthetic fixtures are rolled back.
BEGIN;
CREATE TEMP TABLE upt_test_ids (name text primary key, id uuid default gen_random_uuid());
INSERT INTO upt_test_ids(name) VALUES ('admin'),('staff'),('lead'),('other'),('pending'),('event'),('bar'),('ticket'),('shift'),('session1'),('session2'),('live_session'),('ticket_session'),('checkin'),('briefing');
GRANT SELECT ON upt_test_ids TO authenticated,anon;
INSERT INTO auth.users(id) SELECT id FROM upt_test_ids WHERE name IN ('admin','staff','lead','other','pending');
UPDATE public.profiles SET approved=true,role=CASE WHEN id=(SELECT id FROM upt_test_ids WHERE name='admin') THEN 'admin' WHEN id=(SELECT id FROM upt_test_ids WHERE name='lead') THEN 'responsible_lead' ELSE 'staff' END
WHERE id IN (SELECT id FROM upt_test_ids WHERE name IN ('admin','staff','lead','other'));
INSERT INTO public.events(id,name,start_date,end_date,start_at,end_at) SELECT id,'Rollback test',now()-interval '1 day',now()+interval '1 day',now()-interval '1 day',now()+interval '1 day' FROM upt_test_ids WHERE name='event';
INSERT INTO public.workplaces(id,event_id,name) SELECT id,(SELECT id FROM upt_test_ids WHERE name='event'),name FROM upt_test_ids WHERE name IN ('bar','ticket');
INSERT INTO public.event_members(event_id,user_id) SELECT (SELECT id FROM upt_test_ids WHERE name='event'),id FROM upt_test_ids WHERE name IN ('staff','lead','other','pending');
INSERT INTO public.responsible_assignments(event_id,workplace_id,user_id) SELECT e.id,w.id,u.id FROM upt_test_ids e,upt_test_ids w,upt_test_ids u WHERE e.name='event' AND w.name='bar' AND u.name='lead';
INSERT INTO public.shifts(id,event_id,workplace_id,user_id,start_time,end_time,scheduled_start,scheduled_end,confirmed_at) SELECT s.id,e.id,w.id,u.id,now()-interval '12 hours',now()+interval '12 hours',now()-interval '12 hours',now()+interval '12 hours',now() FROM upt_test_ids s,upt_test_ids e,upt_test_ids w,upt_test_ids u WHERE s.name='shift' AND e.name='event' AND w.name='bar' AND u.name='staff';
INSERT INTO public.work_sessions(id,event_id,user_id,shift_id,start_time,started_at,end_time,ended_at,status)
SELECT s.id,e.id,u.id,sh.id,now()-interval '12 hours',now()-interval '12 hours',now()-interval '7 hours',now()-interval '7 hours','completed'
FROM upt_test_ids s,upt_test_ids e,upt_test_ids u,upt_test_ids sh WHERE s.name='session1' AND e.name='event' AND u.name='staff' AND sh.name='shift';
INSERT INTO public.work_sessions(id,event_id,user_id,shift_id,start_time,started_at,end_time,ended_at,status)
SELECT s.id,e.id,u.id,sh.id,now()-interval '6 hours',now()-interval '6 hours',now()-interval '1 hour',now()-interval '1 hour','completed'
FROM upt_test_ids s,upt_test_ids e,upt_test_ids u,upt_test_ids sh WHERE s.name='session2' AND e.name='event' AND u.name='staff' AND sh.name='shift';
INSERT INTO public.break_sessions(work_session_id,user_id,start_time,started_at,end_time,ended_at)
SELECT s.id,u.id,now()-interval '11 hours',now()-interval '11 hours',now()-interval '10 hours',now()-interval '10 hours' FROM upt_test_ids s,upt_test_ids u WHERE s.name='session1' AND u.name='staff';
INSERT INTO public.break_sessions(work_session_id,user_id,start_time,started_at,end_time,ended_at)
SELECT s.id,u.id,now()-interval '5 hours',now()-interval '5 hours',now()-interval '4 hours 45 minutes',now()-interval '4 hours 45 minutes' FROM upt_test_ids s,upt_test_ids u WHERE s.name='session2' AND u.name='staff';
INSERT INTO public.work_sessions(id,event_id,user_id,start_time,started_at) SELECT s.id,e.id,u.id,now(),now() FROM upt_test_ids s,upt_test_ids e,upt_test_ids u WHERE s.name='ticket_session' AND e.name='event' AND u.name='other';
INSERT INTO public.check_ins(id,event_id,workplace_id,user_id,type,status) SELECT c.id,e.id,w.id,u.id,'check-in','pending' FROM upt_test_ids c,upt_test_ids e,upt_test_ids w,upt_test_ids u WHERE c.name='checkin' AND e.name='event' AND w.name='ticket' AND u.name='other';
INSERT INTO public.briefings(id,event_id,title,body) SELECT b.id,e.id,'Test briefing','Test body' FROM upt_test_ids b,upt_test_ids e WHERE b.name='briefing' AND e.name='event';
UPDATE public.events SET latitude=50,longitude=4,checkin_radius_m=100 WHERE id=(SELECT id FROM upt_test_ids WHERE name='event');
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_test_ids WHERE name='staff'),true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE a record; b record; BEGIN
 PERFORM public.upt_acknowledge_briefing((SELECT id FROM upt_test_ids WHERE name='briefing'));
 IF NOT EXISTS(SELECT 1 FROM public.briefing_acknowledgements WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'FAIL briefing acknowledgement'; END IF;
 IF (SELECT count(*) FROM public.profiles)<>1 THEN RAISE EXCEPTION 'FAIL profile isolation'; END IF;
 BEGIN
 UPDATE public.profiles SET role='admin' WHERE id=auth.uid();
 RAISE EXCEPTION 'FAIL self promotion permitted';
 EXCEPTION WHEN raise_exception OR insufficient_privilege THEN IF SQLERRM='FAIL self promotion permitted' THEN RAISE; END IF; END;
 SELECT * INTO a FROM public.upt_work_session_time_summary((SELECT id FROM upt_test_ids WHERE name='session1'));
 SELECT * INTO b FROM public.upt_work_session_time_summary((SELECT id FROM upt_test_ids WHERE name='session2'));
 IF a.net_payable_seconds+b.net_payable_seconds<>35100 OR b.excess_break_seconds<>900 THEN RAISE EXCEPTION 'FAIL split-session break allowance'; END IF;
 BEGIN
 PERFORM public.upt_decide_check_in((SELECT id FROM upt_test_ids WHERE name='checkin'),true,null);
 RAISE EXCEPTION 'FAIL staff approved check-in';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL staff approved check-in' THEN RAISE; END IF; END;
 IF has_function_privilege('authenticated','public.upt_start_work(uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.upt_stop_work(uuid)','EXECUTE') THEN
   RAISE EXCEPTION 'FAIL direct work clock RPC still executable';
 END IF;
 IF has_function_privilege(
      'authenticated',
      'public.upt_request_check_in(uuid,uuid,boolean,text,numeric,numeric,numeric,text)',
      'EXECUTE'
    )
    OR has_function_privilege(
      'authenticated',
      'public.upt_request_check_out(uuid,text)',
      'EXECUTE'
    ) THEN
   RAISE EXCEPTION 'FAIL retired pre-QR attendance RPC still executable';
 END IF;
END $$;
DO $$ DECLARE operation uuid:=gen_random_uuid(); payload jsonb; first_result jsonb; second_result jsonb; BEGIN
 payload:=jsonb_build_object('event_id',(SELECT id FROM upt_test_ids WHERE name='event'),'message','Rollback incident');
 first_result:=public.upt_sync_operation(operation,'incident',payload);
 second_result:=public.upt_sync_operation(operation,'incident',payload);
 IF first_result<>second_result OR (SELECT count(*) FROM public.incidents WHERE id=(first_result->>'id')::uuid)<>1 THEN RAISE EXCEPTION 'FAIL idempotent replay'; END IF;
 BEGIN
 PERFORM public.upt_sync_operation(operation,'incident',payload||jsonb_build_object('message','changed'));
 RAISE EXCEPTION 'FAIL operation ID reuse';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Operation ID conflict' THEN RAISE; END IF; END;
 IF (public.upt_gps_assessment((SELECT id FROM upt_test_ids WHERE name='event'),50,4,5,null)->>'status')<>'verified' THEN RAISE EXCEPTION 'FAIL inside geofence'; END IF;
 IF (public.upt_gps_assessment((SELECT id FROM upt_test_ids WHERE name='event'),51,4,5,null)->>'status')<>'outside_radius' THEN RAISE EXCEPTION 'FAIL outside geofence'; END IF;
 IF (public.upt_gps_assessment((SELECT id FROM upt_test_ids WHERE name='event'),50,4,200,null)->>'status')<>'poor_accuracy' THEN RAISE EXCEPTION 'FAIL GPS accuracy'; END IF;
 BEGIN
 PERFORM national_register_number FROM public.profiles WHERE id=auth.uid();
 RAISE EXCEPTION 'FAIL staff sensitive column read';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_test_ids WHERE name='lead'),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.work_sessions WHERE id=(SELECT id FROM upt_test_ids WHERE name='ticket_session')) THEN RAISE EXCEPTION 'FAIL lead sees unrelated session'; END IF;
 IF EXISTS(SELECT 1 FROM public.check_ins WHERE id=(SELECT id FROM upt_test_ids WHERE name='checkin')) THEN RAISE EXCEPTION 'FAIL lead sees unrelated check-in'; END IF;
 BEGIN
 PERFORM public.upt_decide_check_in((SELECT id FROM upt_test_ids WHERE name='checkin'),true,null);
 RAISE EXCEPTION 'FAIL lead approved unrelated workplace';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='FAIL lead approved unrelated workplace' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_test_ids WHERE name='pending'),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.events) THEN RAISE EXCEPTION 'FAIL unapproved reads events'; END IF;
 BEGIN
 PERFORM public.upt_qr_request();
 RAISE EXCEPTION 'FAIL unapproved QR request';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM='FAIL unapproved QR request' THEN RAISE; END IF;
   IF SQLERRM<>'ACCOUNT NOT APPROVED' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
DO $$ BEGIN
 IF has_function_privilege('anon','public.upt_start_work(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'FAIL anonymous RPC privilege'; END IF;
 IF has_table_privilege('anon','public.profiles','TRUNCATE') OR has_table_privilege('authenticated','public.profiles','TRUNCATE') THEN RAISE EXCEPTION 'FAIL truncate privilege'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_test_ids WHERE name='staff'),true);
SET LOCAL ROLE authenticated;
SELECT set_config(
 'upt.test.checkin',
 (public.upt_qr_request(false,true,null)->>'request_id'),
 true
);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_test_ids WHERE name='admin'),true);
SET LOCAL ROLE authenticated;
SELECT public.upt_decide_check_in(current_setting('upt.test.checkin')::uuid,true,null);
SELECT set_config(
 'upt.test.live_session',
 (SELECT work_session_id::text
  FROM public.check_ins
  WHERE id=current_setting('upt.test.checkin')::uuid),
 true
);
DO $ DECLARE copy_id uuid; BEGIN
 copy_id:=public.upt_duplicate_event((SELECT id FROM upt_test_ids WHERE name='event'),'Configuration copy',now()+interval '2 days',now()+interval '3 days');
 IF EXISTS(SELECT 1 FROM public.work_sessions WHERE event_id=copy_id) OR EXISTS(SELECT 1 FROM public.check_ins WHERE event_id=copy_id) OR EXISTS(SELECT 1 FROM public.incidents WHERE event_id=copy_id) THEN RAISE EXCEPTION 'FAIL historical data copied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.briefings WHERE event_id=copy_id) THEN RAISE EXCEPTION 'FAIL briefing configuration not copied'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_test_ids WHERE name='staff'),true);
SET LOCAL ROLE authenticated;
DO $clock$ DECLARE operation uuid:=gen_random_uuid(); pause_id uuid; BEGIN
 BEGIN
   PERFORM public.upt_sync_operation(
     operation,
     'start_work',
     jsonb_build_object('event_id',(SELECT id FROM upt_test_ids WHERE name='event'),'shift_id',(SELECT id FROM upt_test_ids WHERE name='shift'))
   );
   RAISE EXCEPTION 'FAIL offline start bypass';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='FAIL offline start bypass' THEN RAISE; END IF;
   IF SQLERRM NOT LIKE 'Direct werk starten is uitgeschakeld.%' THEN RAISE; END IF;
 END;
 pause_id:=(public.upt_sync_operation(
   gen_random_uuid(),
   'start_break',
   jsonb_build_object('session_id',current_setting('upt.test.live_session')::uuid)
 )->>'id')::uuid;
 PERFORM public.upt_sync_operation(gen_random_uuid(),'stop_break',jsonb_build_object('break_id',pause_id));
 IF NOT EXISTS(SELECT 1 FROM public.break_sessions WHERE id=pause_id AND ended_at IS NOT NULL) THEN
   RAISE EXCEPTION 'FAIL queued break lifecycle';
 END IF;
 BEGIN
   PERFORM public.upt_sync_operation(
     gen_random_uuid(),
     'stop_work',
     jsonb_build_object('session_id',(SELECT id FROM upt_test_ids WHERE name='live_session'))
   );
   RAISE EXCEPTION 'FAIL offline stop bypass';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='FAIL offline stop bypass' THEN RAISE; END IF;
   IF SQLERRM NOT LIKE 'Direct werk stoppen is uitgeschakeld.%' THEN RAISE; END IF;
 END;
END
$clock$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.work_sessions SET started_at=now()-interval '80 minutes',start_time=now()-interval '80 minutes' WHERE id=(SELECT id FROM upt_test_ids WHERE name='ticket_session');
INSERT INTO public.break_sessions(work_session_id,user_id,started_at,start_time) SELECT s.id,u.id,now()-interval '71 minutes',now()-interval '71 minutes' FROM upt_test_ids s,upt_test_ids u WHERE s.name='ticket_session' AND u.name='other';
SELECT upt_private.notify_break_allowance();
SELECT upt_private.notify_break_allowance();
DO $$ BEGIN
 IF (SELECT count(*) FROM upt_private.break_warning_receipts WHERE user_id=(SELECT id FROM upt_test_ids WHERE name='other'))<>2 THEN RAISE EXCEPTION 'FAIL break warning deduplication'; END IF;
END $$;
SELECT 'PASS: profile isolation, self-promotion denial, 10h/75min=9h45 across sessions, staff approval denial, direct clock bypass denial, QR approval gate, lead session isolation, lead check-in isolation, cross-workplace approval denial, pending read/mutation denial, anonymous RPC denial, truncate denial, idempotent replay, operation ID conflict, GPS radius/accuracy, sensitive column denial, briefing acknowledgement, event duplication without history, QR-owned work start/stop, queued break lifecycle, scheduled warning deduplication' AS result;
ROLLBACK;
