-- Block non-admin operational mutations after an event has ended.
-- Event chats remain readable for three days through upt_can_read_channel().

CREATE OR REPLACE FUNCTION upt_private.block_post_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row jsonb;
  v_event uuid;
  v_ref uuid;
BEGIN
  IF auth.uid() IS NULL OR public.upt_is_admin(auth.uid()) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;

  IF v_row ? 'event_id' AND nullif(v_row->>'event_id','') IS NOT NULL THEN
    v_event := (v_row->>'event_id')::uuid;
  ELSIF TG_TABLE_NAME IN ('break_sessions','workplace_transitions') THEN
    v_ref := nullif(v_row->>'work_session_id','')::uuid;
    SELECT ws.event_id INTO v_event
    FROM public.work_sessions ws
    WHERE ws.id = v_ref;
  ELSIF TG_TABLE_NAME = 'task_assignments' THEN
    v_ref := nullif(v_row->>'task_id','')::uuid;
    SELECT t.event_id INTO v_event
    FROM public.tasks t
    WHERE t.id = v_ref;
  ELSIF TG_TABLE_NAME = 'briefing_acknowledgements' THEN
    v_ref := nullif(v_row->>'briefing_id','')::uuid;
    SELECT b.event_id INTO v_event
    FROM public.briefings b
    WHERE b.id = v_ref;
  ELSIF TG_TABLE_NAME = 'personal_instruction_acknowledgements' THEN
    v_ref := nullif(v_row->>'instruction_id','')::uuid;
    SELECT pi.event_id INTO v_event
    FROM public.personal_instructions pi
    WHERE pi.id = v_ref;
  END IF;

  IF v_event IS NOT NULL AND NOT upt_private.event_operational(v_event) THEN
    RAISE EXCEPTION 'Event afgelopen. Alleen de chats blijven nog 3 dagen beschikbaar.';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION upt_private.block_post_event_mutation() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workplaces',
    'event_members',
    'responsible_assignments',
    'shifts',
    'briefings',
    'briefing_acknowledgements',
    'tasks',
    'task_assignments',
    'check_ins',
    'check_outs',
    'work_sessions',
    'break_sessions',
    'workplace_transitions',
    'incidents',
    'personal_instructions',
    'personal_instruction_acknowledgements'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS upt_block_post_event_mutation ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER upt_block_post_event_mutation BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION upt_private.block_post_event_mutation()',
      t
    );
  END LOOP;
END $$;
