-- Only controlled RPCs may create operational records or attach storage paths.
REVOKE INSERT,UPDATE,DELETE ON public.messages,public.message_attachments,public.incidents FROM authenticated,anon;
CREATE OR REPLACE FUNCTION public.upt_can_access_workplace(p_event uuid,p_workplace uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.upt_is_approved() AND (public.upt_is_admin() OR public.upt_is_responsible(p_event,p_workplace)
 OR (p_workplace IS NULL AND EXISTS(SELECT 1 FROM public.event_members m WHERE m.event_id=p_event AND m.user_id=auth.uid()))
 OR (p_workplace IS NOT NULL AND EXISTS(SELECT 1 FROM public.shifts s WHERE s.event_id=p_event AND s.workplace_id=p_workplace AND s.user_id=auth.uid() AND s.status<>'cancelled')))
$$;
REVOKE ALL ON FUNCTION public.upt_can_access_workplace(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upt_can_access_workplace(uuid,uuid) TO authenticated;
DROP POLICY briefing_read ON public.briefings;
CREATE POLICY briefing_read ON public.briefings FOR SELECT TO authenticated USING(public.upt_can_access_workplace(event_id,workplace_id));
DROP POLICY tasks_read ON public.tasks;
CREATE POLICY tasks_read ON public.tasks FOR SELECT TO authenticated USING(public.upt_can_access_workplace(event_id,workplace_id));
CREATE OR REPLACE FUNCTION public.upt_create_assigned_task(p_event uuid,p_workplace uuid,p_user uuid,p_title text,p_description text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE task uuid;
BEGIN
 IF NOT public.upt_is_approved() OR NOT(public.upt_is_admin() OR(p_workplace IS NOT NULL AND public.upt_is_responsible(p_event,p_workplace))) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF p_title IS NULL OR length(trim(p_title)) NOT BETWEEN 1 AND 200 OR length(coalesce(p_description,''))>4000 THEN RAISE EXCEPTION 'Invalid task'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.event_members m ON m.user_id=p.id WHERE p.id=p_user AND p.approved AND m.event_id=p_event) THEN RAISE EXCEPTION 'Approved event member required'; END IF;
 IF p_workplace IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.shifts s WHERE s.event_id=p_event AND s.workplace_id=p_workplace AND s.user_id=p_user AND s.status<>'cancelled') THEN RAISE EXCEPTION 'Assigned shift required'; END IF;
 INSERT INTO public.tasks(event_id,workplace_id,title,description,created_by) VALUES(p_event,p_workplace,trim(p_title),p_description,auth.uid()) RETURNING id INTO task;
 PERFORM public.upt_assign_task(task,p_user);
 RETURN task;
END $$;
REVOKE ALL ON FUNCTION public.upt_create_assigned_task(uuid,uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upt_create_assigned_task(uuid,uuid,uuid,text,text) TO authenticated;
