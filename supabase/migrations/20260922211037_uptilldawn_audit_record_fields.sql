CREATE OR REPLACE FUNCTION public.upt_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
 VALUES(auth.uid(),TG_OP,TG_TABLE_NAME,NEW.id,CASE WHEN TG_TABLE_NAME='profiles' THEN jsonb_build_object('role',to_jsonb(NEW)->'role','approved',to_jsonb(NEW)->'approved') ELSE '{}'::jsonb END);
 RETURN NEW;
END $$;
