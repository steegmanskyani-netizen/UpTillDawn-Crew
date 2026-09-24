-- Chat lifecycle regression: automatic channel creation/naming, workplace scoping,
-- organization fallback and the three-day post-event access window.
BEGIN;

CREATE TEMP TABLE chat_ids(name text primary key,id uuid default gen_random_uuid());
INSERT INTO chat_ids(name) VALUES
('staff'),('future'),('active'),('recent'),('expired');

INSERT INTO auth.users(id,email)
SELECT id,name||'@chat-release.test'
FROM chat_ids WHERE name='staff';

UPDATE public.profiles p
SET approved=true,role='staff',full_name='Chat Release Staff'
FROM chat_ids i
WHERE p.id=i.id AND i.name='staff';

INSERT INTO public.events(id,name,start_date,end_date,start_at,end_at,status)
VALUES
((SELECT id FROM chat_ids WHERE name='future'),'Future Chat',now()+interval '1 hour',now()+interval '4 hours',now()+interval '1 hour',now()+interval '4 hours','scheduled'),
((SELECT id FROM chat_ids WHERE name='active'),'Active Chat',now()-interval '1 hour',now()+interval '1 hour',now()-interval '1 hour',now()+interval '1 hour','active'),
((SELECT id FROM chat_ids WHERE name='recent'),'Recent Chat',now()-interval '2 days',now()-interval '1 day',now()-interval '2 days',now()-interval '1 day','active'),
((SELECT id FROM chat_ids WHERE name='expired'),'Expired Chat',now()-interval '6 days',now()-interval '4 days',now()-interval '6 days',now()-interval '4 days','active');

INSERT INTO public.event_members(event_id,user_id,event_role)
SELECT id,(SELECT id FROM chat_ids WHERE name='staff'),'employee'
FROM chat_ids WHERE name IN ('future','active','recent','expired');

-- The event trigger seeds default workplaces. Assign one active workplace to the staff member.
INSERT INTO public.shifts(event_id,workplace_id,user_id,role_name,scheduled_start,scheduled_end,start_time,end_time,status)
SELECT e.id,w.id,(SELECT id FROM chat_ids WHERE name='staff'),'Personeel',
       e.start_at,e.end_at,e.start_at,e.end_at,'scheduled'
FROM public.events e
JOIN public.workplaces w ON w.event_id=e.id
WHERE e.id=(SELECT id FROM chat_ids WHERE name='active')
ORDER BY w.sort_order
LIMIT 1;

DO $$
DECLARE
  v_event uuid := (SELECT id FROM chat_ids WHERE name='future');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_channels
    WHERE kind='event' AND event_id=v_event AND name='Future Chat - algemene chat'
  ) THEN
    RAISE EXCEPTION 'FAIL automatic event chat';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.workplaces w
    LEFT JOIN public.chat_channels c
      ON c.kind='workplace' AND c.workplace_id=w.id
    WHERE w.event_id=v_event
      AND (c.id IS NULL OR c.name <> 'Future Chat - '||w.name)
  ) THEN
    RAISE EXCEPTION 'FAIL automatic workplace chat naming';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM chat_ids WHERE name='staff'),true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_org uuid;
  v_active_event_chat uuid;
  v_active_workplace_chat uuid;
  v_recent_event_chat uuid;
  v_expired_event_chat uuid;
BEGIN
  SELECT id INTO v_org FROM public.chat_channels WHERE kind='organization' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_active_event_chat FROM public.chat_channels WHERE kind='event' AND event_id=(SELECT id FROM chat_ids WHERE name='active');
  SELECT c.id INTO v_active_workplace_chat
  FROM public.chat_channels c
  JOIN public.shifts s ON s.workplace_id=c.workplace_id
  WHERE c.kind='workplace'
    AND s.user_id=auth.uid()
    AND s.event_id=(SELECT id FROM chat_ids WHERE name='active')
  LIMIT 1;
  SELECT id INTO v_recent_event_chat FROM public.chat_channels WHERE kind='event' AND event_id=(SELECT id FROM chat_ids WHERE name='recent');
  SELECT id INTO v_expired_event_chat FROM public.chat_channels WHERE kind='event' AND event_id=(SELECT id FROM chat_ids WHERE name='expired');

  IF v_org IS NULL OR NOT public.upt_can_read_channel(v_org) THEN
    RAISE EXCEPTION 'FAIL organization chat fallback';
  END IF;
  IF v_active_event_chat IS NULL OR NOT public.upt_can_read_channel(v_active_event_chat) THEN
    RAISE EXCEPTION 'FAIL active event chat';
  END IF;
  IF v_active_workplace_chat IS NULL OR NOT public.upt_can_read_channel(v_active_workplace_chat) THEN
    RAISE EXCEPTION 'FAIL assigned workplace chat';
  END IF;
  IF v_recent_event_chat IS NULL OR NOT public.upt_can_read_channel(v_recent_event_chat) THEN
    RAISE EXCEPTION 'FAIL recent post-event chat';
  END IF;
  IF v_expired_event_chat IS NULL OR public.upt_can_read_channel(v_expired_event_chat) THEN
    RAISE EXCEPTION 'FAIL expired chat still readable';
  END IF;
END $$;

RESET ROLE;
SELECT 'PASS: automatic chat naming, scoped workplace access and three-day post-event window' AS result;
ROLLBACK;
