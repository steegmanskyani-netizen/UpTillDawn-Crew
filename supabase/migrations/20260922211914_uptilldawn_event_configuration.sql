CREATE OR REPLACE FUNCTION public.upt_duplicate_event(p_event uuid,p_name text,p_start timestamptz,p_end timestamptz) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE original public.events%ROWTYPE; new_id uuid; w record; new_workplace uuid;
BEGIN
 IF NOT public.upt_is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 200 OR p_start IS NULL OR p_end<=p_start THEN RAISE EXCEPTION 'Invalid event'; END IF;
 SELECT * INTO original FROM public.events WHERE id=p_event;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
 INSERT INTO public.events(name,description,start_date,end_date,start_at,end_at,venue,address,latitude,longitude,timezone,checkin_radius_m,created_by)
 VALUES(trim(p_name),original.description,p_start,p_end,p_start,p_end,original.venue,original.address,original.latitude,original.longitude,original.timezone,original.checkin_radius_m,auth.uid()) RETURNING id INTO new_id;
 FOR w IN SELECT * FROM public.workplaces WHERE event_id=p_event LOOP
 SELECT id INTO new_workplace FROM public.workplaces WHERE event_id=new_id AND name=w.name LIMIT 1;
 IF new_workplace IS NULL THEN INSERT INTO public.workplaces(event_id,name,description,sort_order,is_active) VALUES(new_id,w.name,w.description,w.sort_order,w.is_active) RETURNING id INTO new_workplace;
 ELSE UPDATE public.workplaces SET description=w.description,sort_order=w.sort_order,is_active=w.is_active WHERE id=new_workplace; END IF;
 INSERT INTO public.briefings(event_id,workplace_id,title,body,required,created_by) SELECT new_id,new_workplace,title,body,required,auth.uid() FROM public.briefings WHERE event_id=p_event AND workplace_id=w.id;
 INSERT INTO public.tasks(event_id,workplace_id,title,description,created_by) SELECT new_id,new_workplace,title,description,auth.uid() FROM public.tasks WHERE event_id=p_event AND workplace_id=w.id;
 END LOOP;
 INSERT INTO public.briefings(event_id,title,body,required,created_by) SELECT new_id,title,body,required,auth.uid() FROM public.briefings WHERE event_id=p_event AND workplace_id IS NULL;
 INSERT INTO public.tasks(event_id,title,description,created_by) SELECT new_id,title,description,auth.uid() FROM public.tasks WHERE event_id=p_event AND workplace_id IS NULL;
 RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.upt_duplicate_event(uuid,text,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upt_duplicate_event(uuid,text,timestamptz,timestamptz) TO authenticated;
