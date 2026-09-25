alter policy upt_chat_attachments_insert on storage.objects
  with check (
    bucket_id='chat-attachments'
    and public.upt_is_approved()
    and (storage.foldername(name))[1]=(select auth.uid())::text
  );

alter policy upt_checkin_selfies_insert on storage.objects
  with check (
    bucket_id='checkin-selfies'
    and public.upt_is_approved()
    and (storage.foldername(name))[1]=(select auth.uid())::text
  );

alter policy upt_incident_photos_insert on storage.objects
  with check (
    bucket_id='incident-photos'
    and public.upt_is_approved()
    and (storage.foldername(name))[1]=(select auth.uid())::text
  );

alter policy upt_profile_photos_insert on storage.objects
  with check (
    bucket_id='profile-photos'
    and public.upt_is_approved()
    and (storage.foldername(name))[1]=(select auth.uid())::text
  );

alter policy upt_profile_photos_update on storage.objects
  using (
    bucket_id='profile-photos'
    and public.upt_is_approved()
    and (storage.foldername(name))[1]=(select auth.uid())::text
  )
  with check (
    bucket_id='profile-photos'
    and public.upt_is_approved()
    and (storage.foldername(name))[1]=(select auth.uid())::text
  );

alter policy upt_profile_photos_delete on storage.objects
  using (
    bucket_id='profile-photos'
    and public.upt_is_approved()
    and (
      (storage.foldername(name))[1]=(select auth.uid())::text
      or public.upt_is_admin((select auth.uid()))
    )
  );
