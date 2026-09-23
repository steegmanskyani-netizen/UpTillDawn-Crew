-- Targeted regression tests for the post-hardening crew-management features.
-- Run in one connection. All synthetic fixtures are rolled back.
BEGIN;

CREATE TEMP TABLE upt_new_ids(name text primary key, id uuid default gen_random_uuid());
INSERT INTO upt_new_ids(name) VALUES
('admin'),('staff'),('lead'),('other'),('event'),('bar'),('ticket');
GRANT SELECT ON upt_new_ids TO authenticated, anon;

INSERT INTO auth.users(id,email)
SELECT id, name || '@rollback.test'
FROM upt_new_ids
WHERE name IN ('admin','staff','lead','other');

UPDATE public.profiles
SET approved=true,
    role=CASE
      WHEN id=(SELECT id FROM upt_new_ids WHERE name='admin') THEN 'admin'
      WHEN id=(SELECT id FROM upt_new_ids WHERE name='lead') THEN 'responsible_lead'
      ELSE 'staff'
    END
WHERE id IN (SELECT id FROM upt_new_ids WHERE name IN ('admin','staff','lead','other'));

INSERT INTO public.events(id,name,start_date,end_date,start_at,end_at)
SELECT id,'New feature rollback',now()-interval '1 hour',now()+interval '1 day',now()-interval '1 hour',now()+interval '1 day'
FROM upt_new_ids WHERE name='event';

INSERT INTO public.workplaces(id,event_id,name)
SELECT w.id,e.id,w.name
FROM upt_new_ids w, upt_new_ids e
WHERE w.name IN ('bar','ticket') AND e.name='event';

INSERT INTO public.event_members(event_id,user_id)
SELECT (SELECT id FROM upt_new_ids WHERE name='event'), id
FROM upt_new_ids
WHERE name IN ('staff','lead','other');

INSERT INTO public.responsible_assignments(event_id,workplace_id,user_id)
VALUES(
 (SELECT id FROM upt_new_ids WHERE name='event'),
 (SELECT id FROM upt_new_ids WHERE name='bar'),
 (SELECT id FROM upt_new_ids WHERE name='lead')
);

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_new_ids WHERE name='staff'),true);
SET LOCAL ROLE authenticated;
SELECT public.upt_update_own_profile(
 'Staff Test',
 'Rollbackstraat 1',
 '+3200000000',
 DATE '2000-01-02',
 '00.01.02-123.45',
 'BE68539007547034',
 NULL
);
DO $$
DECLARE p record;
BEGIN
 SELECT * INTO p FROM public.upt_own_profile_details();
 IF p.full_name <> 'Staff Test'
    OR p.home_address <> 'Rollbackstraat 1'
    OR p.iban <> 'BE68539007547034'
 THEN RAISE EXCEPTION 'FAIL own profile RPC'; END IF;
 BEGIN
   PERFORM home_address FROM public.profiles WHERE id=auth.uid();
   RAISE EXCEPTION 'FAIL sensitive profile direct read';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;

SELECT set_config('upt.test.private_chat',
  public.upt_create_private_chat((SELECT id FROM upt_new_ids WHERE name='other'))::text,
  true
);
SELECT set_config('upt.test.message',
  public.upt_send_message(current_setting('upt.test.private_chat')::uuid,'hello rollback',NULL)::text,
  true
);
DO $$
BEGIN
 IF NOT public.upt_can_read_channel(current_setting('upt.test.private_chat')::uuid) THEN
   RAISE EXCEPTION 'FAIL private chat membership';
 END IF;
 BEGIN
   PERFORM public.upt_moderate_message(current_setting('upt.test.message')::uuid,'staff should fail');
   RAISE EXCEPTION 'FAIL staff moderation';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM='FAIL staff moderation' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_new_ids WHERE name='lead'),true);
SET LOCAL ROLE authenticated;
SELECT set_config('upt.test.shift',
  public.upt_create_shift(
    (SELECT id FROM upt_new_ids WHERE name='bar'),
    (SELECT id FROM upt_new_ids WHERE name='staff'),
    'Bar crew',
    now()+interval '2 hours',
    now()+interval '4 hours',
    false
  )::text,
  true
);
DO $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.shifts
   WHERE id=current_setting('upt.test.shift')::uuid
     AND workplace_id=(SELECT id FROM upt_new_ids WHERE name='bar')
 ) THEN RAISE EXCEPTION 'FAIL responsible shift creation'; END IF;

 BEGIN
   PERFORM public.upt_create_shift(
     (SELECT id FROM upt_new_ids WHERE name='bar'),
     (SELECT id FROM upt_new_ids WHERE name='staff'),
     'Overlap',
     now()+interval '3 hours',
     now()+interval '5 hours',
     false
   );
   RAISE EXCEPTION 'FAIL overlap prevention';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM='FAIL overlap prevention' THEN RAISE; END IF;
 END;

 BEGIN
   PERFORM public.upt_create_shift(
     (SELECT id FROM upt_new_ids WHERE name='ticket'),
     (SELECT id FROM upt_new_ids WHERE name='staff'),
     'Unauthorized',
     now()+interval '6 hours',
     now()+interval '7 hours',
     false
   );
   RAISE EXCEPTION 'FAIL cross-workplace shift';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM='FAIL cross-workplace shift' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_new_ids WHERE name='staff'),true);
SET LOCAL ROLE authenticated;
SELECT set_config('upt.test.incident',
  public.upt_create_incident(
    (SELECT id FROM upt_new_ids WHERE name='event'),
    (SELECT id FROM upt_new_ids WHERE name='bar'),
    'Rollback urgent',
    NULL,
    50,
    4,
    8
  )::text,
  true
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_new_ids WHERE name='lead'),true);
SET LOCAL ROLE authenticated;
SELECT public.upt_acknowledge_incident(current_setting('upt.test.incident')::uuid);
SELECT public.upt_resolve_incident(current_setting('upt.test.incident')::uuid);
DO $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.incidents
   WHERE id=current_setting('upt.test.incident')::uuid
     AND status='resolved'
     AND acknowledged_at IS NOT NULL
     AND resolved_at IS NOT NULL
 ) THEN RAISE EXCEPTION 'FAIL incident lifecycle'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_new_ids WHERE name='admin'),true);
SET LOCAL ROLE authenticated;
SELECT public.upt_moderate_message(current_setting('upt.test.message')::uuid,'rollback moderation');
DO $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.messages
   WHERE id=current_setting('upt.test.message')::uuid
     AND moderated_at IS NOT NULL
 ) THEN RAISE EXCEPTION 'FAIL admin moderation'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.upt_audit_logs
   WHERE entity_id=current_setting('upt.test.message')::uuid
     AND action='MESSAGE_MODERATED'
 ) THEN RAISE EXCEPTION 'FAIL moderation audit'; END IF;
END $$;
RESET ROLE;

SELECT 'PASS: own profile RPC privacy, private chat, moderation authorization/audit, responsible scoped scheduling, overlap prevention, urgent incident resolution' AS result;
ROLLBACK;
