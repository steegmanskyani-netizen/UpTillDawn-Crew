-- Workplace Responsible assignment must come from a Responsible already selected for the event.
BEGIN;

CREATE TEMP TABLE guard_ids(name text primary key,id uuid default gen_random_uuid());
INSERT INTO guard_ids(name) VALUES ('admin'),('selected_lead'),('unselected_lead'),('event'),('workplace');
GRANT SELECT ON guard_ids TO authenticated;

INSERT INTO auth.users(id,email)
SELECT id,name||'@responsible-guard.test'
FROM guard_ids
WHERE name IN ('admin','selected_lead','unselected_lead');

UPDATE public.profiles p
SET approved=true,
    role=CASE WHEN i.name='admin' THEN 'admin' ELSE 'responsible_lead' END,
    full_name=initcap(replace(i.name,'_',' '))
FROM guard_ids i
WHERE p.id=i.id
  AND i.name IN ('admin','selected_lead','unselected_lead');

INSERT INTO public.events(id,name,start_date,end_date,start_at,end_at,status)
VALUES(
  (SELECT id FROM guard_ids WHERE name='event'),
  'Responsible guard',
  now()+interval '1 hour',
  now()+interval '4 hours',
  now()+interval '1 hour',
  now()+interval '4 hours',
  'scheduled'
);

INSERT INTO public.workplaces(id,event_id,name)
VALUES(
  (SELECT id FROM guard_ids WHERE name='workplace'),
  (SELECT id FROM guard_ids WHERE name='event'),
  'Guard workplace'
);

INSERT INTO public.event_members(event_id,user_id,event_role)
VALUES(
  (SELECT id FROM guard_ids WHERE name='event'),
  (SELECT id FROM guard_ids WHERE name='selected_lead'),
  'responsible_lead'
);

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM guard_ids WHERE name='admin'),true);
SET LOCAL ROLE authenticated;

INSERT INTO public.responsible_assignments(event_id,workplace_id,user_id,assigned_by)
VALUES(
  (SELECT id FROM guard_ids WHERE name='event'),
  (SELECT id FROM guard_ids WHERE name='workplace'),
  (SELECT id FROM guard_ids WHERE name='selected_lead'),
  auth.uid()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.responsible_assignments
    WHERE event_id=(SELECT id FROM guard_ids WHERE name='event')
      AND user_id=(SELECT id FROM guard_ids WHERE name='selected_lead')
  ) THEN
    RAISE EXCEPTION 'FAIL selected responsible was not assignable';
  END IF;

  BEGIN
    INSERT INTO public.responsible_assignments(event_id,workplace_id,user_id,assigned_by)
    VALUES(
      (SELECT id FROM guard_ids WHERE name='event'),
      (SELECT id FROM guard_ids WHERE name='workplace'),
      (SELECT id FROM guard_ids WHERE name='unselected_lead'),
      auth.uid()
    );
    RAISE EXCEPTION 'FAIL unselected responsible was assignable';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='FAIL unselected responsible was assignable' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
SELECT 'PASS: workplace Responsible requires prior event selection' AS result;
ROLLBACK;
