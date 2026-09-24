ALTER TABLE public.work_sessions ADD COLUMN start_gps_evidence jsonb, ADD COLUMN stop_gps_evidence jsonb;
CREATE OR REPLACE FUNCTION public.upt_gps_assessment(p_event uuid,p_lat numeric,p_lon numeric,p_accuracy numeric,p_failure text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE e public.events%ROWTYPE; distance numeric; state text;
BEGIN
 IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO e FROM public.events WHERE id=p_event;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
 IF p_lat IS NULL OR p_lon IS NULL OR p_accuracy IS NULL THEN
 RETURN jsonb_build_object('status',CASE WHEN p_failure IN ('offline','denied','unavailable') THEN p_failure ELSE 'unavailable' END,'recorded_at',now());
 END IF;
 IF p_lat NOT BETWEEN -90 AND 90 OR p_lon NOT BETWEEN -180 AND 180 OR p_accuracy<0 OR p_accuracy>100000 OR p_lat::text='NaN' OR p_lon::text='NaN' OR p_accuracy::text='NaN' THEN RAISE EXCEPTION 'Invalid GPS evidence'; END IF;
 IF e.latitude IS NULL OR e.longitude IS NULL THEN state:='not_configured';
 ELSE
 distance:=6371000*2*asin(sqrt(least(1.0,power(sin(radians((p_lat-e.latitude)::double precision)/2),2)+cos(radians(e.latitude::double precision))*cos(radians(p_lat::double precision))*power(sin(radians((p_lon-e.longitude)::double precision)/2),2))));
 state:=CASE WHEN p_accuracy>least(100,e.checkin_radius_m) THEN 'poor_accuracy' WHEN distance+p_accuracy<=e.checkin_radius_m THEN 'verified' ELSE 'outside_radius' END;
 END IF;
 RETURN jsonb_build_object('status',state,'latitude',p_lat,'longitude',p_lon,'accuracy_m',p_accuracy,'distance_m',distance,'recorded_at',now());
END $$;
REVOKE ALL ON FUNCTION public.upt_gps_assessment(uuid,numeric,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upt_gps_assessment(uuid,numeric,numeric,numeric,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.upt_sync_operation(p_id uuid, p_type text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE old public.offline_operation_records%ROWTYPE; result_value jsonb; entity uuid; workplace uuid; event uuid; evidence jsonb;
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
 WHEN 'start_break' THEN entity:=public.upt_start_break((p_payload->>'session_id')::uuid);
 WHEN 'stop_break' THEN PERFORM public.upt_stop_break((p_payload->>'break_id')::uuid);
 WHEN 'stop_work' THEN PERFORM public.upt_stop_work((p_payload->>'session_id')::uuid);
 WHEN 'transition' THEN entity:=public.upt_confirm_workplace_transition((p_payload->>'session_id')::uuid,(p_payload->>'workplace_id')::uuid);
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
 IF p_type='stop_work' THEN entity:=(p_payload->>'session_id')::uuid; END IF;
 SELECT event_id INTO event FROM public.work_sessions WHERE id=entity AND user_id=auth.uid();
 evidence:=public.upt_gps_assessment(event,(p_payload->>'latitude')::numeric,(p_payload->>'longitude')::numeric,(p_payload->>'accuracy')::numeric,p_payload->>'gps_status');
 IF p_type='start_work' THEN UPDATE public.work_sessions SET start_gps_status=evidence->>'status',start_gps_evidence=evidence WHERE id=entity;
 ELSE UPDATE public.work_sessions SET stop_gps_status=evidence->>'status',stop_gps_evidence=evidence WHERE id=entity; END IF;
 END IF;
 result_value:=jsonb_build_object('id',entity,'server_timestamp',now());
 INSERT INTO public.offline_operation_records(id,user_id,operation_type,payload,status,result,synced_at) VALUES(p_id,auth.uid(),p_type,p_payload,'synced',result_value,now());
 RETURN result_value;
END $function$
;
