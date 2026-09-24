-- Ordinary clients cannot select sensitive profile columns, even on their own row.
REVOKE SELECT,UPDATE ON public.profiles FROM authenticated;
GRANT SELECT(id,full_name,phone_number,profile_photo_url,approved,role),UPDATE(full_name,phone_number,profile_photo_url) ON public.profiles TO authenticated;
CREATE OR REPLACE FUNCTION public.upt_admin_set_account(p_user uuid,p_approved boolean,p_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.upt_is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF p_role NOT IN ('admin','responsible_lead','staff') OR p_role IS NULL OR p_approved IS NULL THEN RAISE EXCEPTION 'Invalid role'; END IF;
 IF p_user=auth.uid() AND (NOT p_approved OR p_role<>'admin') THEN RAISE EXCEPTION 'Cannot revoke own admin access'; END IF;
 UPDATE public.profiles SET approved=p_approved,role=p_role WHERE id=p_user;
 IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.upt_admin_set_account(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upt_admin_set_account(uuid,boolean,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.upt_admin_profiles() RETURNS SETOF public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.upt_is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 RETURN QUERY SELECT * FROM public.profiles ORDER BY full_name;
END $$;
REVOKE ALL ON FUNCTION public.upt_admin_profiles() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upt_admin_profiles() TO authenticated;
CREATE OR REPLACE FUNCTION public.upt_audit_export() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.upt_is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 INSERT INTO public.upt_audit_logs(actor_id,action,entity_type) VALUES(auth.uid(),'EXPORT_XLSX','time_records');
END $$;
REVOKE ALL ON FUNCTION public.upt_audit_export() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.upt_audit_export() TO authenticated;
