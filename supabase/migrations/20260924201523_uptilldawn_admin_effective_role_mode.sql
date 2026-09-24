create table if not exists public.admin_role_modes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_role text not null check (active_role in ('admin','staff','responsible_lead')),
  updated_at timestamptz not null default now()
);

alter table public.admin_role_modes enable row level security;
revoke all on public.admin_role_modes from public, anon, authenticated;

create or replace function public.upt_effective_role(uid uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path='public','pg_temp'
as $$
  select case
    when p.approved is not true then null
    when p.role='admin' then coalesce((select m.active_role from public.admin_role_modes m where m.user_id=p.id),'admin')
    else p.role
  end
  from public.profiles p
  where p.id=uid;
$$;
revoke all on function public.upt_effective_role(uuid) from public, anon, authenticated;

create or replace function public.upt_current_effective_role()
returns text language sql stable security definer set search_path='public','pg_temp'
as $$ select public.upt_effective_role(auth.uid()); $$;
revoke all on function public.upt_current_effective_role() from public, anon;
grant execute on function public.upt_current_effective_role() to authenticated;

create or replace function public.upt_set_admin_role_mode(p_role text)
returns text language plpgsql security definer set search_path='public','pg_temp'
as $$
declare v_uid uuid:=auth.uid(); v_base_role text; v_old text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_role not in ('admin','staff','responsible_lead') then raise exception 'Ongeldige rolmodus'; end if;
  select p.role into v_base_role from public.profiles p where p.id=v_uid and p.approved=true;
  if v_base_role<>'admin' then raise exception 'Alleen een beheerder kan van rolmodus wisselen'; end if;
  select coalesce(m.active_role,'admin') into v_old
  from public.profiles p left join public.admin_role_modes m on m.user_id=p.id where p.id=v_uid;
  insert into public.admin_role_modes(user_id,active_role,updated_at)
  values(v_uid,p_role,now())
  on conflict(user_id) do update set active_role=excluded.active_role,updated_at=excluded.updated_at;
  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_uid,'ADMIN_ROLE_MODE_CHANGED','profile',v_uid,jsonb_build_object('from',v_old,'to',p_role));
  return p_role;
end;
$$;
revoke all on function public.upt_set_admin_role_mode(text) from public, anon;
grant execute on function public.upt_set_admin_role_mode(text) to authenticated;

create or replace function public.upt_is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path='public','pg_temp'
as $$ select coalesce(public.upt_effective_role(uid)='admin',false); $$;
revoke all on function public.upt_is_admin(uuid) from public, anon;
grant execute on function public.upt_is_admin(uuid) to authenticated;

create or replace function public.upt_is_responsible(event_uuid uuid, workplace_uuid uuid default null, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path='public','pg_temp'
as $$
  select coalesce(public.upt_effective_role(uid)='responsible_lead',false)
    and exists(select 1 from public.responsible_assignments ra
      where ra.user_id=uid and ra.event_id=event_uuid
        and (workplace_uuid is null or ra.workplace_id=workplace_uuid));
$$;
revoke all on function public.upt_is_responsible(uuid,uuid,uuid) from public, anon;
grant execute on function public.upt_is_responsible(uuid,uuid,uuid) to authenticated;

create or replace function upt_private.is_event_responsible(p_event uuid,p_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path='public','pg_temp'
as $$
  select coalesce(public.upt_effective_role(p_uid)='responsible_lead',false)
    and exists(select 1 from public.event_members em
      where em.event_id=p_event and em.user_id=p_uid and em.event_role in ('responsible_lead','admin'));
$$;

create or replace function public.upt_feature_visible(p_feature text,p_event uuid default null,p_workplace uuid default null)
returns boolean language plpgsql stable security definer set search_path='public','pg_temp'
as $$
declare v_user uuid:=auth.uid(); v_role text; v_rule public.role_ui_rules%rowtype;
begin
  if v_user is null or not public.upt_is_approved() then return false; end if;
  v_role:=public.upt_effective_role(v_user);
  if v_role not in ('staff','responsible_lead','admin') then return false; end if;
  select * into v_rule from public.role_ui_rules r where r.role=v_role and r.feature_key=p_feature;
  if not found or not v_rule.visible then return false; end if;
  case v_rule.condition_key
    when 'always' then return true;
    when 'assigned_event' then return exists(
      select 1 from public.event_members em where em.user_id=v_user
        and (p_event is null or em.event_id=p_event)
        and exists(select 1 from public.events e where e.id=em.event_id and e.status<>'archived' and now()<=e.end_at));
    when 'assigned_workplace_role' then return exists(
      select 1 from public.shifts s join public.events e on e.id=s.event_id
      where s.user_id=v_user and s.status<>'cancelled'
        and (p_event is null or s.event_id=p_event) and (p_workplace is null or s.workplace_id=p_workplace)
        and e.status<>'archived' and now()<=e.end_at)
      or exists(
      select 1 from public.responsible_assignments r join public.events e on e.id=r.event_id
      where r.user_id=v_user and (p_event is null or r.event_id=p_event)
        and (p_workplace is null or r.workplace_id=p_workplace) and e.status<>'archived' and now()<=e.end_at);
    when 'event_active' then return exists(
      select 1 from public.event_members em join public.events e on e.id=em.event_id
      where em.user_id=v_user and (p_event is null or e.id=p_event)
        and e.status<>'archived' and now() between e.start_at and e.end_at);
    when 'shift_active' then return exists(
      select 1 from public.shifts s join public.events e on e.id=s.event_id
      where s.user_id=v_user and s.status<>'cancelled'
        and (p_event is null or s.event_id=p_event) and (p_workplace is null or s.workplace_id=p_workplace)
        and now() between s.scheduled_start and s.scheduled_end and e.status<>'archived');
    when 'never' then return false;
    else return false;
  end case;
end;
$$;

create or replace function public.upt_feature_allowed(p_feature text,p_event uuid default null,p_workplace uuid default null)
returns boolean language plpgsql stable security definer set search_path='public','pg_temp'
as $$
declare v_role text; v_enabled boolean;
begin
  if auth.uid() is null or not public.upt_is_approved() then return false; end if;
  v_role:=public.upt_effective_role(auth.uid());
  if v_role not in ('staff','responsible_lead','admin') then return false; end if;
  if not public.upt_feature_visible(p_feature,p_event,p_workplace) then return false; end if;
  select enabled into v_enabled from public.role_ui_rules where role=v_role and feature_key=p_feature;
  return coalesce(v_enabled,false);
end;
$$;

create or replace function public.upt_request_check_in(
 p_event uuid,p_workplace uuid,p_remote boolean default false,p_selfie_path text default null,
 p_latitude numeric default null,p_longitude numeric default null,p_accuracy_m numeric default null,p_gps_status text default 'not_checked'
) returns uuid language plpgsql security definer set search_path='public'
as $$
declare v_id uuid; v_role text;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_role:=public.upt_effective_role(auth.uid());
  if v_role='admin' then raise exception 'Admin heeft geen persoonlijke Werk & pauze-flow.'; end if;
  if not public.upt_feature_allowed('operations',p_event,p_workplace) then raise exception 'Werk & pauze is op dit moment niet beschikbaar.'; end if;
  if not exists(select 1 from public.event_members em where em.event_id=p_event and em.user_id=auth.uid()) then raise exception 'User is not a member of this event'; end if;
  if not exists(select 1 from public.workplaces w where w.id=p_workplace and w.event_id=p_event) then raise exception 'Invalid workplace for this event'; end if;
  if not exists(select 1 from public.shifts s where s.event_id=p_event and s.workplace_id=p_workplace and s.user_id=auth.uid()
    and coalesce(s.status,'')<>'cancelled' and now() between s.scheduled_start and s.scheduled_end) then
    raise exception 'Je dienst is nog niet gestart of is al afgelopen.';
  end if;
  if p_remote and (p_selfie_path is null or length(trim(p_selfie_path))=0) then raise exception 'Remote check-in requires a fresh selfie'; end if;
  if exists(select 1 from public.check_ins ci where ci.user_id=auth.uid() and ci.event_id=p_event and ci.status='pending') then raise exception 'A check-in request is already pending'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_event::text,0));
  if exists(select 1 from public.check_ins where user_id=auth.uid() and event_id=p_event and status='pending') then raise exception 'A check-in request is already pending'; end if;
  if p_remote and not exists(select 1 from storage.objects o where o.bucket_id='checkin-selfies' and o.name=p_selfie_path
    and split_part(o.name,'/',1)=auth.uid()::text and o.created_at>now()-interval '10 minutes'
    and not exists(select 1 from public.check_ins c where c.selfie_path=o.name)) then raise exception 'Fresh uploaded selfie required'; end if;
  p_gps_status:=case when p_gps_status in ('denied','unavailable','offline') then p_gps_status else 'not_checked' end;
  insert into public.check_ins(user_id,event_id,workplace_id,type,status,selfie_path,selfie_url,gps_status,latitude,longitude,accuracy_m,remote,requested_at,created_at,approved_by,approved_at,decided_by,decided_at)
  values(auth.uid(),p_event,p_workplace,'check-in','pending',p_selfie_path,null,coalesce(nullif(trim(p_gps_status),''),'not_checked'),p_latitude,p_longitude,p_accuracy_m,p_remote,now(),now(),null,null,null,null)
  returning id into v_id;
  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'CHECK_IN_REQUESTED','check_in',v_id,jsonb_build_object('event_id',p_event,'workplace_id',p_workplace,'remote',p_remote,'gps_status',p_gps_status));
  return v_id;
end;
$$;

create or replace function public.upt_request_check_out(p_event uuid,p_notes text default null)
returns uuid language plpgsql security definer set search_path='public'
as $$
declare v_id uuid; v_workplace uuid; v_role text;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_role:=public.upt_effective_role(auth.uid());
  if v_role='admin' then raise exception 'Admin heeft geen persoonlijke Werk & pauze-flow.'; end if;
  if not exists(select 1 from public.event_members em where em.event_id=p_event and em.user_id=auth.uid()) then raise exception 'User is not a member of this event'; end if;
  select ci.workplace_id into v_workplace from public.check_ins ci
   where ci.user_id=auth.uid() and ci.event_id=p_event and ci.status='approved'
   order by coalesce(ci.decided_at,ci.approved_at,ci.requested_at,ci.created_at) desc limit 1;
  if v_workplace is null then raise exception 'No approved check-in found for this event'; end if;
  if not public.upt_feature_allowed('operations',p_event,v_workplace) then raise exception 'Werk & pauze is op dit moment niet beschikbaar.'; end if;
  if exists(select 1 from public.check_outs co where co.user_id=auth.uid() and co.event_id=p_event and co.status='pending') then raise exception 'A check-out request is already pending'; end if;
  insert into public.check_outs(event_id,user_id,workplace_id,status,requested_at,decided_at,decided_by,notes)
  values(p_event,auth.uid(),v_workplace,'pending',now(),null,null,p_notes) returning id into v_id;
  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'CHECK_OUT_REQUESTED','check_out',v_id,jsonb_build_object('event_id',p_event,'workplace_id',v_workplace));
  return v_id;
end;
$$;

create or replace function public.upt_start_work(p_event uuid,p_shift uuid default null)
returns uuid language plpgsql security definer set search_path='public'
as $$
declare wid uuid; server_now timestamptz:=now(); v_workplace uuid; v_role text;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_role:=public.upt_effective_role(auth.uid());
  if v_role='admin' then raise exception 'Admin heeft geen persoonlijke Werk & pauze-flow.'; end if;
  select workplace_id into v_workplace from public.shifts
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

drop policy if exists responsible_admin_insert on public.responsible_assignments;
create policy responsible_admin_insert on public.responsible_assignments for insert to authenticated
with check(public.upt_is_admin() and exists(
 select 1 from public.event_members em join public.profiles p on p.id=em.user_id
 where em.event_id=responsible_assignments.event_id and em.user_id=responsible_assignments.user_id
 and em.event_role in ('responsible_lead','admin') and p.approved=true and p.role in ('responsible_lead','admin')
));

drop policy if exists responsible_admin_update on public.responsible_assignments;
create policy responsible_admin_update on public.responsible_assignments for update to authenticated
using(public.upt_is_admin())
with check(public.upt_is_admin() and exists(
 select 1 from public.event_members em join public.profiles p on p.id=em.user_id
 where em.event_id=responsible_assignments.event_id and em.user_id=responsible_assignments.user_id
 and em.event_role in ('responsible_lead','admin') and p.approved=true and p.role in ('responsible_lead','admin')
));

notify pgrst,'reload schema';
