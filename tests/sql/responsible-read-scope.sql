-- Workplace-scoped Responsible and active staff workplace visibility regression.
-- Synthetic data only; rolled back.
BEGIN;

CREATE TEMP TABLE upt_scope_ids(name text primary key, id uuid default gen_random_uuid());
INSERT INTO upt_scope_ids(name) VALUES ('lead'),('staff'),('event'),('wp_own'),('wp_other'),('lead_shift'),('staff_shift');
GRANT SELECT ON upt_scope_ids TO authenticated;

INSERT INTO auth.users(id,email)
SELECT id,name||'@scope.test' FROM upt_scope_ids WHERE name IN ('lead','staff');

UPDATE public.profiles
SET approved=true,
    role=CASE WHEN i.name='lead' THEN 'responsible_lead' ELSE 'staff' END,
    full_name=initcap(i.name)||' Scope'
FROM upt_scope_ids i
WHERE profiles.id=i.id AND i.name IN ('lead','staff');

INSERT INTO public.events(id,name,start_date,end_date,start_at,end_at,status)
VALUES(
 (SELECT id FROM upt_scope_ids WHERE name='event'),
 'Responsible scope rollback',
 now()-interval '1 hour', now()+interval '1 day',
 now()-interval '1 hour', now()+interval '1 day',
 'active'
);

INSERT INTO public.workplaces(id,event_id,name,sort_order)
VALUES
(
 (SELECT id FROM upt_scope_ids WHERE name='wp_own'),
 (SELECT id FROM upt_scope_ids WHERE name='event'),
 'Own workplace',
 10
),
(
 (SELECT id FROM upt_scope_ids WHERE name='wp_other'),
 (SELECT id FROM upt_scope_ids WHERE name='event'),
 'Other workplace',
 20
);

INSERT INTO public.event_members(event_id,user_id,event_role)
VALUES
(
 (SELECT id FROM upt_scope_ids WHERE name='event'),
 (SELECT id FROM upt_scope_ids WHERE name='lead'),
 'responsible_lead'
),
(
 (SELECT id FROM upt_scope_ids WHERE name='event'),
 (SELECT id FROM upt_scope_ids WHERE name='staff'),
 'employee'
);

INSERT INTO public.shifts(
 id,event_id,workplace_id,user_id,role_name,
 start_time,end_time,scheduled_start,scheduled_end,status
)
VALUES
(
 (SELECT id FROM upt_scope_ids WHERE name='lead_shift'),
 (SELECT id FROM upt_scope_ids WHERE name='event'),
 (SELECT id FROM upt_scope_ids WHERE name='wp_own'),
 (SELECT id FROM upt_scope_ids WHERE name='lead'),
 'Verantwoordelijke',
 now()-interval '30 minutes',now()+interval '2 hours',
 now()-interval '30 minutes',now()+interval '2 hours',
 'scheduled'
),
(
 (SELECT id FROM upt_scope_ids WHERE name='staff_shift'),
 (SELECT id FROM upt_scope_ids WHERE name='event'),
 (SELECT id FROM upt_scope_ids WHERE name='wp_own'),
 (SELECT id FROM upt_scope_ids WHERE name='staff'),
 'Personeel',
 now()-interval '30 minutes',now()+interval '2 hours',
 now()-interval '30 minutes',now()+interval '2 hours',
 'scheduled'
);

INSERT INTO public.responsible_assignments(event_id,workplace_id,user_id)
VALUES(
 (SELECT id FROM upt_scope_ids WHERE name='event'),
 (SELECT id FROM upt_scope_ids WHERE name='wp_own'),
 (SELECT id FROM upt_scope_ids WHERE name='lead')
);

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_scope_ids WHERE name='lead'),true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_event_count integer;
  v_workplace_count integer;
BEGIN
  IF NOT upt_private.is_event_responsible(
    (SELECT id FROM upt_scope_ids WHERE name='event'),
    auth.uid()
  ) THEN
    RAISE EXCEPTION 'FAIL event responsible helper';
  END IF;

  SELECT count(*) INTO v_event_count
  FROM public.events
  WHERE id=(SELECT id FROM upt_scope_ids WHERE name='event');

  SELECT count(*) INTO v_workplace_count
  FROM public.workplaces
  WHERE event_id=(SELECT id FROM upt_scope_ids WHERE name='event');

  IF v_event_count <> 1 THEN
    RAISE EXCEPTION 'FAIL responsible cannot read assigned event';
  END IF;
  IF v_workplace_count <> 1 THEN
    RAISE EXCEPTION 'FAIL responsible workplace scope should expose only own workplace: got %',v_workplace_count;
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.workplaces
    WHERE id=(SELECT id FROM upt_scope_ids WHERE name='wp_other')
  ) THEN
    RAISE EXCEPTION 'FAIL responsible can read unrelated workplace';
  END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_scope_ids WHERE name='staff'),true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.workplaces
  WHERE event_id=(SELECT id FROM upt_scope_ids WHERE name='event');

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL staff workplace visibility should match assigned shift: got %',v_count;
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.workplaces
    WHERE id=(SELECT id FROM upt_scope_ids WHERE name='wp_other')
  ) THEN
    RAISE EXCEPTION 'FAIL staff can read unrelated workplace';
  END IF;
END $$;
RESET ROLE;

SELECT 'PASS: responsible and staff workplace visibility is assignment-scoped' AS result;
ROLLBACK;
