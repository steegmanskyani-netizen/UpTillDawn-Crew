alter table public.check_ins
  add column if not exists reviewer_kind text,
  add column if not exists work_session_id uuid references public.work_sessions(id) on delete set null;

alter table public.check_outs
  add column if not exists reviewer_kind text,
  add column if not exists work_session_id uuid references public.work_sessions(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='check_ins_reviewer_kind_check'
  ) then
    alter table public.check_ins
      add constraint check_ins_reviewer_kind_check
      check (reviewer_kind is null or reviewer_kind in ('responsible','admin'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname='check_outs_reviewer_kind_check'
  ) then
    alter table public.check_outs
      add constraint check_outs_reviewer_kind_check
      check (reviewer_kind is null or reviewer_kind in ('responsible','admin'));
  end if;
end $$;

create table if not exists public.time_review_requests(
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null unique references public.check_ins(id) on delete cascade,
  work_session_id uuid not null references public.work_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  shift_id uuid not null references public.shifts(id) on delete cascade,
  requested_start timestamptz not null,
  scheduled_start timestamptz not null,
  reason text not null,
  status text not null default 'pending' check(status in ('pending','approved','adjusted')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  adjusted_start timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists time_review_requests_status_idx
  on public.time_review_requests(status,created_at);
create index if not exists time_review_requests_user_idx
  on public.time_review_requests(user_id,created_at desc);

alter table public.time_review_requests enable row level security;
revoke all on public.time_review_requests from anon;
grant select on public.time_review_requests to authenticated;
revoke insert,update,delete on public.time_review_requests from authenticated;

drop policy if exists time_review_requests_read on public.time_review_requests;
create policy time_review_requests_read
on public.time_review_requests
for select
to authenticated
using (
  user_id=(select auth.uid())
  or public.upt_is_admin((select auth.uid()))
);

create or replace function public.upt_set_event_availability_extended(
  p_event uuid,
  p_response text,
  p_setup boolean,
  p_breakdown boolean
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null or not public.upt_is_approved() then
    raise exception 'Authentication required';
  end if;
  if p_response not in ('can','cannot') then
    raise exception 'Invalid response';
  end if;
  if not exists(
    select 1 from public.events e
    where e.id=p_event and e.status<>'archived' and now()<e.start_at
  ) then
    raise exception 'Beschikbaarheid kan alleen voor een toekomstig evenement worden ingesteld.';
  end if;

  insert into public.event_availability(
    event_id,user_id,response,responded_at,updated_at,setup_available,breakdown_available
  )
  values(p_event,auth.uid(),p_response,now(),now(),p_setup,p_breakdown)
  on conflict(event_id,user_id)
  do update set
    response=excluded.response,
    responded_at=now(),
    updated_at=now(),
    setup_available=excluded.setup_available,
    breakdown_available=excluded.breakdown_available;
end
$$;

revoke all on function public.upt_set_event_availability_extended(uuid,text,boolean,boolean)
from public,anon;
grant execute on function public.upt_set_event_availability_extended(uuid,text,boolean,boolean)
to authenticated;

create or replace function public.upt_mark_shift_revision()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if row(
    old.role_name,old.scheduled_start,old.scheduled_end,old.workplace_id,
    old.shift_kind,old.overlap_allowed
  ) is distinct from row(
    new.role_name,new.scheduled_start,new.scheduled_end,new.workplace_id,
    new.shift_kind,new.overlap_allowed
  ) then
    new.confirmation_revision:=now();
    new.confirmed_at:=null;
  end if;
  return new;
end
$$;

create or replace function public.upt_qr_request(
  p_contact_confirmed boolean default null,
  p_remote boolean default false,
  p_early_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_shift public.shifts%rowtype;
  v_session public.work_sessions%rowtype;
  v_now timestamptz:=now();
  v_id uuid;
  v_effective timestamptz;
  v_has_responsible boolean:=false;
  v_missing_briefings jsonb:='[]'::jsonb;
  v_pending uuid;
  v_reviewer text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=v_uid and approved=true) then
    raise exception 'ACCOUNT NOT APPROVED';
  end if;

  select * into v_session
  from public.work_sessions
  where user_id=v_uid and ended_at is null
  order by started_at desc
  limit 1;

  if found then
    select * into v_shift from public.shifts where id=v_session.shift_id;

    select co.id into v_pending
    from public.check_outs co
    where co.user_id=v_uid
      and co.status='pending'
      and (co.work_session_id=v_session.id or (co.work_session_id is null and co.event_id=v_session.event_id))
    order by co.requested_at desc
    limit 1;
    if v_pending is not null then
      return jsonb_build_object('action','pending','kind','stop','request_id',v_pending);
    end if;

    select exists(
      select 1
      from public.responsible_assignments ra
      join public.work_sessions rws
        on rws.user_id=ra.user_id
       and rws.event_id=ra.event_id
       and rws.ended_at is null
      join public.shifts rs on rs.id=rws.shift_id
      where ra.event_id=v_session.event_id
        and ra.user_id<>v_uid
        and ra.workplace_id=v_shift.workplace_id
        and rs.workplace_id=ra.workplace_id
    ) into v_has_responsible;

    v_reviewer:=case when v_has_responsible then 'responsible' else 'admin' end;

    if not v_has_responsible and not p_remote then
      return jsonb_build_object(
        'action','remote_required','kind','stop','shift_id',v_shift.id,'reviewer','admin','no_responsible',true
      );
    end if;

    if v_has_responsible and p_contact_confirmed is null then
      return jsonb_build_object('action','contact','kind','stop','shift_id',v_shift.id);
    end if;

    if v_has_responsible and p_contact_confirmed=false and not p_remote then
      return jsonb_build_object(
        'action','remote_required','kind','stop','shift_id',v_shift.id,'reviewer','responsible'
      );
    end if;

    insert into public.check_outs(
      event_id,user_id,workplace_id,status,requested_at,shift_id,
      contact_confirmed,remote,effective_end_at,reviewer_kind,work_session_id
    )
    values(
      v_session.event_id,v_uid,v_shift.workplace_id,'pending',v_now,v_shift.id,
      coalesce(p_contact_confirmed,false),p_remote,v_now,v_reviewer,v_session.id
    )
    returning id into v_id;

    return jsonb_build_object(
      'action','requested','kind','stop','request_id',v_id,'reviewer',v_reviewer
    );
  end if;

  select * into v_shift
  from public.shifts
  where user_id=v_uid
    and coalesce(status,'')<>'cancelled'
    and v_now between scheduled_start-interval '60 minutes' and scheduled_end
  order by scheduled_start asc
  limit 1;

  if not found then
    select * into v_shift
    from public.shifts
    where user_id=v_uid
      and coalesce(status,'')<>'cancelled'
      and scheduled_start>v_now
    order by scheduled_start asc
    limit 1;

    return jsonb_build_object(
      'action','outside_window',
      'next_shift_id',v_shift.id,
      'next_start',v_shift.scheduled_start
    );
  end if;

  select ci.id into v_pending
  from public.check_ins ci
  where ci.user_id=v_uid
    and ci.status='pending'
    and (ci.shift_id=v_shift.id or (ci.shift_id is null and ci.event_id=v_shift.event_id and ci.workplace_id=v_shift.workplace_id))
  order by ci.requested_at desc
  limit 1;
  if v_pending is not null then
    return jsonb_build_object('action','pending','kind','start','request_id',v_pending,'shift_id',v_shift.id);
  end if;

  if v_shift.confirmed_at is null
     or (v_shift.confirmation_revision is not null and v_shift.confirmed_at<v_shift.confirmation_revision)
  then
    return jsonb_build_object(
      'action','confirm_required',
      'kind','shift',
      'shift_id',v_shift.id,
      'items',jsonb_build_array(jsonb_build_object(
        'id',v_shift.id,
        'title','Toegewezen shift',
        'link','/shifts'
      ))
    );
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('id',b.id,'title',b.title,'link','/briefings') order by b.created_at),
    '[]'::jsonb
  )
  into v_missing_briefings
  from public.briefings b
  where b.event_id=v_shift.event_id
    and (b.workplace_id is null or b.workplace_id=v_shift.workplace_id)
    and not exists(
      select 1
      from public.briefing_acknowledgements ba
      where ba.briefing_id=b.id
        and ba.user_id=v_uid
        and ba.version=b.version
    );

  if jsonb_array_length(v_missing_briefings)>0 then
    return jsonb_build_object(
      'action','confirm_required',
      'kind','briefings',
      'count',jsonb_array_length(v_missing_briefings),
      'event_id',v_shift.event_id,
      'items',v_missing_briefings
    );
  end if;

  if v_now < v_shift.scheduled_start-interval '10 minutes'
     and length(trim(coalesce(p_early_reason,'')))=0
  then
    return jsonb_build_object('action','early_reason_required','shift_id',v_shift.id);
  end if;

  select exists(
    select 1
    from public.responsible_assignments ra
    join public.work_sessions rws
      on rws.user_id=ra.user_id
     and rws.event_id=ra.event_id
     and rws.ended_at is null
    join public.shifts rs on rs.id=rws.shift_id
    where ra.event_id=v_shift.event_id
      and ra.user_id<>v_uid
      and ra.workplace_id=v_shift.workplace_id
      and rs.workplace_id=ra.workplace_id
  ) into v_has_responsible;

  v_reviewer:=case when v_has_responsible then 'responsible' else 'admin' end;

  if not v_has_responsible and not p_remote then
    return jsonb_build_object(
      'action','remote_required','kind','start','shift_id',v_shift.id,'reviewer','admin','no_responsible',true
    );
  end if;

  if v_has_responsible and p_contact_confirmed is null then
    return jsonb_build_object('action','contact','kind','start','shift_id',v_shift.id);
  end if;

  if v_has_responsible and p_contact_confirmed=false and not p_remote then
    return jsonb_build_object(
      'action','remote_required','kind','start','shift_id',v_shift.id,'reviewer','responsible'
    );
  end if;

  v_effective:=case
    when v_now>=v_shift.scheduled_start-interval '10 minutes'
     and v_now<v_shift.scheduled_start
      then v_shift.scheduled_start
    else v_now
  end;

  insert into public.check_ins(
    user_id,event_id,workplace_id,type,status,remote,requested_at,created_at,
    shift_id,early_reason,contact_confirmed,effective_start_at,reviewer_kind,requested_role
  )
  values(
    v_uid,v_shift.event_id,v_shift.workplace_id,'check-in','pending',p_remote,v_now,v_now,
    v_shift.id,nullif(trim(coalesce(p_early_reason,'')),''),coalesce(p_contact_confirmed,false),
    v_effective,v_reviewer,public.upt_effective_role(v_uid)
  )
  returning id into v_id;

  return jsonb_build_object(
    'action','requested','kind','start','request_id',v_id,
    'effective_at',v_effective,
    'early',v_effective<v_shift.scheduled_start,
    'reviewer',v_reviewer
  );
end
$$;

revoke all on function public.upt_qr_request(boolean,boolean,text) from public,anon;
grant execute on function public.upt_qr_request(boolean,boolean,text) to authenticated;

create or replace function public.upt_decide_check_in(
  p_check_in uuid,
  p_approve boolean,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_check public.check_ins%rowtype;
  v_shift public.shifts%rowtype;
  v_effective timestamptz;
  v_session uuid;
  v_reviewer text;
  v_is_admin boolean;
begin
  if auth.uid() is null or not public.upt_is_approved() then raise exception 'Authentication required'; end if;
  select * into v_check from public.check_ins where id=p_check_in for update;
  if not found then raise exception 'Check-in request not found'; end if;
  if v_check.status<>'pending' then raise exception 'Check-in request has already been decided'; end if;
  if not p_approve and length(trim(coalesce(p_notes,'')))=0 then
    raise exception 'Reden voor afwijzing is verplicht.';
  end if;

  v_is_admin:=public.upt_is_admin(auth.uid());
  v_reviewer:=coalesce(v_check.reviewer_kind,'responsible');

  if v_check.user_id=auth.uid() and not v_is_admin then
    raise exception 'Je kunt je eigen urenaanvraag niet goedkeuren.';
  end if;

  if v_reviewer='admin' then
    if not v_is_admin then raise exception 'Goedkeuring door admin vereist.'; end if;
  elsif not (
    v_is_admin or public.upt_is_responsible(v_check.event_id,v_check.workplace_id,auth.uid())
  ) then
    raise exception 'Not authorized to decide this check-in';
  end if;

  if not p_approve then
    update public.check_ins
    set status='rejected',decided_by=auth.uid(),decided_at=now(),
        approved_by=null,approved_at=null,notes=trim(p_notes)
    where id=p_check_in;
    return p_check_in;
  end if;

  if v_check.shift_id is not null then
    select * into v_shift from public.shifts where id=v_check.shift_id and user_id=v_check.user_id;
  else
    select * into v_shift
    from public.shifts
    where user_id=v_check.user_id
      and event_id=v_check.event_id
      and workplace_id=v_check.workplace_id
      and coalesce(status,'')<>'cancelled'
      and coalesce(v_check.effective_start_at,v_check.requested_at)
          between scheduled_start-interval '60 minutes' and scheduled_end
    order by scheduled_start
    limit 1;
  end if;
  if v_shift.id is null then raise exception 'Geen geldige shift gevonden.'; end if;

  v_effective:=coalesce(v_check.effective_start_at,v_check.requested_at,v_check.created_at,now());
  if v_effective<v_shift.scheduled_start-interval '60 minutes' or v_effective>v_shift.scheduled_end then
    raise exception 'Aangevraagde starttijd valt buiten het toegestane shiftvenster.';
  end if;

  if exists(select 1 from public.work_sessions ws where ws.user_id=v_check.user_id and ws.ended_at is null) then
    raise exception 'Er is al een actieve werkregistratie.';
  end if;

  insert into public.work_sessions(event_id,user_id,shift_id,start_time,started_at,status)
  values(v_check.event_id,v_check.user_id,v_shift.id,v_effective,v_effective,'active')
  returning id into v_session;

  update public.check_ins
  set status='approved',decided_by=auth.uid(),decided_at=now(),
      approved_by=auth.uid(),approved_at=now(),notes=null,
      effective_start_at=v_effective,work_session_id=v_session
  where id=p_check_in;

  if v_effective<v_shift.scheduled_start and not v_is_admin then
    insert into public.time_review_requests(
      check_in_id,work_session_id,user_id,shift_id,requested_start,scheduled_start,reason
    )
    values(
      p_check_in,v_session,v_check.user_id,v_shift.id,v_effective,v_shift.scheduled_start,
      coalesce(nullif(trim(v_check.early_reason),''),'Vroegstart')
    )
    on conflict(check_in_id) do nothing;

    insert into public.crew_notifications(user_id,title,body,kind,link)
    select p.id,'Vroegstart controleren',
      coalesce((select full_name from public.profiles where id=v_check.user_id),'Personeelslid')
      ||' startte vóór de geplande shift.','time_review','/operations'
    from public.profiles p
    where p.approved=true and public.upt_is_admin(p.id);
  end if;

  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),'CHECK_IN_APPROVED','check_in',p_check_in,
    jsonb_build_object(
      'user_id',v_check.user_id,'event_id',v_check.event_id,'shift_id',v_shift.id,
      'work_session_id',v_session,'effective_at',v_effective,'reviewer_kind',v_reviewer
    )
  );

  return p_check_in;
end
$$;

create or replace function public.upt_decide_check_out(
  p_check_out uuid,
  p_approve boolean,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_check public.check_outs%rowtype;
  v_session public.work_sessions%rowtype;
  v_effective timestamptz;
  v_reviewer text;
  v_is_admin boolean;
begin
  if auth.uid() is null or not public.upt_is_approved() then raise exception 'Authentication required'; end if;
  select * into v_check from public.check_outs where id=p_check_out for update;
  if not found then raise exception 'Check-out request not found'; end if;
  if v_check.status<>'pending' then raise exception 'Check-out request has already been decided'; end if;
  if not p_approve and length(trim(coalesce(p_notes,'')))=0 then
    raise exception 'Reden voor afwijzing is verplicht.';
  end if;

  v_is_admin:=public.upt_is_admin(auth.uid());
  v_reviewer:=coalesce(v_check.reviewer_kind,'responsible');

  if v_check.user_id=auth.uid() and not v_is_admin then
    raise exception 'Je kunt je eigen urenaanvraag niet goedkeuren.';
  end if;

  if v_reviewer='admin' then
    if not v_is_admin then raise exception 'Goedkeuring door admin vereist.'; end if;
  elsif not (
    v_is_admin or (
      v_check.workplace_id is not null
      and public.upt_is_responsible(v_check.event_id,v_check.workplace_id,auth.uid())
    )
  ) then
    raise exception 'Not authorized to decide this check-out';
  end if;

  if not p_approve then
    update public.check_outs
    set status='rejected',decided_by=auth.uid(),decided_at=now(),notes=trim(p_notes)
    where id=p_check_out;
    return p_check_out;
  end if;

  if v_check.work_session_id is not null then
    select * into v_session
    from public.work_sessions
    where id=v_check.work_session_id and user_id=v_check.user_id
    for update;
  else
    select * into v_session
    from public.work_sessions
    where user_id=v_check.user_id and event_id=v_check.event_id and ended_at is null
    order by started_at desc
    limit 1
    for update;
  end if;

  if v_session.id is null then raise exception 'Geen actieve werkregistratie gevonden.'; end if;

  v_effective:=greatest(
    coalesce(v_check.effective_end_at,v_check.requested_at,now()),
    v_session.started_at
  );

  update public.break_sessions
  set end_time=greatest(v_effective,started_at),
      ended_at=greatest(v_effective,started_at)
  where work_session_id=v_session.id
    and user_id=v_check.user_id
    and ended_at is null;

  update public.work_sessions
  set end_time=v_effective,ended_at=v_effective,status='completed'
  where id=v_session.id;

  update public.check_outs
  set status='approved',decided_by=auth.uid(),decided_at=now(),notes=null,
      effective_end_at=v_effective,work_session_id=v_session.id
  where id=p_check_out;

  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),'CHECK_OUT_APPROVED','check_out',p_check_out,
    jsonb_build_object(
      'user_id',v_check.user_id,'event_id',v_check.event_id,
      'work_session_id',v_session.id,'effective_at',v_effective,'reviewer_kind',v_reviewer
    )
  );

  return p_check_out;
end
$$;

revoke all on function public.upt_decide_check_in(uuid,boolean,text) from public,anon;
grant execute on function public.upt_decide_check_in(uuid,boolean,text) to authenticated;
revoke all on function public.upt_decide_check_out(uuid,boolean,text) from public,anon;
grant execute on function public.upt_decide_check_out(uuid,boolean,text) to authenticated;

create or replace function public.upt_admin_review_early_start(
  p_review uuid,
  p_start timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_review public.time_review_requests%rowtype;
  v_session public.work_sessions%rowtype;
  v_start timestamptz;
begin
  if auth.uid() is null or not public.upt_is_admin(auth.uid()) then
    raise exception 'Admin required';
  end if;

  select * into v_review
  from public.time_review_requests
  where id=p_review
  for update;
  if not found then raise exception 'Review niet gevonden.'; end if;
  if v_review.status<>'pending' then raise exception 'Review is al verwerkt.'; end if;

  select * into v_session
  from public.work_sessions
  where id=v_review.work_session_id
  for update;
  if not found then raise exception 'Werkregistratie niet gevonden.'; end if;

  v_start:=coalesce(p_start,v_review.requested_start);
  if v_start<v_review.scheduled_start-interval '60 minutes' or v_start>now() then
    raise exception 'Ongeldige gecorrigeerde starttijd.';
  end if;
  if v_session.ended_at is not null and v_start>v_session.ended_at then
    raise exception 'Starttijd kan niet na de eindtijd liggen.';
  end if;

  if v_start is distinct from v_session.started_at then
    insert into public.time_corrections(
      work_session_id,user_id,field_name,original_value,corrected_value,reason,corrected_by
    )
    values(
      v_session.id,v_review.user_id,'started_at',v_session.started_at,v_start,
      'Vroegstartreview: '||v_review.reason,auth.uid()
    );

    update public.work_sessions
    set start_time=v_start,started_at=v_start
    where id=v_session.id;
  end if;

  update public.time_review_requests
  set status=case when v_start is distinct from v_review.requested_start then 'adjusted' else 'approved' end,
      reviewed_by=auth.uid(),reviewed_at=now(),
      adjusted_start=case when v_start is distinct from v_review.requested_start then v_start else null end
  where id=p_review;

  insert into public.crew_notifications(user_id,title,body,kind,link)
  values(
    v_review.user_id,
    'Vroegstart gecontroleerd',
    case
      when v_start is distinct from v_review.requested_start
        then 'Je starttijd is aangepast naar '||to_char(v_start at time zone 'Europe/Brussels','DD/MM/YYYY HH24:MI')||'.'
      else 'Je vroegstart is goedgekeurd.'
    end,
    'time_review','/operations'
  );

  return p_review;
end
$$;

revoke all on function public.upt_admin_review_early_start(uuid,timestamptz) from public,anon;
grant execute on function public.upt_admin_review_early_start(uuid,timestamptz) to authenticated;

create or replace function public.upt_confirm_task_assignment(p_assignment uuid)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_row public.task_assignments%rowtype;
begin
  if auth.uid() is null or not public.upt_is_approved() then raise exception 'Authentication required'; end if;
  select * into v_row from public.task_assignments where id=p_assignment for update;
  if not found or v_row.user_id<>auth.uid() then raise exception 'Taaktoewijzing niet gevonden.'; end if;

  update public.task_assignments
  set confirmed_at=now(),updated_at=now()
  where id=p_assignment;

  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'TASK_CONFIRMED','task_assignment',p_assignment,jsonb_build_object('task_id',v_row.task_id));

  return p_assignment;
end
$$;

revoke all on function public.upt_confirm_task_assignment(uuid) from public,anon;
grant execute on function public.upt_confirm_task_assignment(uuid) to authenticated;

create or replace function public.upt_update_task_status(
  p_assignment uuid,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_assignment public.task_assignments%rowtype;
  v_event uuid;
  v_workplace uuid;
begin
  if auth.uid() is null or not public.upt_is_approved() then raise exception 'Authentication required'; end if;
  if p_status not in ('NOT STARTED','IN PROGRESS','COMPLETED') then raise exception 'Invalid task status'; end if;

  select * into v_assignment
  from public.task_assignments
  where id=p_assignment
  for update;

  if not found then raise exception 'Task assignment not found'; end if;
  if v_assignment.user_id<>auth.uid() then raise exception 'Task assignment does not belong to this user'; end if;
  if v_assignment.confirmed_at is null then raise exception 'Bevestig de taak eerst.'; end if;

  select t.event_id,t.workplace_id into v_event,v_workplace
  from public.tasks t where t.id=v_assignment.task_id;
  if not public.upt_feature_allowed('tasks',v_event,v_workplace) then
    raise exception 'Taken zijn op dit moment niet beschikbaar.';
  end if;

  update public.task_assignments
  set status=p_status,updated_at=now()
  where id=p_assignment;

  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),'TASK_STATUS_CHANGED','task_assignment',p_assignment,
    jsonb_build_object('old_status',v_assignment.status,'new_status',p_status,'task_id',v_assignment.task_id)
  );

  return p_assignment;
end
$$;

create or replace function public.upt_task_reconfirm_after_change()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if row(new.title,new.description,new.workplace_id) is distinct from row(old.title,old.description,old.workplace_id) then
    update public.task_assignments
    set confirmed_at=null,updated_at=now()
    where task_id=new.id;

    insert into public.crew_notifications(user_id,title,body,kind,link)
    select ta.user_id,'Taak gewijzigd — bevestig opnieuw',new.title,'task','/tasks'
    from public.task_assignments ta
    where ta.task_id=new.id;
  end if;
  return new;
end
$$;

drop trigger if exists upt_task_reconfirm_after_change on public.tasks;
create trigger upt_task_reconfirm_after_change
after update of title,description,workplace_id
on public.tasks
for each row
execute function public.upt_task_reconfirm_after_change();

create or replace function public.upt_notify_shift_change()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if tg_op='INSERT' then
    insert into public.crew_notifications(user_id,title,body,kind,link)
    values(new.user_id,'Nieuwe shift toegewezen','Bevestig je toegewezen shift.','shift','/shifts');
  elsif row(new.role_name,new.scheduled_start,new.scheduled_end,new.workplace_id,new.shift_kind,new.overlap_allowed)
        is distinct from
        row(old.role_name,old.scheduled_start,old.scheduled_end,old.workplace_id,old.shift_kind,old.overlap_allowed)
  then
    insert into public.crew_notifications(user_id,title,body,kind,link)
    values(new.user_id,'Shift gewijzigd — bevestig opnieuw','Je shiftgegevens zijn aangepast.','shift','/shifts');
  end if;
  return new;
end
$$;

drop trigger if exists upt_shift_change_notify on public.shifts;
create trigger upt_shift_change_notify
after insert or update
on public.shifts
for each row
execute function public.upt_notify_shift_change();

create or replace function public.upt_notify_check_decision()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_name text;
  v_title text;
  v_kind text;
  v_reviewer text;
begin
  select coalesce(full_name,'Personeelslid') into v_name
  from public.profiles where id=new.user_id;

  v_kind:=case when tg_table_name='check_ins' then 'start_request' else 'stop_request' end;

  if tg_op='INSERT' then
    v_reviewer:=coalesce(new.reviewer_kind,'responsible');
    v_title:=case when tg_table_name='check_ins' then 'Starturen aanvragen' else 'Stopuren aanvragen' end;

    if v_reviewer='admin' then
      insert into public.crew_notifications(user_id,title,body,kind,link)
      select p.id,v_title,
        v_name||case when coalesce(new.remote,false) then ' · remote aanvraag' else '' end,
        v_kind,'/operations'
      from public.profiles p
      where p.approved=true and public.upt_is_admin(p.id);
    else
      insert into public.crew_notifications(user_id,title,body,kind,link)
      select distinct ra.user_id,v_title,
        v_name||case when coalesce(new.remote,false) then ' · remote aanvraag' else '' end,
        v_kind,'/operations'
      from public.responsible_assignments ra
      join public.work_sessions rws
        on rws.user_id=ra.user_id
       and rws.event_id=ra.event_id
       and rws.ended_at is null
      join public.shifts rs on rs.id=rws.shift_id and rs.workplace_id=ra.workplace_id
      where ra.event_id=new.event_id
        and ra.workplace_id=new.workplace_id
        and ra.user_id<>new.user_id;
    end if;
  elsif new.status is distinct from old.status and new.status in ('approved','rejected') then
    insert into public.crew_notifications(user_id,title,body,kind,link)
    values(
      new.user_id,
      case
        when tg_table_name='check_ins' and new.status='approved' then 'Starturen goedgekeurd'
        when tg_table_name='check_outs' and new.status='approved' then 'Stopuren goedgekeurd'
        when tg_table_name='check_ins' then 'Starturen afgewezen'
        else 'Stopuren afgewezen'
      end,
      case
        when new.status='rejected' then 'Reden: '||coalesce(nullif(trim(new.notes),''),'Geen reden opgegeven')
        else 'Je aanvraag is goedgekeurd.'
      end,
      v_kind,
      '/operations'
    );
  end if;

  return new;
end
$$;

drop trigger if exists upt_check_in_notify on public.check_ins;
create trigger upt_check_in_notify
after insert or update of status
on public.check_ins
for each row execute function public.upt_notify_check_decision();

drop trigger if exists upt_check_out_notify on public.check_outs;
create trigger upt_check_out_notify
after insert or update of status
on public.check_outs
for each row execute function public.upt_notify_check_decision();

revoke all on function public.upt_notify_check_decision() from public,anon,authenticated;
grant execute on function public.upt_notify_check_decision() to postgres,service_role;

notify pgrst,'reload schema';
