-- Queued incident/chat photo idempotency regression test.
-- Run in one connection. All synthetic fixtures are rolled back.
BEGIN;
CREATE TEMP TABLE upt_upload_ids(name text primary key, id uuid default gen_random_uuid());
INSERT INTO upt_upload_ids(name) VALUES ('staff'),('other'),('event'),('bar'),('attach_op'),('message_op');
GRANT SELECT ON upt_upload_ids TO authenticated;

INSERT INTO auth.users(id,email)
SELECT id,name||'@upload.test' FROM upt_upload_ids WHERE name IN ('staff','other');
UPDATE public.profiles SET approved=true,role='staff'
WHERE id IN (SELECT id FROM upt_upload_ids WHERE name IN ('staff','other'));

INSERT INTO public.events(id,name,start_date,end_date,start_at,end_at)
SELECT id,'Upload rollback',now()-interval '1 hour',now()+interval '1 day',now()-interval '1 hour',now()+interval '1 day'
FROM upt_upload_ids WHERE name='event';
INSERT INTO public.workplaces(id,event_id,name)
VALUES(
 (SELECT id FROM upt_upload_ids WHERE name='bar'),
 (SELECT id FROM upt_upload_ids WHERE name='event'),
 'bar'
);
INSERT INTO public.event_members(event_id,user_id)
SELECT (SELECT id FROM upt_upload_ids WHERE name='event'),id
FROM upt_upload_ids WHERE name IN ('staff','other');

INSERT INTO public.shifts(event_id,workplace_id,user_id,start_time,end_time,scheduled_start,scheduled_end)
VALUES(
 (SELECT id FROM upt_upload_ids WHERE name='event'),
 (SELECT id FROM upt_upload_ids WHERE name='bar'),
 (SELECT id FROM upt_upload_ids WHERE name='staff'),
 now()-interval '1 hour',now()+interval '2 hours',now()-interval '1 hour',now()+interval '2 hours'
);

INSERT INTO storage.objects(bucket_id,name,owner,owner_id,metadata)
VALUES
(
 'incident-photos',
 (SELECT id::text FROM upt_upload_ids WHERE name='staff')||'/rollback.jpg',
 (SELECT id FROM upt_upload_ids WHERE name='staff'),
 (SELECT id::text FROM upt_upload_ids WHERE name='staff'),
 '{"mimetype":"image/jpeg"}'::jsonb
),
(
 'chat-attachments',
 (SELECT id::text FROM upt_upload_ids WHERE name='staff')||'/rollback-chat.jpg',
 (SELECT id FROM upt_upload_ids WHERE name='staff'),
 (SELECT id::text FROM upt_upload_ids WHERE name='staff'),
 '{"mimetype":"image/jpeg"}'::jsonb
);

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_upload_ids WHERE name='staff'),true);
SET LOCAL ROLE authenticated;

SELECT set_config(
 'upt.upload.incident',
 public.upt_create_incident(
  (SELECT id FROM upt_upload_ids WHERE name='event'),
  (SELECT id FROM upt_upload_ids WHERE name='bar'),
  'queued photo rollback',NULL,NULL,NULL,NULL
 )::text,true
);

SELECT public.upt_attach_incident_photo(
 (SELECT id FROM upt_upload_ids WHERE name='attach_op'),
 current_setting('upt.upload.incident')::uuid,
 (SELECT id::text FROM upt_upload_ids WHERE name='staff')||'/rollback.jpg'
);
SELECT public.upt_attach_incident_photo(
 (SELECT id FROM upt_upload_ids WHERE name='attach_op'),
 current_setting('upt.upload.incident')::uuid,
 (SELECT id::text FROM upt_upload_ids WHERE name='staff')||'/rollback.jpg'
);

SELECT set_config(
 'upt.upload.chat',
 (
  SELECT id::text
  FROM public.chat_channels
  WHERE kind='workplace'
    AND workplace_id=(SELECT id FROM upt_upload_ids WHERE name='bar')
  LIMIT 1
 ),
 true
);
SELECT set_config(
 'upt.upload.message',
 public.upt_send_photo_message_operation(
  (SELECT id FROM upt_upload_ids WHERE name='message_op'),
  current_setting('upt.upload.chat')::uuid,
  'photo rollback',
  (SELECT id::text FROM upt_upload_ids WHERE name='staff')||'/rollback-chat.jpg'
 )::text,true
);
SELECT public.upt_send_photo_message_operation(
 (SELECT id FROM upt_upload_ids WHERE name='message_op'),
 current_setting('upt.upload.chat')::uuid,
 'photo rollback',
 (SELECT id::text FROM upt_upload_ids WHERE name='staff')||'/rollback-chat.jpg'
);

DO $$
BEGIN
 IF (SELECT photo_path FROM public.incidents WHERE id=current_setting('upt.upload.incident')::uuid)
    <> (SELECT id::text FROM upt_upload_ids WHERE name='staff')||'/rollback.jpg'
 THEN RAISE EXCEPTION 'FAIL queued incident photo'; END IF;

 IF (SELECT count(*) FROM public.messages WHERE id=current_setting('upt.upload.message')::uuid) <> 1
 THEN RAISE EXCEPTION 'FAIL queued chat idempotency'; END IF;

 IF NOT EXISTS(
  SELECT 1 FROM public.message_attachments
  WHERE message_id=current_setting('upt.upload.message')::uuid
 )
 THEN RAISE EXCEPTION 'FAIL queued chat attachment'; END IF;

 IF (SELECT count(*) FROM public.offline_operation_records
     WHERE id IN (
       (SELECT id FROM upt_upload_ids WHERE name='attach_op'),
       (SELECT id FROM upt_upload_ids WHERE name='message_op')
     )) <> 2
 THEN RAISE EXCEPTION 'FAIL queued upload operation records'; END IF;
END $$;

RESET ROLE;
SELECT 'PASS: queued incident/chat photo RPC idempotency' AS result;
ROLLBACK;
