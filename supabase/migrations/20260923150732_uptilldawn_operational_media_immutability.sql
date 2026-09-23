-- Operational media is evidence attached to check-ins, incidents and chat records.
-- Ordinary users must not be able to erase those files after server acceptance.
-- Keep profile-photo deletion separate because users replace their own permanent profile photo.

DROP POLICY IF EXISTS "upt_checkin_selfies_delete" ON storage.objects;
DROP POLICY IF EXISTS "upt_incident_photos_delete" ON storage.objects;
DROP POLICY IF EXISTS "upt_chat_attachments_delete" ON storage.objects;

-- No replacement DELETE policy is created for these buckets.
-- Authenticated clients can therefore not directly delete operational evidence.
