alter table public.check_ins
  add column if not exists shift_id uuid references public.shifts(id) on delete set null,
  add column if not exists early_reason text,
  add column if not exists contact_confirmed boolean,
  add column if not exists effective_start_at timestamptz;

alter table public.check_outs
  add column if not exists shift_id uuid references public.shifts(id) on delete set null,
  add column if not exists contact_confirmed boolean,
  add column if not exists remote boolean not null default false,
  add column if not exists effective_end_at timestamptz;

alter table public.shifts
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmation_revision timestamptz;

alter table public.event_availability
  add column if not exists setup_available boolean,
  add column if not exists breakdown_available boolean;

create or replace function public.upt_confirm_shift(p_shift uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.shifts
  set confirmed_at=now()
  where id=p_shift and user_id=auth.uid() and coalesce(status,'')<>'cancelled';
  if not found then raise exception 'Shift not found'; end if;
end
$$;

revoke all on function public.upt_confirm_shift(uuid) from public,anon;
grant execute on function public.upt_confirm_shift(uuid) to authenticated;

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
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_response not in ('available','unavailable') then raise exception 'Invalid response'; end if;
  insert into public.event_availability(event_id,user_id,response,responded_at,updated_at,setup_available,breakdown_available)
  values(p_event,auth.uid(),p_response,now(),now(),p_setup,p_breakdown)
  on conflict(event_id,user_id)
  do update set response=excluded.response,responded_at=now(),updated_at=now(),setup_available=excluded.setup_available,breakdown_available=excluded.breakdown_available;
end
$$;

revoke all on function public.upt_set_event_availability_extended(uuid,text,boolean,boolean) from public,anon;
grant execute on function public.upt_set_event_availability_extended(uuid,text,boolean,boolean) to authenticated;

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
  v_has_responsible boolean;
  v_missing_briefings int;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=v_uid and approved=true) then raise exception 'ACCOUNT NOT APPROVED'; end if;

  select * into v_session
  from public.work_sessions
  where user_id=v_uid and ended_at is null
  order by started_at desc
  limit 1;

  if found then
    select * into v_shift from public.shifts where id=v_session.shift_id;
    if p_contact_confirmed is null then
      return jsonb_build_object('action','contact','kind','stop','shift_id',v_shift.id);
    end if;

    select exists(
      select 1
      from public.responsible_assignments ra
      join public.work_sessions ws
        on ws.user_id=ra.user_id
       and ws.event_id=ra.event_id
       and ws.ended_at is null
      where ra.event_id=v_session.event_id
        and (ra.workplace_id is null or ra.workplace_id=v_shift.workplace_id)
    ) into v_has_responsible;

    if not p_contact_confirmed and not p_remote and v_has_responsible then
      return jsonb_build_object('action','remote_required','kind','stop','shift_id',v_shift.id);
    end if;

    insert into public.check_outs(event_id,user_id,workplace_id,status,requested_at,shift_id,contact_confirmed,remote,effective_end_at)
    values(v_session.event_id,v_uid,v_shift.workplace_id,'pending',v_now,v_shift.id,p_contact_confirmed,not p_contact_confirmed,v_now)
    returning id into v_id;

    return jsonb_build_object(
      'action','requested','kind','stop','request_id',v_id,
      'reviewer',case when v_has_responsible then 'responsible' else 'admin' end
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

  if v_shift.confirmed_at is null
     or (v_shift.confirmation_revision is not null and v_shift.confirmed_at<v_shift.confirmation_revision)
  then
    return jsonb_build_object('action','confirm_required','kind','shift','shift_id',v_shift.id);
  end if;

  select count(*) into v_missing_briefings
  from public.briefings b
  where b.event_id=v_shift.event_id
    and b.required=true
    and (b.workplace_id is null or b.workplace_id=v_shift.workplace_id)
    and not exists(
      select 1
      from public.briefing_acknowledgements ba
      where ba.briefing_id=b.id
        and ba.user_id=v_uid
        and ba.version=b.version
    );

  if v_missing_briefings>0 then
    return jsonb_build_object(
      'action','confirm_required','kind','briefings',
      'count',v_missing_briefings,'event_id',v_shift.event_id
    );
  end if;

  if v_now < v_shift.scheduled_start-interval '10 minutes'
     and length(trim(coalesce(p_early_reason,'')))=0
  then
    return jsonb_build_object('action','early_reason_required','shift_id',v_shift.id);
  end if;

  if p_contact_confirmed is null then
    return jsonb_build_object('action','contact','kind','start','shift_id',v_shift.id);
  end if;

  select exists(
    select 1
    from public.responsible_assignments ra
    join public.work_sessions ws
      on ws.user_id=ra.user_id
     and ws.event_id=ra.event_id
     and ws.ended_at is null
    where ra.event_id=v_shift.event_id
      and (ra.workplace_id is null or ra.workplace_id=v_shift.workplace_id)
  ) into v_has_responsible;

  if not p_contact_confirmed and not p_remote and v_has_responsible then
    return jsonb_build_object('action','remote_required','kind','start','shift_id',v_shift.id);
  end if;

  v_effective:=case
    when v_now>=v_shift.scheduled_start-interval '10 minutes' and v_now<v_shift.scheduled_start
      then v_shift.scheduled_start
    else v_now
  end;

  insert into public.check_ins(
    user_id,event_id,workplace_id,type,status,remote,requested_at,created_at,
    shift_id,early_reason,contact_confirmed,effective_start_at
  )
  values(
    v_uid,v_shift.event_id,v_shift.workplace_id,'check-in','pending',
    not p_contact_confirmed,v_now,v_now,v_shift.id,p_early_reason,p_contact_confirmed,v_effective
  )
  returning id into v_id;

  return jsonb_build_object(
    'action','requested','kind','start','request_id',v_id,
    'effective_at',v_effective,
    'early',v_effective<v_shift.scheduled_start,
    'reviewer',case when v_has_responsible then 'responsible' else 'admin' end
  );
end
$$;

revoke all on function public.upt_qr_request(boolean,boolean,text) from public,anon;
grant execute on function public.upt_qr_request(boolean,boolean,text) to authenticated;

create or replace function public.upt_mark_shift_revision()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if row(old.role_name,old.scheduled_start,old.scheduled_end,old.workplace_id)
     is distinct from
     row(new.role_name,new.scheduled_start,new.scheduled_end,new.workplace_id)
  then
    new.confirmation_revision:=now();
    new.confirmed_at:=null;
  end if;
  return new;
end
$$;

drop trigger if exists upt_shift_confirmation_revision on public.shifts;
create trigger upt_shift_confirmation_revision
before update on public.shifts
for each row execute function public.upt_mark_shift_revision();

notify pgrst,'reload schema';
