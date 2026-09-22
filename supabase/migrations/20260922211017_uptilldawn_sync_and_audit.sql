CREATE OR REPLACE FUNCTION public.upt_can_read_channel(p_channel uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.upt_is_approved() AND EXISTS(SELECT 1 FROM public.chat_channels c WHERE c.id=p_channel AND (
 public.upt_is_admin() OR EXISTS(SELECT 1 FROM public.chat_members m WHERE m.channel_id=c.id AND m.user_id=auth.uid())
 OR c.kind='organization'
 OR (c.kind='event' AND EXISTS(SELECT 1 FROM public.event_members m WHERE m.event_id=c.event_id AND m.user_id=auth.uid()))
 OR (c.kind='workplace' AND (public.upt_is_responsible(c.event_id,c.workplace_id) OR EXISTS(SELECT 1 FROM public.shifts s WHERE s.event_id=c.event_id AND s.workplace_id=c.workplace_id AND s.user_id=auth.uid() AND s.status<>'cancelled')))))
$$;
REVOKE ALL ON FUNCTION public.upt_can_read_channel(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upt_can_read_channel(uuid) TO authenticated;
DROP POLICY chat_channels_read ON public.chat_channels;
CREATE POLICY chat_channels_read ON public.chat_channels FOR SELECT TO authenticated USING(public.upt_can_read_channel(id));
DROP POLICY messages_read ON public.messages;
CREATE POLICY messages_read ON public.messages FOR SELECT TO authenticated USING(public.upt_can_read_channel(channel_id));
DROP POLICY messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages FOR INSERT TO authenticated WITH CHECK(sender_id=auth.uid() AND user_id=auth.uid() AND public.upt_can_read_channel(channel_id));
DROP POLICY message_attachments_read ON public.message_attachments;
CREATE POLICY message_attachments_read ON public.message_attachments FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.messages m WHERE m.id=message_id AND public.upt_can_read_channel(m.channel_id)));
DROP POLICY upt_chat_attachments_read ON storage.objects;
CREATE POLICY upt_chat_attachments_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='chat-attachments' AND public.upt_is_approved() AND (
 split_part(name,'/',1)=auth.uid()::text OR EXISTS(SELECT 1 FROM public.message_attachments a JOIN public.messages m ON m.id=a.message_id WHERE a.storage_path=name AND public.upt_can_read_channel(m.channel_id))));

CREATE OR REPLACE FUNCTION public.upt_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
 VALUES(auth.uid(),TG_OP,TG_TABLE_NAME,NEW.id,CASE WHEN TG_TABLE_NAME='profiles' THEN jsonb_build_object('role',NEW.role,'approved',NEW.approved) ELSE '{}'::jsonb END);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.upt_audit_mutation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER upt_profile_audit AFTER UPDATE OF role,approved ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.upt_audit_mutation();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['events','workplaces','shifts','responsible_assignments','event_members','briefings','tasks','personal_instructions'] LOOP
 EXECUTE format('CREATE TRIGGER upt_mutation_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.upt_audit_mutation()',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.upt_seed_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.workplaces(event_id,name,sort_order)
 SELECT NEW.id,n,ord::integer FROM unnest(ARRAY['Ticket Scan','Guest List','Artists','Merch','Bar/Toog','Backstage Management','Allrounder','Setup','Breakdown']) WITH ORDINALITY x(n,ord);
 INSERT INTO public.chat_channels(kind,event_id,name) VALUES('event',NEW.id,NEW.name);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.upt_seed_event() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER upt_seed_event AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.upt_seed_event();

CREATE OR REPLACE FUNCTION public.upt_notify_check_decision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
 INSERT INTO public.crew_notifications(user_id,title,body,kind)
 SELECT DISTINCT p.id,CASE WHEN TG_TABLE_NAME='check_ins' THEN 'Check-in aangevraagd' ELSE 'Check-out aangevraagd' END,NEW.id::text,TG_TABLE_NAME
 FROM public.profiles p WHERE p.approved AND (p.role='admin' OR EXISTS(SELECT 1 FROM public.responsible_assignments r WHERE r.user_id=p.id AND r.event_id=NEW.event_id AND r.workplace_id=NEW.workplace_id));
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
 INSERT INTO public.crew_notifications(user_id,title,body,kind) VALUES(NEW.user_id,'Aanvraag: '||NEW.status,NEW.id::text,TG_TABLE_NAME);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.upt_notify_check_decision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER upt_check_in_notify AFTER INSERT OR UPDATE ON public.check_ins FOR EACH ROW EXECUTE FUNCTION public.upt_notify_check_decision();
CREATE TRIGGER upt_check_out_notify AFTER INSERT OR UPDATE ON public.check_outs FOR EACH ROW EXECUTE FUNCTION public.upt_notify_check_decision();

ALTER TABLE public.offline_operation_records ADD COLUMN result jsonb;
DROP POLICY offline_own ON public.offline_operation_records;
CREATE POLICY offline_own_read ON public.offline_operation_records FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.upt_is_admin());
REVOKE INSERT,UPDATE,DELETE ON public.offline_operation_records FROM authenticated,anon;
CREATE OR REPLACE FUNCTION public.upt_sync_operation(p_id uuid,p_type text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.offline_operation_records%ROWTYPE; result_value jsonb; entity uuid; workplace uuid; event uuid;
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
 result_value:=jsonb_build_object('id',entity,'server_timestamp',now());
 INSERT INTO public.offline_operation_records(id,user_id,operation_type,payload,status,result,synced_at) VALUES(p_id,auth.uid(),p_type,p_payload,'synced',result_value,now());
 RETURN result_value;
END $$;
REVOKE ALL ON FUNCTION public.upt_sync_operation(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upt_sync_operation(uuid,text,jsonb) TO authenticated;
