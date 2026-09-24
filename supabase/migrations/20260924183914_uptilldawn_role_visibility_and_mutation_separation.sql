create or replace function public.upt_feature_visible(
  p_feature text,
  p_event uuid default null,
  p_workplace uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare
  v_user uuid:=auth.uid();
  v_role text;
  v_rule public.role_ui_rules%rowtype;
begin
  if v_user is null or not public.upt_is_approved() then return false; end if;

  select p.role into v_role
  from public.profiles p
  where p.id=v_user and p.approved=true;

  if v_role='admin' then return true; end if;
  if v_role not in ('staff','responsible_lead') then return false; end if;

  select * into v_rule
  from public.role_ui_rules r
  where r.role=v_role and r.feature_key=p_feature;

  if not found or not v_rule.visible then return false; end if;

  case v_rule.condition_key
    when 'always' then return true;
    when 'assigned_event' then
      return exists(
        select 1 from public.event_members em
        where em.user_id=v_user
          and (p_event is null or em.event_id=p_event)
          and exists(
            select 1 from public.events e
            where e.id=em.event_id and e.status<>'archived' and now()<=e.end_at
          )
      );
    when 'assigned_workplace_role' then
      return exists(
        select 1
        from public.shifts s join public.events e on e.id=s.event_id
        where s.user_id=v_user and s.status<>'cancelled'
          and (p_event is null or s.event_id=p_event)
          and (p_workplace is null or s.workplace_id=p_workplace)
          and e.status<>'archived' and now()<=e.end_at
      ) or exists(
        select 1
        from public.responsible_assignments r join public.events e on e.id=r.event_id
        where r.user_id=v_user
          and (p_event is null or r.event_id=p_event)
          and (p_workplace is null or r.workplace_id=p_workplace)
          and e.status<>'archived' and now()<=e.end_at
      );
    when 'event_active' then
      return exists(
        select 1
        from public.event_members em join public.events e on e.id=em.event_id
        where em.user_id=v_user
          and (p_event is null or e.id=p_event)
          and e.status<>'archived'
          and now() between e.start_at and e.end_at
      );
    when 'shift_active' then
      return exists(
        select 1
        from public.shifts s join public.events e on e.id=s.event_id
        where s.user_id=v_user and s.status<>'cancelled'
          and (p_event is null or s.event_id=p_event)
          and (p_workplace is null or s.workplace_id=p_workplace)
          and now() between s.scheduled_start and s.scheduled_end
          and e.status<>'archived'
      );
    when 'never' then return false;
    else return false;
  end case;
end;
$$;

revoke all on function public.upt_feature_visible(text,uuid,uuid) from public,anon;
grant execute on function public.upt_feature_visible(text,uuid,uuid) to authenticated;

create or replace function public.upt_feature_allowed(
  p_feature text,
  p_event uuid default null,
  p_workplace uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
declare
  v_role text;
  v_enabled boolean;
begin
  if auth.uid() is null or not public.upt_is_approved() then return false; end if;

  select role into v_role from public.profiles where id=auth.uid() and approved=true;
  if v_role='admin' then return true; end if;

  if not public.upt_feature_visible(p_feature,p_event,p_workplace) then return false; end if;

  select enabled into v_enabled
  from public.role_ui_rules
  where role=v_role and feature_key=p_feature;

  return coalesce(v_enabled,false);
end;
$$;

revoke all on function public.upt_feature_allowed(text,uuid,uuid) from public,anon;
grant execute on function public.upt_feature_allowed(text,uuid,uuid) to authenticated;

-- Reads follow visibility; mutations continue to use allowed/enabled.
drop policy if exists upt_role_feature_window on public.shifts;
create policy upt_role_feature_window on public.shifts
as restrictive for select to authenticated
using (public.upt_is_admin() or public.upt_feature_visible('shifts',event_id,workplace_id));

drop policy if exists upt_role_feature_window on public.workplaces;
create policy upt_role_feature_window on public.workplaces
as restrictive for select to authenticated
using (public.upt_is_admin() or public.upt_feature_visible('workplaces',event_id,id));

drop policy if exists upt_role_feature_window on public.briefings;
create policy upt_role_feature_window on public.briefings
as restrictive for select to authenticated
using (public.upt_is_admin() or public.upt_feature_visible('briefings',event_id,workplace_id));

drop policy if exists upt_role_feature_window on public.personal_instructions;
create policy upt_role_feature_window on public.personal_instructions
as restrictive for select to authenticated
using (public.upt_is_admin() or public.upt_feature_visible('briefings',event_id,workplace_id));

drop policy if exists upt_role_feature_window on public.tasks;
create policy upt_role_feature_window on public.tasks
as restrictive for select to authenticated
using (public.upt_is_admin() or public.upt_feature_visible('tasks',event_id,workplace_id));

drop policy if exists upt_role_feature_window on public.task_assignments;
create policy upt_role_feature_window on public.task_assignments
as restrictive for select to authenticated
using (
  public.upt_is_admin()
  or exists(
    select 1 from public.tasks t
    where t.id=task_assignments.task_id
      and public.upt_feature_visible('tasks',t.event_id,t.workplace_id)
  )
);

drop policy if exists upt_role_feature_window on public.incidents;
create policy upt_role_feature_window on public.incidents
as restrictive for select to authenticated
using (public.upt_is_admin() or public.upt_feature_visible('incidents',event_id,workplace_id));

drop policy if exists upt_role_feature_insert on public.incidents;
create policy upt_role_feature_insert on public.incidents
as restrictive for insert to authenticated
with check (public.upt_is_admin() or public.upt_feature_allowed('incidents',event_id,workplace_id));

drop policy if exists upt_role_feature_availability_select on public.event_availability;
create policy upt_role_feature_availability_select on public.event_availability
as restrictive for select to authenticated
using (public.upt_is_admin() or public.upt_feature_visible('events',event_id,null));

drop policy if exists upt_role_feature_availability_insert on public.event_availability;
create policy upt_role_feature_availability_insert on public.event_availability
as restrictive for insert to authenticated
with check (public.upt_is_admin() or public.upt_feature_allowed('events',event_id,null));

drop policy if exists upt_role_feature_availability_update on public.event_availability;
create policy upt_role_feature_availability_update on public.event_availability
as restrictive for update to authenticated
using (public.upt_is_admin() or public.upt_feature_visible('events',event_id,null))
with check (public.upt_is_admin() or public.upt_feature_allowed('events',event_id,null));

create or replace function public.upt_can_read_channel(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path='public','pg_temp'
as $$
  select public.upt_is_approved()
    and exists(
      select 1
      from public.chat_channels c
      where c.id=p_channel
        and public.upt_feature_visible('chat',c.event_id,null)
        and (
          c.kind='organization'
          or (
            c.kind='event'
            and c.event_id is not null
            and exists(
              select 1 from public.events e
              where e.id=c.event_id
                and e.status<>'archived'
                and now()>=e.start_at
                and now()<=e.end_at+interval '3 days'
            )
            and (
              public.upt_is_admin()
              or exists(
                select 1 from public.event_members em
                where em.event_id=c.event_id and em.user_id=auth.uid()
              )
            )
          )
        )
    );
$$;

create or replace function public.upt_crew_directory()
returns table(id uuid,full_name text,phone_number text,profile_photo_url text)
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $$
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if not public.upt_feature_visible('crew',null,null) then
    raise exception 'Personeel is voor jouw rol niet zichtbaar.';
  end if;

  return query
  select p.id,p.full_name,p.phone_number,p.profile_photo_url
  from public.profiles p
  where p.approved=true
  order by p.full_name nulls last,p.id;
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
set search_path='public','pg_temp'
as $$
declare
  v_actor uuid:=auth.uid();
  v_old public.offline_operation_records%rowtype;
  v_body text:=nullif(trim(coalesce(p_body,'')),'');
  v_path text:=trim(coalesce(p_attachment_path,''));
  v_payload jsonb;
  v_mime text;
  v_message uuid;
  v_event uuid;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if p_operation is null or p_channel is null or v_path='' then raise exception 'Ongeldige uploadbewerking.'; end if;
  if v_body is not null and length(v_body)>4000 then raise exception 'Bericht is te lang.'; end if;
  if not public.upt_can_read_channel(p_channel) then raise exception 'Geen toegang tot chat.'; end if;

  select event_id into v_event from public.chat_channels where id=p_channel;
  if not public.upt_feature_allowed('chat',v_event,null) then raise exception 'Chat is momenteel alleen-lezen.'; end if;

  if split_part(v_path,'/',1)<>v_actor::text then raise exception 'Ongeldig bijlagepad.'; end if;

  v_payload:=jsonb_build_object('channel_id',p_channel,'body',coalesce(v_body,''),'attachment_path',v_path);
  perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));

  select * into v_old from public.offline_operation_records where id=p_operation;
  if found then
    if v_old.user_id<>v_actor or v_old.operation_type<>'chat_photo_message' or v_old.payload<>v_payload then
      raise exception 'Operation ID conflict';
    end if;
    return (v_old.result->>'id')::uuid;
  end if;

  select o.metadata->>'mimetype' into v_mime
  from storage.objects o
  where o.bucket_id='chat-attachments' and o.name=v_path;

  if v_mime is null or v_mime not in (
    'image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'
  ) then raise exception 'Ongeldige chatbijlage.'; end if;

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

create or replace function public.upt_sync_operation(p_id uuid,p_type text,p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  old public.offline_operation_records%rowtype;
  result_value jsonb;
  entity uuid;
  workplace uuid;
  event uuid;
  evidence jsonb;
  session_ref uuid;
  break_ref uuid;
  channel_event uuid;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if p_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>20000 then raise exception 'Invalid operation'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into old from public.offline_operation_records where id=p_id;
  if found then
    if old.user_id<>auth.uid() or old.operation_type<>p_type or old.payload<>p_payload then raise exception 'Operation ID conflict'; end if;
    return old.result;
  end if;

  case p_type
    when 'start_work' then
      entity:=public.upt_start_work((p_payload->>'event_id')::uuid,(p_payload->>'shift_id')::uuid);
    when 'start_break' then
      session_ref:=nullif(p_payload->>'session_id','')::uuid;
      if session_ref is null and nullif(p_payload->>'session_operation_id','') is not null then
        select (r.result->>'id')::uuid into session_ref
        from public.offline_operation_records r
        where r.id=(p_payload->>'session_operation_id')::uuid
          and r.user_id=auth.uid() and r.operation_type='start_work';
      end if;
      if session_ref is null then raise exception 'Missing work-session dependency'; end if;
      entity:=public.upt_start_break(session_ref);
    when 'stop_break' then
      break_ref:=nullif(p_payload->>'break_id','')::uuid;
      if break_ref is null and nullif(p_payload->>'break_operation_id','') is not null then
        select (r.result->>'id')::uuid into break_ref
        from public.offline_operation_records r
        where r.id=(p_payload->>'break_operation_id')::uuid
          and r.user_id=auth.uid() and r.operation_type='start_break';
      end if;
      if break_ref is null then raise exception 'Missing break dependency'; end if;
      perform public.upt_stop_break(break_ref);
      entity:=break_ref;
    when 'stop_work' then
      session_ref:=nullif(p_payload->>'session_id','')::uuid;
      if session_ref is null and nullif(p_payload->>'session_operation_id','') is not null then
        select (r.result->>'id')::uuid into session_ref
        from public.offline_operation_records r
        where r.id=(p_payload->>'session_operation_id')::uuid
          and r.user_id=auth.uid() and r.operation_type='start_work';
      end if;
      if session_ref is null then raise exception 'Missing work-session dependency'; end if;
      perform public.upt_stop_work(session_ref);
      entity:=session_ref;
    when 'transition' then
      session_ref:=nullif(p_payload->>'session_id','')::uuid;
      if session_ref is null and nullif(p_payload->>'session_operation_id','') is not null then
        select (r.result->>'id')::uuid into session_ref
        from public.offline_operation_records r
        where r.id=(p_payload->>'session_operation_id')::uuid
          and r.user_id=auth.uid() and r.operation_type='start_work';
      end if;
      if session_ref is null then raise exception 'Missing work-session dependency'; end if;
      entity:=public.upt_confirm_workplace_transition(session_ref,(p_payload->>'workplace_id')::uuid);
    when 'task' then
      perform public.upt_update_task_status((p_payload->>'assignment_id')::uuid,p_payload->>'status');
      entity:=(p_payload->>'assignment_id')::uuid;
    when 'message' then
      if not public.upt_can_read_channel((p_payload->>'channel_id')::uuid)
         or length(trim(coalesce(p_payload->>'body',''))) not between 1 and 4000 then
        raise exception 'Invalid message';
      end if;
      select event_id into channel_event
      from public.chat_channels
      where id=(p_payload->>'channel_id')::uuid;
      if not public.upt_feature_allowed('chat',channel_event,null) then raise exception 'Chat is momenteel alleen-lezen.'; end if;
      insert into public.messages(user_id,sender_id,channel_id,body,content)
      values(auth.uid(),auth.uid(),(p_payload->>'channel_id')::uuid,trim(p_payload->>'body'),trim(p_payload->>'body'))
      returning id into entity;
    when 'incident' then
      event:=(p_payload->>'event_id')::uuid;
      workplace:=nullif(p_payload->>'workplace_id','')::uuid;
      entity:=public.upt_create_incident(
        event,
        workplace,
        trim(coalesce(p_payload->>'message','')),
        null,
        nullif(p_payload->>'latitude','')::numeric,
        nullif(p_payload->>'longitude','')::numeric,
        nullif(p_payload->>'accuracy','')::numeric
      );
    else
      raise exception 'Unsupported operation';
  end case;

  if p_type in ('start_work','stop_work') then
    select event_id into event from public.work_sessions where id=entity and user_id=auth.uid();
    evidence:=public.upt_gps_assessment(
      event,
      nullif(p_payload->>'latitude','')::numeric,
      nullif(p_payload->>'longitude','')::numeric,
      nullif(p_payload->>'accuracy','')::numeric,
      p_payload->>'gps_status'
    );
    if p_type='start_work' then
      update public.work_sessions set start_gps_status=evidence->>'status',start_gps_evidence=evidence where id=entity;
    else
      update public.work_sessions set stop_gps_status=evidence->>'status',stop_gps_evidence=evidence where id=entity;
    end if;
  end if;

  result_value:=jsonb_build_object('id',entity,'server_timestamp',now());
  insert into public.offline_operation_records(id,user_id,operation_type,payload,status,result,synced_at)
  values(p_id,auth.uid(),p_type,p_payload,'synced',result_value,now());
  return result_value;
end;
$$;

notify pgrst,'reload schema';
