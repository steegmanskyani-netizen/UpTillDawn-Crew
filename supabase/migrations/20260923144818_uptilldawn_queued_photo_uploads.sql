-- Idempotent queued photo uploads for offline incident and chat workflows.

CREATE OR REPLACE FUNCTION public.upt_attach_incident_photo(
  p_operation uuid,
  p_incident uuid,
  p_photo_path text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old public.offline_operation_records%ROWTYPE;
  v_incident public.incidents%ROWTYPE;
  v_path text := trim(coalesce(p_photo_path, ''));
  v_payload jsonb;
  v_mime text;
BEGIN
  IF NOT public.upt_is_approved() THEN
    RAISE EXCEPTION 'ACCOUNT NOT APPROVED';
  END IF;
  IF p_operation IS NULL OR p_incident IS NULL OR v_path = '' THEN
    RAISE EXCEPTION 'Ongeldige uploadbewerking.';
  END IF;

  v_payload := jsonb_build_object('incident_id', p_incident, 'photo_path', v_path);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text, 0));

  SELECT * INTO v_old
  FROM public.offline_operation_records
  WHERE id = p_operation;

  IF FOUND THEN
    IF v_old.user_id <> v_actor
       OR v_old.operation_type <> 'incident_photo_attach'
       OR v_old.payload <> v_payload THEN
      RAISE EXCEPTION 'Operation ID conflict';
    END IF;
    RETURN p_incident;
  END IF;

  SELECT * INTO v_incident
  FROM public.incidents
  WHERE id = p_incident
  FOR UPDATE;

  IF NOT FOUND OR coalesce(v_incident.reporter_id, v_incident.user_id) <> v_actor THEN
    RAISE EXCEPTION 'Incident is niet van deze gebruiker.';
  END IF;

  IF split_part(v_path, '/', 1) <> v_actor::text THEN
    RAISE EXCEPTION 'Ongeldig fotopad.';
  END IF;

  SELECT o.metadata->>'mimetype'
  INTO v_mime
  FROM storage.objects o
  WHERE o.bucket_id = 'incident-photos'
    AND o.name = v_path;

  IF v_mime IS NULL OR v_mime NOT IN ('image/jpeg','image/png','image/webp') THEN
    RAISE EXCEPTION 'Ongeldige incidentfoto.';
  END IF;

  IF v_incident.photo_path IS NOT NULL AND v_incident.photo_path <> v_path THEN
    RAISE EXCEPTION 'Incident heeft al een andere foto.';
  END IF;

  UPDATE public.incidents
  SET photo_path = v_path,
      updated_at = now()
  WHERE id = p_incident
    AND photo_path IS DISTINCT FROM v_path;

  INSERT INTO public.offline_operation_records(
    id,user_id,operation_type,payload,status,result,synced_at
  )
  VALUES(
    p_operation,v_actor,'incident_photo_attach',v_payload,'synced',
    jsonb_build_object('id',p_incident,'server_timestamp',now()),now()
  );

  INSERT INTO public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  VALUES(v_actor,'INCIDENT_PHOTO_ATTACHED','incidents',p_incident,jsonb_build_object('queued_upload',true));

  RETURN p_incident;
END;
$$;

CREATE OR REPLACE FUNCTION public.upt_send_photo_message_operation(
  p_operation uuid,
  p_channel uuid,
  p_body text,
  p_attachment_path text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old public.offline_operation_records%ROWTYPE;
  v_body text := NULLIF(trim(coalesce(p_body, '')), '');
  v_path text := trim(coalesce(p_attachment_path, ''));
  v_payload jsonb;
  v_mime text;
  v_message uuid;
BEGIN
  IF NOT public.upt_is_approved() THEN
    RAISE EXCEPTION 'ACCOUNT NOT APPROVED';
  END IF;
  IF p_operation IS NULL OR p_channel IS NULL OR v_path = '' THEN
    RAISE EXCEPTION 'Ongeldige uploadbewerking.';
  END IF;
  IF v_body IS NOT NULL AND length(v_body) > 4000 THEN
    RAISE EXCEPTION 'Bericht is te lang.';
  END IF;
  IF NOT public.upt_can_read_channel(p_channel) THEN
    RAISE EXCEPTION 'Geen toegang tot chat.';
  END IF;
  IF split_part(v_path, '/', 1) <> v_actor::text THEN
    RAISE EXCEPTION 'Ongeldig bijlagepad.';
  END IF;

  v_payload := jsonb_build_object(
    'channel_id', p_channel,
    'body', coalesce(v_body, ''),
    'attachment_path', v_path
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation::text, 0));

  SELECT * INTO v_old
  FROM public.offline_operation_records
  WHERE id = p_operation;

  IF FOUND THEN
    IF v_old.user_id <> v_actor
       OR v_old.operation_type <> 'chat_photo_message'
       OR v_old.payload <> v_payload THEN
      RAISE EXCEPTION 'Operation ID conflict';
    END IF;
    RETURN (v_old.result->>'id')::uuid;
  END IF;

  SELECT o.metadata->>'mimetype'
  INTO v_mime
  FROM storage.objects o
  WHERE o.bucket_id = 'chat-attachments'
    AND o.name = v_path;

  IF v_mime IS NULL OR v_mime NOT IN ('image/jpeg','image/png','image/webp') THEN
    RAISE EXCEPTION 'Ongeldige chatbijlage.';
  END IF;

  INSERT INTO public.messages(user_id,sender_id,channel_id,body,content)
  VALUES(v_actor,v_actor,p_channel,v_body,v_body)
  RETURNING id INTO v_message;

  INSERT INTO public.message_attachments(message_id,file_url,storage_path,mime_type)
  VALUES(v_message,v_path,v_path,v_mime);

  INSERT INTO public.offline_operation_records(
    id,user_id,operation_type,payload,status,result,synced_at
  )
  VALUES(
    p_operation,v_actor,'chat_photo_message',v_payload,'synced',
    jsonb_build_object('id',v_message,'server_timestamp',now()),now()
  );

  RETURN v_message;
END;
$$;

REVOKE ALL ON FUNCTION public.upt_attach_incident_photo(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upt_send_photo_message_operation(uuid,uuid,text,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.upt_attach_incident_photo(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upt_send_photo_message_operation(uuid,uuid,text,text) TO authenticated;
