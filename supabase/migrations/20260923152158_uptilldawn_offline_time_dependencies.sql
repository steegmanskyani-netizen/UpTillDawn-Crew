-- Support ordered offline work/break sequences when a later action depends on the
-- server entity created by an earlier queued operation. Dependency IDs refer to
-- immutable offline_operation_records owned by the same authenticated user.

CREATE OR REPLACE FUNCTION public.upt_sync_operation(p_id uuid, p_type text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE old public.offline_operation_records%ROWTYPE; result_value jsonb; entity uuid; workplace uuid; event uuid; evidence jsonb; session_ref uuid; break_ref uuid;
BEGIN
 IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'ACCOUNT NOT APPROVED'; END IF;
 IF p_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR octet_length(p_payload::text)>20000 THEN RAISE EXCEPTION 'Invalid operation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO old FROM public.offline_operation_records WHERE id=p_id;
 IF FOUND THEN
 IF old.user_id<>auth.uid() OR old.operation_type<>p_type OR old.payload<>p_payload THEN RAISE EXCEPTION 'Operation ID conflict'; END IF;
 RETURN old.result;
 END IF;
 CASE p_type
 WHEN 'start_work' THEN entity:=public.upt_start_work((p_payload->>'event_id')::uuid,(p_payload->>'shift_id')::uuid);
 WHEN 'start_break' THEN
   session_ref:=nullif(p_payload->>'session_id','')::uuid;
   IF session_ref IS NULL AND nullif(p_payload->>'session_operation_id','') IS NOT NULL THEN
     SELECT (r.result->>'id')::uuid INTO session_ref
     FROM public.offline_operation_records r
     WHERE r.id=(p_payload->>'session_operation_id')::uuid
       AND r.user_id=auth.uid()
       AND r.operation_type='start_work';
   END IF;
   IF session_ref IS NULL THEN RAISE EXCEPTION 'Missing work-session dependency'; END IF;
   entity:=public.upt_start_break(session_ref);
 WHEN 'stop_break' THEN
   break_ref:=nullif(p_payload->>'break_id','')::uuid;
   IF break_ref IS NULL AND nullif(p_payload->>'break_operation_id','') IS NOT NULL THEN
     SELECT (r.result->>'id')::uuid INTO break_ref
     FROM public.offline_operation_records r
     WHERE r.id=(p_payload->>'break_operation_id')::uuid
       AND r.user_id=auth.uid()
       AND r.operation_type='start_break';
   END IF;
   IF break_ref IS NULL THEN RAISE EXCEPTION 'Missing break dependency'; END IF;
   PERFORM public.upt_stop_break(break_ref);
 WHEN 'stop_work' THEN
   session_ref:=nullif(p_payload->>'session_id','')::uuid;
   IF session_ref IS NULL AND nullif(p_payload->>'session_operation_id','') IS NOT NULL THEN
     SELECT (r.result->>'id')::uuid INTO session_ref
     FROM public.offline_operation_records r
     WHERE r.id=(p_payload->>'session_operation_id')::uuid
       AND r.user_id=auth.uid()
       AND r.operation_type='start_work';
   END IF;
   IF session_ref IS NULL THEN RAISE EXCEPTION 'Missing work-session dependency'; END IF;
   PERFORM public.upt_stop_work(session_ref);
   entity:=session_ref;
 WHEN 'transition' THEN
   session_ref:=nullif(p_payload->>'session_id','')::uuid;
   IF session_ref IS NULL AND nullif(p_payload->>'session_operation_id','') IS NOT NULL THEN
     SELECT (r.result->>'id')::uuid INTO session_ref
     FROM public.offline_operation_records r
     WHERE r.id=(p_payload->>'session_operation_id')::uuid
       AND r.user_id=auth.uid()
       AND r.operation_type='start_work';
   END IF;
   IF session_ref IS NULL THEN RAISE EXCEPTION 'Missing work-session dependency'; END IF;
   entity:=public.upt_confirm_workplace_transition(session_ref,(p_payload->>'workplace_id')::uuid);
 WHEN 'task' THEN PERFORM public.upt_update_task_status((p_payload->>'assignment_id')::uuid,p_payload->>'status');
 WHEN 'message' THEN
 IF NOT public.upt_can_read_channel((p_payload->>'channel_id')::uuid) OR length(trim(coalesce(p_payload->>'body',''))) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Invalid message'; END IF;
 INSERT INTO public.messages(user_id,sender_id,channel_id,body,content) VALUES(auth.uid(),auth.uid(),(p_payload->>'channel_id')::uuid,trim(p_payload->>'body'),trim(p_payload->>'body')) RETURNING id INTO entity;
 WHEN 'incident' THEN
 event:=(p_payload->>'event_id')::uuid; workplace:=nullif(p_payload->>'workplace_id','')::uuid;
 IF length(trim(coalesce(p_payload->>'message',''))) NOT BETWEEN 1 AND 4000 OR NOT EXISTS(SELECT 1 FROM public.event_members m WHERE m.user_id=auth.uid() AND m.event_id=event) THEN RAISE EXCEPTION 'Invalid incident'; END IF;
 IF workplace IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.shifts s WHERE s.event_id=event AND s.workplace_id=workplace AND s.user_id=auth.uid()) THEN RAISE EXCEPTION 'Invalid workplace'; END IF;
 INSERT INTO public.incidents(user_id,reporter_id,event_id,workplace_id,message,description,latitude,longitude,gps_accuracy_m)
 VALUES(auth.uid(),auth.uid(),event,workplace,trim(p_payload->>'message'),trim(p_payload->>'message'),(p_payload->>'latitude')::numeric,(p_payload->>'longitude')::numeric,(p_payload->>'accuracy')::numeric) RETURNING id INTO entity;
 INSERT INTO public.crew_notifications(user_id,title,body,kind)
 SELECT DISTINCT p.id,'URGENT',entity::text,'incident' FROM public.profiles p WHERE p.approved AND (p.role='admin' OR EXISTS(SELECT 1 FROM public.responsible_assignments r WHERE r.user_id=p.id AND r.event_id=event AND (workplace IS NULL OR r.workplace_id=workplace)));
 INSERT INTO public.upt_audit_logs(actor_id,action,entity_type,entity_id) VALUES(auth.uid(),'URGENT','incidents',entity);
 ELSE RAISE EXCEPTION 'Unsupported operation';
 END CASE;
 IF p_type IN ('start_work','stop_work') THEN
 IF p_type='stop_work' AND entity IS NULL THEN entity:=nullif(p_payload->>'session_id','')::uuid; END IF;
 SELECT event_id INTO event FROM public.work_sessions WHERE id=entity AND user_id=auth.uid();
 evidence:=public.upt_gps_assessment(event,(p_payload->>'latitude')::numeric,(p_payload->>'longitude')::numeric,(p_payload->>'accuracy')::numeric,p_payload->>'gps_status');
 IF p_type='start_work' THEN UPDATE public.work_sessions SET start_gps_status=evidence->>'status',start_gps_evidence=evidence WHERE id=entity;
 ELSE UPDATE public.work_sessions SET stop_gps_status=evidence->>'status',stop_gps_evidence=evidence WHERE id=entity; END IF;
 END IF;
 result_value:=jsonb_build_object('id',entity,'server_timestamp',now());
 INSERT INTO public.offline_operation_records(id,user_id,operation_type,payload,status,result,synced_at) VALUES(p_id,auth.uid(),p_type,p_payload,'synced',result_value,now());
 RETURN result_value;
END $function$

