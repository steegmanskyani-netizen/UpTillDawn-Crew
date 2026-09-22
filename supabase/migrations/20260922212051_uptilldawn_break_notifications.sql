CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE SCHEMA IF NOT EXISTS upt_private;
REVOKE ALL ON SCHEMA upt_private FROM PUBLIC,anon,authenticated;
CREATE TABLE upt_private.break_warning_receipts(user_id uuid NOT NULL,event_id uuid NOT NULL,kind text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,event_id,kind));
ALTER TABLE upt_private.break_warning_receipts ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION upt_private.notify_break_allowance() RETURNS void
LANGUAGE plpgsql SET search_path=public,upt_private AS $$
DECLARE active record; seconds numeric; inserted boolean;
BEGIN
 FOR active IN
 SELECT ws.user_id,ws.event_id,coalesce((SELECT wt.to_workplace_id FROM public.workplace_transitions wt WHERE wt.work_session_id=ws.id ORDER BY confirmed_at DESC LIMIT 1),s.workplace_id) AS workplace_id
 FROM public.work_sessions ws JOIN public.break_sessions b ON b.work_session_id=ws.id AND b.ended_at IS NULL
 LEFT JOIN public.shifts s ON s.id=ws.shift_id
 JOIN public.profiles p ON p.id=ws.user_id AND p.approved
 WHERE ws.ended_at IS NULL
 LOOP
 SELECT coalesce(sum(greatest(0,extract(epoch from(least(coalesce(b.ended_at,now()),coalesce(ws.ended_at,now()))-greatest(b.started_at,ws.started_at))))),0) INTO seconds
 FROM public.work_sessions ws JOIN public.break_sessions b ON b.work_session_id=ws.id WHERE ws.user_id=active.user_id AND ws.event_id=active.event_id;
 IF seconds>=3300 THEN
 inserted:=false;
 INSERT INTO upt_private.break_warning_receipts(user_id,event_id,kind) VALUES(active.user_id,active.event_id,'staff_55') ON CONFLICT DO NOTHING RETURNING true INTO inserted;
 IF inserted THEN INSERT INTO public.crew_notifications(user_id,title,body,kind) VALUES(active.user_id,'Pauzetegoed bijna op','Je hebt minstens 55 minuten pauze gebruikt. Alleen pauze boven 60 minuten wordt afgetrokken.','break_warning'); END IF;
 END IF;
 IF seconds>=4200 THEN
 inserted:=false;
 INSERT INTO upt_private.break_warning_receipts(user_id,event_id,kind) VALUES(active.user_id,active.event_id,'lead_70') ON CONFLICT DO NOTHING RETURNING true INTO inserted;
 IF inserted THEN INSERT INTO public.crew_notifications(user_id,title,body,kind)
 SELECT DISTINCT p.id,'Pauze langer dan 70 minuten',active.user_id::text,'excess_break_warning' FROM public.profiles p WHERE p.approved AND(p.role='admin' OR EXISTS(SELECT 1 FROM public.responsible_assignments r WHERE r.user_id=p.id AND r.event_id=active.event_id AND r.workplace_id=active.workplace_id)); END IF;
 END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION upt_private.notify_break_allowance() FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('uptilldawn-break-allowance','* * * * *','SELECT upt_private.notify_break_allowance()');
