-- Safe crew directory, private 1:1 chats, controlled photo messages and audited admin moderation.

CREATE OR REPLACE FUNCTION public.upt_crew_directory()
RETURNS TABLE(
  id uuid,
  full_name text,
  phone_number text,
  profile_photo_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.upt_is_approved() THEN
    RAISE EXCEPTION 'ACCOUNT NOT APPROVED';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.phone_number, p.profile_photo_url
  FROM public.profiles p
  WHERE p.approved = true
  ORDER BY p.full_name NULLS LAST, p.id;
END;
$$;

DROP POLICY IF EXISTS "upt_profile_photos_read" ON storage.objects;
CREATE POLICY "upt_profile_photos_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND public.upt_is_approved()
  AND (
    split_part(name, '/', 1) = auth.uid()::text
    OR public.upt_is_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.approved = true
        AND p.profile_photo_url = name
    )
  )
);

CREATE OR REPLACE FUNCTION public.upt_create_private_chat(p_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_channel uuid;
  v_pair text;
BEGIN
  IF NOT public.upt_is_approved() THEN
    RAISE EXCEPTION 'ACCOUNT NOT APPROVED';
  END IF;

  IF p_user IS NULL OR p_user = v_actor THEN
    RAISE EXCEPTION 'Ongeldige gesprekspartner.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user AND p.approved = true
  ) THEN
    RAISE EXCEPTION 'Crewlid niet beschikbaar.';
  END IF;

  v_pair := least(v_actor::text, p_user::text) || ':' || greatest(v_actor::text, p_user::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_pair, 0));

  SELECT c.id INTO v_channel
  FROM public.chat_channels c
  WHERE c.kind = 'private'
    AND EXISTS (
      SELECT 1 FROM public.chat_members m
      WHERE m.channel_id = c.id AND m.user_id = v_actor
    )
    AND EXISTS (
      SELECT 1 FROM public.chat_members m
      WHERE m.channel_id = c.id AND m.user_id = p_user
    )
    AND 2 = (
      SELECT count(*) FROM public.chat_members m
      WHERE m.channel_id = c.id
    )
  ORDER BY c.created_at
  LIMIT 1;

  IF v_channel IS NULL THEN
    INSERT INTO public.chat_channels(kind, name)
    VALUES ('private', NULL)
    RETURNING id INTO v_channel;

    INSERT INTO public.chat_members(channel_id, user_id)
    VALUES (v_channel, v_actor), (v_channel, p_user);

    INSERT INTO public.upt_audit_logs(actor_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_actor,
      'PRIVATE_CHAT_CREATED',
      'chat_channel',
      v_channel,
      jsonb_build_object('peer_id', p_user)
    );
  END IF;

  RETURN v_channel;
END;
$$;

CREATE OR REPLACE FUNCTION public.upt_private_chat_peers()
RETURNS TABLE(
  channel_id uuid,
  user_id uuid,
  full_name text,
  phone_number text,
  profile_photo_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.upt_is_approved() THEN
    RAISE EXCEPTION 'ACCOUNT NOT APPROVED';
  END IF;

  RETURN QUERY
  SELECT c.id, p.id, p.full_name, p.phone_number, p.profile_photo_url
  FROM public.chat_channels c
  JOIN public.chat_members mine
    ON mine.channel_id = c.id
   AND mine.user_id = auth.uid()
  JOIN public.chat_members peer
    ON peer.channel_id = c.id
   AND peer.user_id <> auth.uid()
  JOIN public.profiles p
    ON p.id = peer.user_id
   AND p.approved = true
  WHERE c.kind = 'private'
  ORDER BY c.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.upt_send_message(
  p_channel uuid,
  p_body text DEFAULT NULL,
  p_attachment_path text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_body text := NULLIF(trim(coalesce(p_body, '')), '');
  v_path text := NULLIF(trim(coalesce(p_attachment_path, '')), '');
  v_message uuid;
  v_mime text;
BEGIN
  IF NOT public.upt_is_approved() THEN
    RAISE EXCEPTION 'ACCOUNT NOT APPROVED';
  END IF;

  IF NOT public.upt_can_read_channel(p_channel) THEN
    RAISE EXCEPTION 'Geen toegang tot chat.';
  END IF;

  IF v_body IS NOT NULL AND length(v_body) > 4000 THEN
    RAISE EXCEPTION 'Bericht is te lang.';
  END IF;

  IF v_body IS NULL AND v_path IS NULL THEN
    RAISE EXCEPTION 'Leeg bericht.';
  END IF;

  IF v_path IS NOT NULL THEN
    IF split_part(v_path, '/', 1) <> v_actor::text THEN
      RAISE EXCEPTION 'Ongeldig bijlagepad.';
    END IF;

    SELECT o.metadata->>'mimetype'
    INTO v_mime
    FROM storage.objects o
    WHERE o.bucket_id = 'chat-attachments'
      AND o.name = v_path;

    IF v_mime IS NULL OR v_mime NOT IN ('image/jpeg','image/png','image/webp') THEN
      RAISE EXCEPTION 'Ongeldige chatbijlage.';
    END IF;
  END IF;

  INSERT INTO public.messages(user_id, sender_id, channel_id, body, content)
  VALUES (v_actor, v_actor, p_channel, v_body, v_body)
  RETURNING id INTO v_message;

  IF v_path IS NOT NULL THEN
    INSERT INTO public.message_attachments(message_id, file_url, storage_path, mime_type)
    VALUES (v_message, v_path, v_path, v_mime);
  END IF;

  RETURN v_message;
END;
$$;

CREATE OR REPLACE FUNCTION public.upt_moderate_message(
  p_message uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := NULLIF(trim(coalesce(p_reason, '')), '');
  v_message public.messages%ROWTYPE;
BEGIN
  IF NOT public.upt_is_admin(v_actor) THEN
    RAISE EXCEPTION 'Geen toegang.';
  END IF;

  IF v_reason IS NULL OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Reden is verplicht en maximaal 500 tekens.';
  END IF;

  SELECT * INTO v_message
  FROM public.messages
  WHERE id = p_message
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bericht niet gevonden.';
  END IF;

  IF v_message.moderated_at IS NULL THEN
    UPDATE public.messages
    SET moderated_at = now(),
        moderated_by = v_actor
    WHERE id = p_message;

    INSERT INTO public.upt_audit_logs(actor_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_actor,
      'MESSAGE_MODERATED',
      'message',
      p_message,
      jsonb_build_object('reason', v_reason, 'channel_id', v_message.channel_id)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.upt_crew_directory() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upt_create_private_chat(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upt_private_chat_peers() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upt_send_message(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upt_moderate_message(uuid,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.upt_crew_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upt_create_private_chat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upt_private_chat_peers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upt_send_message(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upt_moderate_message(uuid,text) TO authenticated;
