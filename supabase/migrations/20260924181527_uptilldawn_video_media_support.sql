update storage.buckets
set file_size_limit=52428800,
    allowed_mime_types=array[
      'image/jpeg','image/png','image/webp',
      'video/mp4','video/webm','video/quicktime'
    ]::text[]
where id in ('incident-photos','chat-attachments','work-media');

create or replace function public.upt_attach_incident_photo(
  p_operation uuid,
  p_incident uuid,
  p_photo_path text
)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_actor uuid:=auth.uid();
  v_old public.offline_operation_records%rowtype;
  v_incident public.incidents%rowtype;
  v_path text:=trim(coalesce(p_photo_path,''));
  v_payload jsonb;
  v_mime text;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if p_operation is null or p_incident is null or v_path='' then raise exception 'Ongeldige uploadbewerking.'; end if;

  v_payload:=jsonb_build_object('incident_id',p_incident,'photo_path',v_path);
  perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));

  select * into v_old from public.offline_operation_records where id=p_operation;
  if found then
    if v_old.user_id<>v_actor
       or v_old.operation_type<>'incident_photo_attach'
       or v_old.payload<>v_payload then
      raise exception 'Operation ID conflict';
    end if;
    return p_incident;
  end if;

  select * into v_incident from public.incidents where id=p_incident for update;
  if not found or coalesce(v_incident.reporter_id,v_incident.user_id)<>v_actor then
    raise exception 'Incident is niet van deze gebruiker.';
  end if;

  if split_part(v_path,'/',1)<>v_actor::text then raise exception 'Ongeldig mediapad.'; end if;

  select o.metadata->>'mimetype' into v_mime
  from storage.objects o
  where o.bucket_id='incident-photos' and o.name=v_path;

  if v_mime is null or v_mime not in (
    'image/jpeg','image/png','image/webp',
    'video/mp4','video/webm','video/quicktime'
  ) then
    raise exception 'Ongeldige incidentmedia.';
  end if;

  if v_incident.photo_path is not null and v_incident.photo_path<>v_path then
    raise exception 'Incident heeft al andere media.';
  end if;

  update public.incidents
  set photo_path=v_path,updated_at=now()
  where id=p_incident and photo_path is distinct from v_path;

  insert into public.offline_operation_records(id,user_id,operation_type,payload,status,result,synced_at)
  values(p_operation,v_actor,'incident_photo_attach',v_payload,'synced',
         jsonb_build_object('id',p_incident,'server_timestamp',now()),now());

  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_actor,'INCIDENT_MEDIA_ATTACHED','incidents',p_incident,
         jsonb_build_object('queued_upload',true,'mime_type',v_mime));

  return p_incident;
end;
$$;

create or replace function public.upt_send_photo_message_operation(
  p_operation uuid,
  p_channel uuid,
  p_body text,
  p_attachment_path text
)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_actor uuid:=auth.uid();
  v_old public.offline_operation_records%rowtype;
  v_body text:=nullif(trim(coalesce(p_body,'')),'');
  v_path text:=trim(coalesce(p_attachment_path,''));
  v_payload jsonb;
  v_mime text;
  v_message uuid;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if p_operation is null or p_channel is null or v_path='' then raise exception 'Ongeldige uploadbewerking.'; end if;
  if v_body is not null and length(v_body)>4000 then raise exception 'Bericht is te lang.'; end if;
  if not public.upt_can_read_channel(p_channel) then raise exception 'Geen toegang tot chat.'; end if;
  if split_part(v_path,'/',1)<>v_actor::text then raise exception 'Ongeldig bijlagepad.'; end if;

  v_payload:=jsonb_build_object(
    'channel_id',p_channel,
    'body',coalesce(v_body,''),
    'attachment_path',v_path
  );
  perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));

  select * into v_old from public.offline_operation_records where id=p_operation;
  if found then
    if v_old.user_id<>v_actor
       or v_old.operation_type<>'chat_photo_message'
       or v_old.payload<>v_payload then
      raise exception 'Operation ID conflict';
    end if;
    return (v_old.result->>'id')::uuid;
  end if;

  select o.metadata->>'mimetype' into v_mime
  from storage.objects o
  where o.bucket_id='chat-attachments' and o.name=v_path;

  if v_mime is null or v_mime not in (
    'image/jpeg','image/png','image/webp',
    'video/mp4','video/webm','video/quicktime'
  ) then
    raise exception 'Ongeldige chatbijlage.';
  end if;

  insert into public.messages(user_id,sender_id,channel_id,body,content)
  values(v_actor,v_actor,p_channel,v_body,v_body)
  returning id into v_message;

  insert into public.message_attachments(message_id,file_url,storage_path,mime_type)
  values(v_message,v_path,v_path,v_mime);

  insert into public.offline_operation_records(id,user_id,operation_type,payload,status,result,synced_at)
  values(p_operation,v_actor,'chat_photo_message',v_payload,'synced',
         jsonb_build_object('id',v_message,'server_timestamp',now()),now());

  return v_message;
end;
$$;

notify pgrst,'reload schema';
