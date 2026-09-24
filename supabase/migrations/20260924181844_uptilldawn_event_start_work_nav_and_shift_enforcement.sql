update public.role_ui_rules
set condition_key='event_active',updated_at=now()
where feature_key='operations' and role in ('staff','responsible_lead');

create or replace function public.upt_request_check_in(
  p_event uuid, p_workplace uuid, p_remote boolean default false, p_selfie_path text default null,
  p_latitude numeric default null, p_longitude numeric default null, p_accuracy_m numeric default null,
  p_gps_status text default 'not_checked'
) returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare v_id uuid; v_role text;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select role into v_role from public.profiles where id=auth.uid();
  if v_role='admin' then raise exception 'Admin heeft geen persoonlijke Werk & pauze-flow.'; end if;
  if not public.upt_feature_allowed('operations',p_event,p_workplace) then raise exception 'Werk & pauze is op dit moment niet beschikbaar.'; end if;
  if not exists(select 1 from public.event_members em where em.event_id=p_event and em.user_id=auth.uid()) then raise exception 'User is not a member of this event'; end if;
  if not exists(select 1 from public.workplaces w where w.id=p_workplace and w.event_id=p_event) then raise exception 'Invalid workplace for this event'; end if;
  if not exists(
    select 1 from public.shifts s
    where s.event_id=p_event and s.workplace_id=p_workplace and s.user_id=auth.uid()
      and coalesce(s.status,'')<>'cancelled'
      and now() between s.scheduled_start and s.scheduled_end
  ) then raise exception 'Je dienst is nog niet gestart of is al afgelopen.'; end if;
  if p_remote and (p_selfie_path is null or length(trim(p_selfie_path))=0) then raise exception 'Remote check-in requires a fresh selfie'; end if;
  if exists(select 1 from public.check_ins ci where ci.user_id=auth.uid() and ci.event_id=p_event and ci.status='pending') then raise exception 'A check-in request is already pending'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_event::text,0));
  if exists(select 1 from public.check_ins where user_id=auth.uid() and event_id=p_event and status='pending') then raise exception 'A check-in request is already pending'; end if;
  if p_remote and not exists(
    select 1 from storage.objects o where o.bucket_id='checkin-selfies' and o.name=p_selfie_path
      and split_part(o.name,'/',1)=auth.uid()::text and o.created_at>now()-interval '10 minutes'
      and not exists(select 1 from public.check_ins c where c.selfie_path=o.name)
  ) then raise exception 'Fresh uploaded selfie required'; end if;
  p_gps_status:=case when p_gps_status in ('denied','unavailable','offline') then p_gps_status else 'not_checked' end;
  insert into public.check_ins(user_id,event_id,workplace_id,type,status,selfie_path,selfie_url,gps_status,latitude,longitude,accuracy_m,remote,requested_at,created_at,approved_by,approved_at,decided_by,decided_at)
  values(auth.uid(),p_event,p_workplace,'check-in','pending',p_selfie_path,null,coalesce(nullif(trim(p_gps_status),''),'not_checked'),p_latitude,p_longitude,p_accuracy_m,p_remote,now(),now(),null,null,null,null)
  returning id into v_id;
  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'CHECK_IN_REQUESTED','check_in',v_id,jsonb_build_object('event_id',p_event,'workplace_id',p_workplace,'remote',p_remote,'gps_status',p_gps_status));
  return v_id;
end;
$$;

create or replace function public.upt_start_work(p_event uuid,p_shift uuid default null)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare wid uuid; server_now timestamptz:=now(); v_workplace uuid; v_role text;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select role into v_role from public.profiles where id=auth.uid();
  if v_role='admin' then raise exception 'Admin heeft geen persoonlijke Werk & pauze-flow.'; end if;
  select workplace_id into v_workplace
  from public.shifts
  where id=p_shift and user_id=auth.uid() and event_id=p_event and status<>'cancelled'
    and server_now between scheduled_start and scheduled_end;
  if v_workplace is null then raise exception 'Je dienst is nog niet gestart of is al afgelopen.'; end if;
  if not public.upt_feature_allowed('operations',p_event,v_workplace) then raise exception 'Werk & pauze is op dit moment niet beschikbaar.'; end if;
  if not exists(select 1 from public.event_members where event_id=p_event and user_id=auth.uid()) then raise exception 'Not an event member'; end if;
  if not exists(select 1 from public.check_ins where event_id=p_event and workplace_id=v_workplace and user_id=auth.uid() and status='approved') then raise exception 'Approved check-in for assigned shift required'; end if;
  if exists(select 1 from public.work_sessions where user_id=auth.uid() and ended_at is null) then raise exception 'Active work session already exists'; end if;
  insert into public.work_sessions(event_id,user_id,shift_id,start_time,started_at,status)
  values(p_event,auth.uid(),p_shift,server_now,server_now,'active') returning id into wid;
  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'START_WORK','work_session',wid,jsonb_build_object('event_id',p_event,'shift_id',p_shift,'server_timestamp',server_now));
  return wid;
end;
$$;

notify pgrst,'reload schema';
