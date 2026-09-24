-- Storage RLS regression coverage for private crew media.
-- Synthetic fixtures only; the transaction is rolled back.
BEGIN;

CREATE TEMP TABLE upt_storage_ids(name text primary key, id uuid default gen_random_uuid());
INSERT INTO upt_storage_ids(name) VALUES
('admin'),('staff'),('other'),('lead'),('outsider'),('event'),('bar'),('channel'),('message'),('checkin'),('incident');
GRANT SELECT ON upt_storage_ids TO authenticated;

INSERT INTO auth.users(id,email)
SELECT id,name||'@storage.test'
FROM upt_storage_ids
WHERE name IN ('admin','staff','other','lead','outsider');

UPDATE public.profiles
SET approved = name <> 'outsider',
    role = CASE
      WHEN name='admin' THEN 'admin'
      WHEN name='lead' THEN 'responsible_lead'
      ELSE 'staff'
    END,
    full_name = initcap(name)||' Storage'
FROM upt_storage_ids i
WHERE profiles.id=i.id
  AND i.name IN ('admin','staff','other','lead','outsider');

INSERT INTO public.events(id,name,start_date,end_date,start_at,end_at)
SELECT id,'Storage rollback',now()-interval '1 hour',now()+interval '1 day',now()-interval '1 hour',now()+interval '1 day'
FROM upt_storage_ids WHERE name='event';

INSERT INTO public.workplaces(id,event_id,name)
VALUES(
 (SELECT id FROM upt_storage_ids WHERE name='bar'),
 (SELECT id FROM upt_storage_ids WHERE name='event'),
 'bar'
);

INSERT INTO public.event_members(event_id,user_id)
SELECT (SELECT id FROM upt_storage_ids WHERE name='event'),id
FROM upt_storage_ids
WHERE name IN ('staff','other','lead');

INSERT INTO public.responsible_assignments(event_id,workplace_id,user_id)
VALUES(
 (SELECT id FROM upt_storage_ids WHERE name='event'),
 (SELECT id FROM upt_storage_ids WHERE name='bar'),
 (SELECT id FROM upt_storage_ids WHERE name='lead')
);

UPDATE public.profiles
SET profile_photo_url=(SELECT id::text FROM upt_storage_ids WHERE name='staff')||'/profile.jpg'
WHERE id=(SELECT id FROM upt_storage_ids WHERE name='staff');

INSERT INTO public.check_ins(
 id,user_id,event_id,workplace_id,type,status,remote,selfie_path
)
VALUES(
 (SELECT id FROM upt_storage_ids WHERE name='checkin'),
 (SELECT id FROM upt_storage_ids WHERE name='staff'),
 (SELECT id FROM upt_storage_ids WHERE name='event'),
 (SELECT id FROM upt_storage_ids WHERE name='bar'),
 'remote','pending',true,
 (SELECT id::text FROM upt_storage_ids WHERE name='staff')||'/selfie.jpg'
);

INSERT INTO public.incidents(
 id,user_id,reporter_id,event_id,workplace_id,description,message,photo_path
)
VALUES(
 (SELECT id FROM upt_storage_ids WHERE name='incident'),
 (SELECT id FROM upt_storage_ids WHERE name='staff'),
 (SELECT id FROM upt_storage_ids WHERE name='staff'),
 (SELECT id FROM upt_storage_ids WHERE name='event'),
 (SELECT id FROM upt_storage_ids WHERE name='bar'),
 'Storage rollback incident','Storage rollback incident',
 (SELECT id::text FROM upt_storage_ids WHERE name='staff')||'/incident.jpg'
);

INSERT INTO public.chat_channels(id,kind,name)
VALUES((SELECT id FROM upt_storage_ids WHERE name='channel'),'private','rollback');
INSERT INTO public.chat_members(channel_id,user_id)
SELECT (SELECT id FROM upt_storage_ids WHERE name='channel'),id
FROM upt_storage_ids WHERE name IN ('staff','other');
INSERT INTO public.messages(id,user_id,sender_id,channel_id,body,content)
VALUES(
 (SELECT id FROM upt_storage_ids WHERE name='message'),
 (SELECT id FROM upt_storage_ids WHERE name='staff'),
 (SELECT id FROM upt_storage_ids WHERE name='staff'),
 (SELECT id FROM upt_storage_ids WHERE name='channel'),
 'rollback','rollback'
);
INSERT INTO public.message_attachments(message_id,file_url,storage_path,mime_type)
VALUES(
 (SELECT id FROM upt_storage_ids WHERE name='message'),
 (SELECT id::text FROM upt_storage_ids WHERE name='staff')||'/chat.jpg',
 (SELECT id::text FROM upt_storage_ids WHERE name='staff')||'/chat.jpg',
 'image/jpeg'
);

INSERT INTO storage.objects(bucket_id,name,owner,owner_id,metadata)
VALUES
('profile-photos',(SELECT id::text FROM upt_storage_ids WHERE name='staff')||'/profile.jpg',(SELECT id FROM upt_storage_ids WHERE name='staff'),(SELECT id::text FROM upt_storage_ids WHERE name='staff'),'{"mimetype":"image/jpeg"}'),
('checkin-selfies',(SELECT id::text FROM upt_storage_ids WHERE name='staff')||'/selfie.jpg',(SELECT id FROM upt_storage_ids WHERE name='staff'),(SELECT id::text FROM upt_storage_ids WHERE name='staff'),'{"mimetype":"image/jpeg"}'),
('incident-photos',(SELECT id::text FROM upt_storage_ids WHERE name='staff')||'/incident.jpg',(SELECT id FROM upt_storage_ids WHERE name='staff'),(SELECT id::text FROM upt_storage_ids WHERE name='staff'),'{"mimetype":"image/jpeg"}'),
('chat-attachments',(SELECT id::text FROM upt_storage_ids WHERE name='staff')||'/chat.jpg',(SELECT id FROM upt_storage_ids WHERE name='staff'),(SELECT id::text FROM upt_storage_ids WHERE name='staff'),'{"mimetype":"image/jpeg"}');

-- Approved ordinary crew: another approved permanent profile photo is intentionally directory-visible,
-- but operational private media must remain hidden unless linked authorization exists.
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_storage_ids WHERE name='other'),true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='profile-photos' AND split_part(name,'/',1)=(SELECT id::text FROM upt_storage_ids WHERE name='staff')) <> 1
 THEN RAISE EXCEPTION 'FAIL approved crew profile-photo read'; END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='checkin-selfies' AND split_part(name,'/',1)=(SELECT id::text FROM upt_storage_ids WHERE name='staff')) <> 0
 THEN RAISE EXCEPTION 'FAIL unrelated check-in selfie isolation'; END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='incident-photos' AND split_part(name,'/',1)=(SELECT id::text FROM upt_storage_ids WHERE name='staff')) <> 0
 THEN RAISE EXCEPTION 'FAIL unrelated incident photo isolation'; END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='chat-attachments' AND split_part(name,'/',1)=(SELECT id::text FROM upt_storage_ids WHERE name='staff')) <> 1
 THEN RAISE EXCEPTION 'FAIL private-chat attachment membership read'; END IF;
END $$;
RESET ROLE;

-- Responsible lead assigned to the workplace may read linked check-in/incident evidence,
-- but is not a member of the private 1:1 chat.
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_storage_ids WHERE name='lead'),true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='checkin-selfies' AND split_part(name,'/',1)=(SELECT id::text FROM upt_storage_ids WHERE name='staff')) <> 1
 THEN RAISE EXCEPTION 'FAIL responsible selfie access'; END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='incident-photos' AND split_part(name,'/',1)=(SELECT id::text FROM upt_storage_ids WHERE name='staff')) <> 1
 THEN RAISE EXCEPTION 'FAIL responsible incident-photo access'; END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='chat-attachments' AND split_part(name,'/',1)=(SELECT id::text FROM upt_storage_ids WHERE name='staff')) <> 0
 THEN RAISE EXCEPTION 'FAIL responsible private-chat isolation'; END IF;
END $$;
RESET ROLE;

-- Unapproved accounts must not gain reads through storage policies.
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_storage_ids WHERE name='outsider'),true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id IN ('profile-photos','checkin-selfies','incident-photos','chat-attachments') AND split_part(name,'/',1)=(SELECT id::text FROM upt_storage_ids WHERE name='staff')) <> 0
 THEN RAISE EXCEPTION 'FAIL unapproved storage read'; END IF;
END $$;
RESET ROLE;

-- Operational evidence must have no authenticated DELETE policy.
DO $$
BEGIN
 IF EXISTS (
   SELECT 1
   FROM pg_policies
   WHERE schemaname='storage'
     AND tablename='objects'
     AND cmd='DELETE'
     AND policyname IN (
       'upt_checkin_selfies_delete',
       'upt_incident_photos_delete',
       'upt_chat_attachments_delete'
     )
 ) THEN RAISE EXCEPTION 'FAIL operational media delete policy still present'; END IF;
END $$;

-- Owner can read own operational evidence and admin can read all four fixtures.
SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_storage_ids WHERE name='staff'),true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id IN ('profile-photos','checkin-selfies','incident-photos','chat-attachments') AND split_part(name,'/',1)=(SELECT id::text FROM upt_storage_ids WHERE name='staff')) <> 4
 THEN RAISE EXCEPTION 'FAIL owner storage read'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',(SELECT id::text FROM upt_storage_ids WHERE name='admin'),true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id IN ('profile-photos','checkin-selfies','incident-photos','chat-attachments') AND split_part(name,'/',1)=(SELECT id::text FROM upt_storage_ids WHERE name='staff')) <> 4
 THEN RAISE EXCEPTION 'FAIL admin storage read'; END IF;
END $$;
RESET ROLE;

SELECT 'PASS: storage owner/admin access, unapproved denial, workplace evidence scoping and private-chat attachment isolation' AS result;
ROLLBACK;
