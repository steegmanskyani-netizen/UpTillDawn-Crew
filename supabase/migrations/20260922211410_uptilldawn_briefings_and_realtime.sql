CREATE OR REPLACE FUNCTION public.upt_acknowledge_briefing(p_briefing uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v integer;
BEGIN
 SELECT version INTO v FROM public.briefings WHERE id=p_briefing FOR SHARE;
 IF v IS NULL OR NOT public.upt_is_approved() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 INSERT INTO public.briefing_acknowledgements(briefing_id,user_id,version) VALUES(p_briefing,auth.uid(),v) ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.upt_acknowledge_briefing(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upt_acknowledge_briefing(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.upt_version_briefing() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF (NEW.title,NEW.body,NEW.required) IS DISTINCT FROM (OLD.title,OLD.body,OLD.required) THEN NEW.version:=OLD.version+1; ELSE NEW.version:=OLD.version; END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER upt_version_briefing BEFORE UPDATE ON public.briefings FOR EACH ROW EXECUTE FUNCTION public.upt_version_briefing();
-- History cannot be altered, and inserts must acknowledge the current visible version.
DROP POLICY acknowledgement_own ON public.briefing_acknowledgements;
CREATE POLICY acknowledgement_read ON public.briefing_acknowledgements FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.upt_is_admin());
CREATE POLICY acknowledgement_insert ON public.briefing_acknowledgements FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.briefings b WHERE b.id=briefing_id AND b.version=briefing_acknowledgements.version));
REVOKE UPDATE,DELETE ON public.briefing_acknowledgements FROM authenticated,anon;
REVOKE INSERT ON public.briefing_acknowledgements FROM authenticated;
GRANT INSERT(briefing_id,user_id,version) ON public.briefing_acknowledgements TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages,public.crew_notifications,public.check_ins,public.check_outs;
INSERT INTO public.chat_channels(kind,name) SELECT 'organization','Uptilldawn — algemeen' WHERE NOT EXISTS(SELECT 1 FROM public.chat_channels WHERE kind='organization');
