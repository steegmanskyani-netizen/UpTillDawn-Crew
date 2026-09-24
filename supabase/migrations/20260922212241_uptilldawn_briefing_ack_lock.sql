CREATE OR REPLACE FUNCTION public.upt_acknowledge_briefing(p_briefing uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.briefings%ROWTYPE;
BEGIN
 IF NOT public.upt_is_approved() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO b FROM public.briefings WHERE id=p_briefing FOR SHARE;
 IF NOT FOUND OR NOT public.upt_can_access_workplace(b.event_id,b.workplace_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 INSERT INTO public.briefing_acknowledgements(briefing_id,user_id,version,acknowledged_at) VALUES(p_briefing,auth.uid(),b.version,now()) ON CONFLICT DO NOTHING;
END $$;
REVOKE INSERT(briefing_id,user_id,version) ON public.briefing_acknowledgements FROM authenticated;
