create table if not exists public.role_ui_rules (
  role text not null check (role in ('staff','responsible_lead')),
  feature_key text not null,
  label text not null,
  group_key text not null default 'navigation',
  visible boolean not null default true,
  enabled boolean not null default true,
  condition_key text not null default 'always'
    check (condition_key in ('always','assigned_event','assigned_workplace_role','event_active','shift_active','never')),
  sort_order integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id),
  primary key (role, feature_key)
);

alter table public.role_ui_rules enable row level security;
revoke all on public.role_ui_rules from anon;
grant select, insert, update, delete on public.role_ui_rules to authenticated;

drop policy if exists role_ui_rules_read on public.role_ui_rules;
create policy role_ui_rules_read on public.role_ui_rules
for select to authenticated
using (public.upt_is_approved());

drop policy if exists role_ui_rules_admin_insert on public.role_ui_rules;
create policy role_ui_rules_admin_insert on public.role_ui_rules
for insert to authenticated
with check (public.upt_is_admin());

drop policy if exists role_ui_rules_admin_update on public.role_ui_rules;
create policy role_ui_rules_admin_update on public.role_ui_rules
for update to authenticated
using (public.upt_is_admin())
with check (public.upt_is_admin());

drop policy if exists role_ui_rules_admin_delete on public.role_ui_rules;
create policy role_ui_rules_admin_delete on public.role_ui_rules
for delete to authenticated
using (public.upt_is_admin());

insert into public.role_ui_rules(role,feature_key,label,group_key,visible,enabled,condition_key,sort_order)
values
 ('staff','overview','Overzicht','navigation',true,true,'always',10),
 ('staff','events','Evenementen','navigation',true,true,'always',20),
 ('staff','crew','Personeel','navigation',true,true,'always',30),
 ('staff','chat','Gesprekken','navigation',true,true,'always',40),
 ('staff','shifts','Diensten','navigation',true,true,'assigned_event',50),
 ('staff','briefings','Instructies','navigation',true,true,'assigned_event',60),
 ('staff','operations','Werk & pauze','navigation',true,true,'shift_active',70),
 ('staff','workplaces','Werkplekken','navigation',true,true,'assigned_workplace_role',80),
 ('staff','tasks','Taken','navigation',true,true,'shift_active',90),
 ('staff','incidents','Incidenten','navigation',true,true,'shift_active',100),
 ('responsible_lead','overview','Overzicht','navigation',true,true,'always',10),
 ('responsible_lead','events','Evenementen','navigation',true,true,'always',20),
 ('responsible_lead','crew','Personeel','navigation',true,true,'always',30),
 ('responsible_lead','chat','Gesprekken','navigation',true,true,'always',40),
 ('responsible_lead','shifts','Diensten','navigation',true,true,'assigned_event',50),
 ('responsible_lead','briefings','Instructies','navigation',true,true,'assigned_event',60),
 ('responsible_lead','operations','Werk & pauze','navigation',true,true,'shift_active',70),
 ('responsible_lead','workplaces','Werkplekken','navigation',true,true,'assigned_workplace_role',80),
 ('responsible_lead','tasks','Taken','navigation',true,true,'shift_active',90),
 ('responsible_lead','incidents','Incidenten','navigation',true,true,'shift_active',100)
on conflict (role,feature_key) do nothing;

create or replace function public.upt_feature_allowed(
  p_feature text,
  p_event uuid default null,
  p_workplace uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = 'public','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_rule public.role_ui_rules%rowtype;
begin
  if v_user is null or not public.upt_is_approved() then
    return false;
  end if;

  select p.role into v_role
  from public.profiles p
  where p.id = v_user and p.approved = true;

  if v_role = 'admin' then
    return true;
  end if;

  if v_role not in ('staff','responsible_lead') then
    return false;
  end if;

  select * into v_rule
  from public.role_ui_rules r
  where r.role = v_role and r.feature_key = p_feature;

  if not found or not v_rule.visible or not v_rule.enabled then
    return false;
  end if;

  case v_rule.condition_key
    when 'always' then
      return true;

    when 'assigned_event' then
      return exists (
        select 1 from public.event_members em
        where em.user_id = v_user
          and (p_event is null or em.event_id = p_event)
          and exists (
            select 1 from public.events e
            where e.id = em.event_id
              and e.status <> 'archived'
              and now() <= e.end_at
          )
      );

    when 'assigned_workplace_role' then
      return exists (
        select 1
        from public.shifts s
        join public.events e on e.id = s.event_id
        where s.user_id = v_user
          and s.status <> 'cancelled'
          and (p_event is null or s.event_id = p_event)
          and (p_workplace is null or s.workplace_id = p_workplace)
          and e.status <> 'archived'
          and now() <= e.end_at
      ) or exists (
        select 1
        from public.responsible_assignments r
        join public.events e on e.id = r.event_id
        where r.user_id = v_user
          and (p_event is null or r.event_id = p_event)
          and (p_workplace is null or r.workplace_id = p_workplace)
          and e.status <> 'archived'
          and now() <= e.end_at
      );

    when 'event_active' then
      return exists (
        select 1
        from public.event_members em
        join public.events e on e.id = em.event_id
        where em.user_id = v_user
          and (p_event is null or e.id = p_event)
          and e.status <> 'archived'
          and now() between e.start_at and e.end_at
      );

    when 'shift_active' then
      return exists (
        select 1
        from public.shifts s
        join public.events e on e.id = s.event_id
        where s.user_id = v_user
          and s.status <> 'cancelled'
          and (p_event is null or s.event_id = p_event)
          and (p_workplace is null or s.workplace_id = p_workplace)
          and now() between s.scheduled_start and s.scheduled_end
          and e.status <> 'archived'
      );

    when 'never' then
      return false;
    else
      return false;
  end case;
end;
$$;

revoke all on function public.upt_feature_allowed(text,uuid,uuid) from public, anon;
grant execute on function public.upt_feature_allowed(text,uuid,uuid) to authenticated;

-- Role-configured read windows.
drop policy if exists upt_event_operational_window on public.shifts;
create policy upt_role_feature_window on public.shifts
as restrictive for select to authenticated
using (public.upt_is_admin() or public.upt_feature_allowed('shifts', event_id, workplace_id));

drop policy if exists upt_event_operational_window on public.workplaces;
create policy upt_role_feature_window on public.workplaces
as restrictive for select to authenticated
using (public.upt_is_admin() or public.upt_feature_allowed('workplaces', event_id, id));

drop policy if exists upt_event_operational_window on public.briefings;
create policy upt_role_feature_window on public.briefings
as restrictive for select to authenticated
using (public.upt_is_admin() or public.upt_feature_allowed('briefings', event_id, workplace_id));

drop policy if exists upt_event_operational_window on public.personal_instructions;
create policy upt_role_feature_window on public.personal_instructions
as restrictive for select to authenticated
using (public.upt_is_admin() or public.upt_feature_allowed('briefings', event_id, workplace_id));

drop policy if exists upt_event_operational_window on public.tasks;
create policy upt_role_feature_window on public.tasks
as restrictive for select to authenticated
using (public.upt_is_admin() or public.upt_feature_allowed('tasks', event_id, workplace_id));

drop policy if exists upt_event_operational_window on public.task_assignments;
create policy upt_role_feature_window on public.task_assignments
as restrictive for select to authenticated
using (
  public.upt_is_admin()
  or exists (
    select 1 from public.tasks t
    where t.id = task_assignments.task_id
      and public.upt_feature_allowed('tasks', t.event_id, t.workplace_id)
  )
);

drop policy if exists upt_event_operational_window on public.incidents;
create policy upt_role_feature_window on public.incidents
as restrictive for select to authenticated
using (public.upt_is_admin() or public.upt_feature_allowed('incidents', event_id, workplace_id));

drop policy if exists upt_role_feature_insert on public.incidents;
create policy upt_role_feature_insert on public.incidents
as restrictive for insert to authenticated
with check (public.upt_is_admin() or public.upt_feature_allowed('incidents', event_id, workplace_id));

-- Only organization + event chat. Event chat starts with the event and remains for 3 days after.
create or replace function public.upt_can_read_channel(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
  select public.upt_is_approved()
    and exists (
      select 1
      from public.chat_channels c
      where c.id = p_channel
        and (
          c.kind = 'organization'
          or (
            c.kind = 'event'
            and c.event_id is not null
            and exists (
              select 1
              from public.events e
              where e.id = c.event_id
                and e.status <> 'archived'
                and now() >= e.start_at
                and now() <= e.end_at + interval '3 days'
            )
            and (
              public.upt_is_admin()
              or exists (
                select 1 from public.event_members em
                where em.event_id = c.event_id
                  and em.user_id = auth.uid()
              )
            )
          )
        )
    );
$$;

revoke execute on function public.upt_create_private_chat(uuid) from public, anon, authenticated;

-- Check-in approval keeps the request time as the effective approval time.
create or replace function public.upt_decide_check_in(p_check_in uuid, p_approve boolean, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_check_in public.check_ins%rowtype;
  v_status text;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_check_in from public.check_ins where id=p_check_in for update;
  if not found then raise exception 'Check-in request not found'; end if;
  if v_check_in.status <> 'pending' then raise exception 'Check-in request has already been decided'; end if;

  if not (
    public.upt_is_admin(auth.uid())
    or public.upt_is_responsible(v_check_in.event_id,v_check_in.workplace_id,auth.uid())
  ) then
    raise exception 'Not authorized to decide this check-in';
  end if;

  v_status := case when p_approve then 'approved' else 'rejected' end;

  update public.check_ins
  set status=v_status,
      decided_by=auth.uid(),
      decided_at=now(),
      approved_by=case when p_approve then auth.uid() else null end,
      approved_at=case when p_approve then coalesce(v_check_in.requested_at,v_check_in.created_at,now()) else null end,
      notes=p_notes
  where id=p_check_in;

  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values (
    auth.uid(),
    case when p_approve then 'CHECK_IN_APPROVED' else 'CHECK_IN_REJECTED' end,
    'check_in',
    p_check_in,
    jsonb_build_object(
      'user_id',v_check_in.user_id,
      'event_id',v_check_in.event_id,
      'workplace_id',v_check_in.workplace_id,
      'requested_at',v_check_in.requested_at,
      'effective_at',case when p_approve then coalesce(v_check_in.requested_at,v_check_in.created_at) else null end,
      'notes',p_notes
    )
  );
  return p_check_in;
end;
$$;

-- Checkout remains pending until approval; when approved, its original request time becomes effective.
create or replace function public.upt_decide_check_out(p_check_out uuid, p_approve boolean, p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_check_out public.check_outs%rowtype;
  v_status text;
  v_effective_at timestamptz;
  v_session public.work_sessions%rowtype;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_check_out from public.check_outs where id=p_check_out for update;
  if not found then raise exception 'Check-out request not found'; end if;
  if v_check_out.status <> 'pending' then raise exception 'Check-out request has already been decided'; end if;

  if not (
    public.upt_is_admin(auth.uid())
    or (
      v_check_out.workplace_id is not null
      and public.upt_is_responsible(v_check_out.event_id,v_check_out.workplace_id,auth.uid())
    )
  ) then
    raise exception 'Not authorized to decide this check-out';
  end if;

  v_status := case when p_approve then 'approved' else 'rejected' end;
  v_effective_at := coalesce(v_check_out.requested_at,now());

  update public.check_outs
  set status=v_status, decided_by=auth.uid(), decided_at=now(), notes=p_notes
  where id=p_check_out;

  if p_approve then
    select * into v_session
    from public.work_sessions ws
    where ws.user_id=v_check_out.user_id
      and ws.event_id=v_check_out.event_id
      and ws.ended_at is null
    order by ws.started_at desc
    limit 1
    for update;

    if found then
      v_effective_at := greatest(v_effective_at,v_session.started_at);

      update public.break_sessions
      set end_time=greatest(v_effective_at,started_at),
          ended_at=greatest(v_effective_at,started_at)
      where work_session_id=v_session.id
        and user_id=v_check_out.user_id
        and ended_at is null;

      update public.work_sessions
      set end_time=v_effective_at,
          ended_at=v_effective_at,
          status='completed'
      where id=v_session.id and ended_at is null;
    end if;
  end if;

  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values (
    auth.uid(),
    case when p_approve then 'CHECK_OUT_APPROVED' else 'CHECK_OUT_REJECTED' end,
    'check_out',
    p_check_out,
    jsonb_build_object(
      'user_id',v_check_out.user_id,
      'event_id',v_check_out.event_id,
      'workplace_id',v_check_out.workplace_id,
      'requested_at',v_check_out.requested_at,
      'effective_at',case when p_approve then v_effective_at else null end,
      'notes',p_notes
    )
  );
  return p_check_out;
end;
$$;

-- Dynamic feature checks for security-definer operational RPCs.
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
  if not exists(select 1 from public.shifts s where s.event_id=p_event and s.workplace_id=p_workplace and s.user_id=auth.uid() and coalesce(s.status,'')<>'cancelled') then raise exception 'No shift assigned for this workplace'; end if;
  if p_remote and (p_selfie_path is null or length(trim(p_selfie_path))=0) then raise exception 'Remote check-in requires a fresh selfie'; end if;
  if exists(select 1 from public.check_ins ci where ci.user_id=auth.uid() and ci.event_id=p_event and ci.status='pending') then raise exception 'A check-in request is already pending'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_event::text,0));
  if exists(select 1 from public.check_ins where user_id=auth.uid() and event_id=p_event and status='pending') then raise exception 'A check-in request is already pending'; end if;
  if p_remote and not exists(
    select 1 from storage.objects o where o.bucket_id='checkin-selfies' and o.name=p_selfie_path
      and split_part(o.name,'/',1)=auth.uid()::text and o.created_at>now()-interval '10 minutes'
      and not exists(select 1 from public.check_ins c where c.selfie_path=o.name)
  ) then raise exception 'Fresh uploaded selfie required'; end if;
  p_gps_status := case when p_gps_status in ('denied','unavailable','offline') then p_gps_status else 'not_checked' end;
  insert into public.check_ins(user_id,event_id,workplace_id,type,status,selfie_path,selfie_url,gps_status,latitude,longitude,accuracy_m,remote,requested_at,created_at,approved_by,approved_at,decided_by,decided_at)
  values(auth.uid(),p_event,p_workplace,'check-in','pending',p_selfie_path,null,coalesce(nullif(trim(p_gps_status),''),'not_checked'),p_latitude,p_longitude,p_accuracy_m,p_remote,now(),now(),null,null,null,null)
  returning id into v_id;
  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'CHECK_IN_REQUESTED','check_in',v_id,jsonb_build_object('event_id',p_event,'workplace_id',p_workplace,'remote',p_remote,'gps_status',p_gps_status));
  return v_id;
end;
$$;

create or replace function public.upt_request_check_out(p_event uuid,p_notes text default null)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_id uuid; v_workplace uuid; v_role text;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select role into v_role from public.profiles where id=auth.uid();
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
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare wid uuid; server_now timestamptz:=now(); v_workplace uuid; v_role text;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select role into v_role from public.profiles where id=auth.uid();
  if v_role='admin' then raise exception 'Admin heeft geen persoonlijke Werk & pauze-flow.'; end if;
  select workplace_id into v_workplace from public.shifts where id=p_shift and user_id=auth.uid() and event_id=p_event and status<>'cancelled';
  if v_workplace is null then raise exception 'Invalid shift'; end if;
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

create or replace function public.upt_start_break(p_work_session uuid)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare bid uuid; server_now timestamptz:=now(); v_event uuid; v_workplace uuid;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  select ws.event_id,s.workplace_id into v_event,v_workplace
  from public.work_sessions ws join public.shifts s on s.id=ws.shift_id
  where ws.id=p_work_session and ws.user_id=auth.uid() and ws.ended_at is null for update of ws;
  if v_event is null then raise exception 'No active work session'; end if;
  if not public.upt_feature_allowed('operations',v_event,v_workplace) then raise exception 'Werk & pauze is op dit moment niet beschikbaar.'; end if;
  if exists(select 1 from public.break_sessions where work_session_id=p_work_session and ended_at is null) then raise exception 'Active break already exists'; end if;
  insert into public.break_sessions(work_session_id,user_id,start_time,started_at)
  values(p_work_session,auth.uid(),server_now,server_now) returning id into bid;
  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'START_BREAK','break_session',bid,jsonb_build_object('work_session_id',p_work_session,'server_timestamp',server_now));
  return bid;
end;
$$;

create or replace function public.upt_stop_break(p_break uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare server_now timestamptz:=now(); v_event uuid; v_workplace uuid;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  select ws.event_id,s.workplace_id into v_event,v_workplace
  from public.break_sessions bs
  join public.work_sessions ws on ws.id=bs.work_session_id
  join public.shifts s on s.id=ws.shift_id
  where bs.id=p_break and bs.user_id=auth.uid() and bs.ended_at is null;
  if v_event is null then raise exception 'No active break'; end if;
  if not public.upt_feature_allowed('operations',v_event,v_workplace) then raise exception 'Werk & pauze is op dit moment niet beschikbaar.'; end if;
  update public.break_sessions set end_time=server_now,ended_at=server_now
  where id=p_break and user_id=auth.uid() and ended_at is null;
  if not found then raise exception 'No active break'; end if;
  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'STOP_BREAK','break_session',p_break,jsonb_build_object('server_timestamp',server_now));
end;
$$;

create or replace function public.upt_stop_work(p_work_session uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare server_now timestamptz:=now(); v_event uuid; v_workplace uuid;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  select ws.event_id,s.workplace_id into v_event,v_workplace
  from public.work_sessions ws join public.shifts s on s.id=ws.shift_id
  where ws.id=p_work_session and ws.user_id=auth.uid() and ws.ended_at is null for update of ws;
  if v_event is null then raise exception 'No active work session'; end if;
  if not public.upt_feature_allowed('operations',v_event,v_workplace) then raise exception 'Werk & pauze is op dit moment niet beschikbaar.'; end if;
  update public.break_sessions set end_time=server_now,ended_at=server_now
  where work_session_id=p_work_session and user_id=auth.uid() and ended_at is null;
  update public.work_sessions set end_time=server_now,ended_at=server_now,status='completed'
  where id=p_work_session and user_id=auth.uid() and ended_at is null;
  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'STOP_WORK','work_session',p_work_session,jsonb_build_object('server_timestamp',server_now));
end;
$$;

create or replace function public.upt_update_task_status(p_assignment uuid,p_status text)
returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare v_assignment public.task_assignments%rowtype; v_event uuid; v_workplace uuid;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_status not in ('NOT STARTED','IN PROGRESS','COMPLETED') then raise exception 'Invalid task status'; end if;
  select * into v_assignment from public.task_assignments where id=p_assignment for update;
  if not found then raise exception 'Task assignment not found'; end if;
  if v_assignment.user_id<>auth.uid() then raise exception 'Task assignment does not belong to this user'; end if;
  select t.event_id,t.workplace_id into v_event,v_workplace from public.tasks t where t.id=v_assignment.task_id;
  if not public.upt_feature_allowed('tasks',v_event,v_workplace) then raise exception 'Taken zijn op dit moment niet beschikbaar.'; end if;
  update public.task_assignments
  set status=p_status,
      confirmed_at=case when p_status='COMPLETED' then coalesce(confirmed_at,now()) else null end,
      updated_at=now()
  where id=p_assignment;
  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'TASK_STATUS_CHANGED','task_assignment',p_assignment,jsonb_build_object('old_status',v_assignment.status,'new_status',p_status,'task_id',v_assignment.task_id));
  return p_assignment;
end;
$$;

create or replace function public.upt_create_incident(
  p_event uuid,p_workplace uuid,p_message text,p_photo_path text default null,
  p_latitude numeric default null,p_longitude numeric default null,p_accuracy_m numeric default null
) returns uuid
language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare
  v_actor uuid:=auth.uid(); v_message text:=trim(coalesce(p_message,''));
  v_media text:=nullif(trim(coalesce(p_photo_path,'')),''); v_incident uuid; v_mime text;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if not public.upt_feature_allowed('incidents',p_event,p_workplace) then raise exception 'Incidenten zijn alleen beschikbaar tijdens je actieve shift.'; end if;
  if length(v_message) not between 1 and 4000 then raise exception 'Ongeldige melding.'; end if;
  if not exists(select 1 from public.event_members em where em.event_id=p_event and em.user_id=v_actor) then raise exception 'Geen toegang tot event.'; end if;
  if p_workplace is not null and not exists(
    select 1 from public.shifts s where s.event_id=p_event and s.workplace_id=p_workplace and s.user_id=v_actor
      and s.status<>'cancelled' and now() between s.scheduled_start and s.scheduled_end
  ) then raise exception 'Geen toegang tot werkplek.'; end if;
  if v_media is not null then
    if split_part(v_media,'/',1)<>v_actor::text then raise exception 'Ongeldig mediapad.'; end if;
    select o.metadata->>'mimetype' into v_mime from storage.objects o where o.bucket_id='incident-photos' and o.name=v_media;
    if v_mime is null or v_mime not in ('image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime') then
      raise exception 'Ongeldige incidentmedia.';
    end if;
  end if;
  if (p_latitude is null)<>(p_longitude is null) then raise exception 'Onvolledige GPS-coördinaten.'; end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180) then raise exception 'Ongeldige GPS-coördinaten.'; end if;
  if p_accuracy_m is not null and p_accuracy_m<0 then raise exception 'Ongeldige GPS-nauwkeurigheid.'; end if;
  insert into public.incidents(user_id,reporter_id,event_id,workplace_id,message,description,photo_path,latitude,longitude,gps_accuracy_m)
  values(v_actor,v_actor,p_event,p_workplace,v_message,v_message,v_media,p_latitude,p_longitude,p_accuracy_m)
  returning id into v_incident;
  insert into public.crew_notifications(user_id,title,body,kind,link)
  select distinct p.id,'URGENT',v_incident::text,'incident','/incidents'
  from public.profiles p
  where p.approved and (
    p.role='admin'
    or p.id=v_actor
    or exists (
      select 1 from public.responsible_assignments r
      join public.shifts s on s.event_id=r.event_id and s.workplace_id=r.workplace_id and s.user_id=p.id
      where r.user_id=p.id and r.event_id=p_event
        and (p_workplace is null or r.workplace_id=p_workplace)
        and s.status<>'cancelled'
        and now() between s.scheduled_start and s.scheduled_end
    )
  );
  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_actor,'URGENT','incidents',v_incident,jsonb_build_object('has_media',v_media is not null,'media_type',v_mime,'has_gps',p_latitude is not null,'gps_accuracy_m',p_accuracy_m));
  return v_incident;
end;
$$;

notify pgrst, 'reload schema';
