-- UPTILLDAWN Storage RLS policies
--
-- Required object path format:
--
-- profile-photos:
--   <user_uuid>/<filename>
--
-- checkin-selfies:
--   <user_uuid>/<filename>
--
-- incident-photos:
--   <user_uuid>/<filename>
--
-- chat-attachments:
--   <user_uuid>/<filename>
--
-- More restrictive event/workplace/channel based read access can be
-- added when uploads are linked to their database records.

-- ============================================================
-- PROFILE PHOTOS
-- User manages own files. Admin may read all.
-- ============================================================

CREATE POLICY "upt_profile_photos_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "upt_profile_photos_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.upt_is_admin(auth.uid())
  )
);

CREATE POLICY "upt_profile_photos_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'profile-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "upt_profile_photos_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.upt_is_admin(auth.uid())
  )
);

-- ============================================================
-- CHECK-IN SELFIES
-- Staff may upload/read their own selfie.
-- Admin may read all.
--
-- Responsible access will be added through a server-authorized
-- path once the selfie is linked to a check-in/event/workplace.
-- ============================================================

CREATE POLICY "upt_checkin_selfies_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'checkin-selfies'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "upt_checkin_selfies_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'checkin-selfies'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.upt_is_admin(auth.uid())
  )
);

CREATE POLICY "upt_checkin_selfies_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'checkin-selfies'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.upt_is_admin(auth.uid())
  )
);

-- ============================================================
-- INCIDENT PHOTOS
-- User may upload/read own files.
-- Admin may read/delete all.
-- Responsible access will later follow the linked incident.
-- ============================================================

CREATE POLICY "upt_incident_photos_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'incident-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "upt_incident_photos_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'incident-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.upt_is_admin(auth.uid())
  )
);

CREATE POLICY "upt_incident_photos_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'incident-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.upt_is_admin(auth.uid())
  )
);

-- ============================================================
-- CHAT ATTACHMENTS
-- For now uploader owns the object and admin may read/delete.
--
-- Channel-member read access will be added when the upload path
-- is linked authoritatively to messages/chat_channels.
-- ============================================================

CREATE POLICY "upt_chat_attachments_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "upt_chat_attachments_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.upt_is_admin(auth.uid())
  )
);

CREATE POLICY "upt_chat_attachments_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.upt_is_admin(auth.uid())
  )
);

