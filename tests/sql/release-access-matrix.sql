-- Release-critical role/event lifecycle regression.
-- Covers future availability, event-level Responsible setup, staff visibility,
-- admin-only shifts and active-event incidents. Synthetic fixtures are rolled back.
BEGIN;

CREATE TEMP TABLE rr_ids(name text primary key,id uuid default gen_random_uuid());
INSERT INTO rr_ids(name) VALUES
('admin'),('lead'),('staff'),('other'),
('future'),('active'),('ended'),
('future_wp'),('active_wp'),('ended_wp');
GRANT SELECT ON rr_ids TO authenticated;

INSERT INTO auth.users(id,email)
SELECT id,name||'@release.test'
FROM rr_ids WHERE name IN ('admin','lead','staff','other');

UPDATE public.profiles p
SET approved=true,
    role=CASE i.name WHEN 'admin' THEN 'admin' WHEN 'lead' THEN 'responsible_lead' ELSE 'staff' END,
    full_name=initcap(i.name)||' Release'
FROM rr_ids i
WHERE p.id=i.id AND i.name IN ('admin','lead','staff','other');

INSERT INTO public.events(id,name,start_date,end_date,start_at,end_at,status)
VALUES
((SELECT id FROM rr_ids WHERE name='future'),'Future release',now()+interval '1 hour',now()+interval '5 hours',now()+interval '1 hour',now()+interval '5 hours','scheduled'),
((SELECT id FROM rr_ids WHERE name='active'),'Active release',now()-interval '1 hour',now()+interval '2 hours',now()-interval '1 hour',now()+interval '2 hours','active'),
((SELECT id FROM rr_ids WHERE name='ended'),'Ended release',now()-interval '5 hours',now()-interval '1 hour',now()-interval '5 hours',now()-interval '1 hour','active');

INSERT INTO public.workplaces(id,event_id,name) VALUES
((SELECT id FROM rr_ids WHERE name='future_wp'),(SELECT id FROM rr_ids WHERE name='future'),'Future WP'),
((SELECT id FROM rr_ids WHERE name='active_wp'),(SELECT id FROM rr_ids WHERE name='active'),'Active WP'),
((SELECT id FROM rr_ids WHERE name='ended_wp'),(SELECT id FROM rr_ids WHERE name='ended'),'Ended WP');

INSERT INTO public.event_members(event_id,user_id,event_role) VALUES
((SELECT id FROM rr_ids WHERE name='future'),(SELECT id FROM rr_ids WHERE name='lead'),'responsible_lead'),
((SELECT id FROM rr_ids WHERE name='future'),(SELECT id FROM rr_ids WHERE name='staff'),'employee'),
((SELECT id FROM rr_ids WHERE name='active'),(SELECT id FROM rr_ids WHERE name='staff'),'employee'),
((SELECT id FROM rr_ids WHERE name='ended'),(SELECT id FROM rr_ids WHERE name='staff'),'employee');

INSERT INTO public.briefings(event_id,title,body,created_by)
VALUES((SELECT id FROM rr_ids WHERE name='ended'),'Ended briefing','hidden after end',(SELECT id FROM rr_ids WHERE name='admin'));

-- Event-level Responsible can prepare future-event setup, but cannot manage shifts.
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM rr_ids WHERE name='lead'),true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_task uuid;
BEGIN
  IF NOT upt_private.is_event_responsible((SELECT id FROM rr_ids WHERE name='future'),auth.uid()) THEN
    RAISE EXCEPTION 'FAIL event responsible helper';
  END IF;
  IF NOT upt_private.event_operational((SELECT id FROM rr_ids WHERE name='future')) THEN
    RAISE EXCEPTION 'FAIL future event not operational for setup';
  END IF;
  IF (SELECT count(*) FROM public.workplaces WHERE event_id=(SELECT id FROM rr_ids WHERE name='future')) < 1 THEN
    RAISE EXCEPTION 'FAIL lead future workplace read';
  END IF;

  INSERT INTO public.workplaces(event_id,name)
  VALUES((SELECT id FROM rr_ids WHERE name='future'),'Lead-created WP');

  INSERT INTO public.briefings(event_id,title,body,created_by)
  VALUES((SELECT id FROM rr_ids WHERE name='future'),'Future briefing','Readable before start',auth.uid());

  INSERT INTO public.personal_instructions(event_id,user_id,title,body,created_by)
  VALUES((SELECT id FROM rr_ids WHERE name='future'),(SELECT id FROM rr_ids WHERE name='staff'),'Personal future','Readable before start',auth.uid());

  v_task := public.upt_create_assigned_task(
    (SELECT id FROM rr_ids WHERE name='future'),
    NULL,
    (SELECT id FROM rr_ids WHERE name='staff'),
    'Future task',
    'Hidden until start'
  );
  IF v_task IS NULL THEN RAISE EXCEPTION 'FAIL lead future task create'; END IF;

  BEGIN
    PERFORM public.upt_create_shift(
      (SELECT id FROM rr_ids WHERE name='future_wp'),
      (SELECT id FROM rr_ids WHERE name='staff'),
      'Personeel',
      now()+interval '1 hour',
      now()+interval '3 hours',
      false
    );
    RAISE EXCEPTION 'FAIL lead created shift';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='FAIL lead created shift' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

-- Staff can read future instructions after event selection, but no operational content yet.
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM rr_ids WHERE name='staff'),true);
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.briefings WHERE event_id=(SELECT id FROM rr_ids WHERE name='future')) <> 1 THEN
    RAISE EXCEPTION 'FAIL future briefing visibility';
  END IF;
  IF (SELECT count(*) FROM public.personal_instructions WHERE event_id=(SELECT id FROM rr_ids WHERE name='future')) <> 1 THEN
    RAISE EXCEPTION 'FAIL future personal instruction visibility';
  END IF;
  IF (SELECT count(*) FROM public.tasks WHERE event_id=(SELECT id FROM rr_ids WHERE name='future')) <> 0 THEN
    RAISE EXCEPTION 'FAIL future task visible to staff';
  END IF;
  IF (SELECT count(*) FROM public.workplaces WHERE event_id=(SELECT id FROM rr_ids WHERE name='future')) <> 0 THEN
    RAISE EXCEPTION 'FAIL future workplace visible to staff';
  END IF;
  IF (SELECT count(*) FROM public.shifts WHERE event_id=(SELECT id FROM rr_ids WHERE name='future')) <> 0 THEN
    RAISE EXCEPTION 'FAIL future shift visible to staff';
  END IF;

  BEGIN
    INSERT INTO public.briefings(event_id,title,body,created_by)
    VALUES((SELECT id FROM rr_ids WHERE name='future'),'Bad','bad',auth.uid());
    RAISE EXCEPTION 'FAIL staff created briefing';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='FAIL staff created briefing' THEN RAISE; END IF;
  END;

  INSERT INTO public.event_availability(event_id,user_id,response)
  VALUES((SELECT id FROM rr_ids WHERE name='future'),auth.uid(),'can');

  IF (SELECT count(*) FROM public.event_availability WHERE event_id=(SELECT id FROM rr_ids WHERE name='future')) <> 1 THEN
    RAISE EXCEPTION 'FAIL own availability read';
  END IF;
END $$;
RESET ROLE;

-- Any approved user sees future events but not another user's availability response.
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM rr_ids WHERE name='other'),true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.events WHERE id=(SELECT id FROM rr_ids WHERE name='future')) <> 1 THEN
    RAISE EXCEPTION 'FAIL future event not visible to approved staff';
  END IF;
  IF (SELECT count(*) FROM public.event_availability WHERE event_id=(SELECT id FROM rr_ids WHERE name='future')) <> 0 THEN
    RAISE EXCEPTION 'FAIL availability leaked to unrelated staff';
  END IF;
END $$;
RESET ROLE;

-- Admin schedules and assigns active work.
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM rr_ids WHERE name='admin'),true);
SET LOCAL ROLE authenticated;
SELECT public.upt_create_shift(
  (SELECT id FROM rr_ids WHERE name='active_wp'),
  (SELECT id FROM rr_ids WHERE name='staff'),
  'Personeel',
  now()-interval '30 minutes',
  now()+interval '90 minutes',
  false
);
SELECT public.upt_create_assigned_task(
  (SELECT id FROM rr_ids WHERE name='active'),
  (SELECT id FROM rr_ids WHERE name='active_wp'),
  (SELECT id FROM rr_ids WHERE name='staff'),
  'Active task',
  'Visible during event'
);
RESET ROLE;

-- At event start, assigned operational content and incidents become available.
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM rr_ids WHERE name='staff'),true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.tasks WHERE event_id=(SELECT id FROM rr_ids WHERE name='active')) <> 1 THEN
    RAISE EXCEPTION 'FAIL active task visibility';
  END IF;
  IF (SELECT count(*) FROM public.shifts WHERE event_id=(SELECT id FROM rr_ids WHERE name='active')) <> 1 THEN
    RAISE EXCEPTION 'FAIL active shift visibility';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workplaces
    WHERE event_id=(SELECT id FROM rr_ids WHERE name='active')
      AND id=(SELECT id FROM rr_ids WHERE name='active_wp')
  ) THEN
    RAISE EXCEPTION 'FAIL active assigned workplace visibility';
  END IF;

  BEGIN
    PERFORM public.upt_create_incident(
      (SELECT id FROM rr_ids WHERE name='future'),NULL,'Too early',NULL,NULL,NULL,NULL
    );
    RAISE EXCEPTION 'FAIL pre-event incident created';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='FAIL pre-event incident created' THEN RAISE; END IF;
  END;

  IF public.upt_create_incident(
      (SELECT id FROM rr_ids WHERE name='active'),
      (SELECT id FROM rr_ids WHERE name='active_wp'),
      'Active incident',NULL,NULL,NULL,NULL
    ) IS NULL THEN
    RAISE EXCEPTION 'FAIL active incident create';
  END IF;

  IF (SELECT count(*) FROM public.briefings WHERE event_id=(SELECT id FROM rr_ids WHERE name='ended')) <> 0 THEN
    RAISE EXCEPTION 'FAIL ended briefing remains visible';
  END IF;
  IF (SELECT count(*) FROM public.workplaces WHERE event_id=(SELECT id FROM rr_ids WHERE name='ended')) <> 0 THEN
    RAISE EXCEPTION 'FAIL ended workplace remains visible';
  END IF;
END $$;
RESET ROLE;

SELECT 'PASS: release access matrix' AS result;
ROLLBACK;
