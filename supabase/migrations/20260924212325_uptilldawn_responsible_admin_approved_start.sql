create or replace function public.upt_decide_check_in(
  p_check_in uuid,
  p_approve boolean,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_check_in public.check_ins%rowtype;
  v_status text;
  v_requester_role text;
  v_effective_at timestamptz;
  v_shift_id uuid;
  v_work_session_id uuid;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_check_in
  from public.check_ins
  where id=p_check_in
  for update;

  if not found then raise exception 'Check-in request not found'; end if;
  if v_check_in.status <> 'pending' then raise exception 'Check-in request has already been decided'; end if;

  v_requester_role := public.upt_effective_role(v_check_in.user_id);
  v_effective_at := coalesce(v_check_in.requested_at,v_check_in.created_at,now());

  if v_requester_role='responsible_lead' then
    if not public.upt_is_admin(auth.uid()) then
      raise exception 'Een verantwoordelijke kan zijn eigen starturen niet goedkeuren. Goedkeuring door admin is vereist.';
    end if;
  elsif not (
    public.upt_is_admin(auth.uid())
    or public.upt_is_responsible(v_check_in.event_id,v_check_in.workplace_id,auth.uid())
  ) then
    raise exception 'Not authorized to decide this check-in';
  end if;

  v_status := case when p_approve then 'approved' else 'rejected' end;

  if p_approve and v_requester_role='responsible_lead' then
    select s.id into v_shift_id
    from public.shifts s
    where s.user_id=v_check_in.user_id
      and s.event_id=v_check_in.event_id
      and s.workplace_id=v_check_in.workplace_id
      and s.status<>'cancelled'
      and v_effective_at between s.scheduled_start and s.scheduled_end
    order by s.scheduled_start desc
    limit 1;

    if v_shift_id is null then
      raise exception 'Geen geldige dienst gevonden voor de aangevraagde starttijd.';
    end if;

    if exists (
      select 1
      from public.work_sessions ws
      where ws.user_id=v_check_in.user_id
        and ws.ended_at is null
    ) then
      raise exception 'Er is al een actieve werkregistratie.';
    end if;
  end if;

  update public.check_ins
  set status=v_status,
      decided_by=auth.uid(),
      decided_at=now(),
      approved_by=case when p_approve then auth.uid() else null end,
      approved_at=case when p_approve then v_effective_at else null end,
      notes=p_notes
  where id=p_check_in;

  if p_approve and v_requester_role='responsible_lead' then
    insert into public.work_sessions(event_id,user_id,shift_id,start_time,started_at,status)
    values(v_check_in.event_id,v_check_in.user_id,v_shift_id,v_effective_at,v_effective_at,'active')
    returning id into v_work_session_id;

    insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
    values(
      auth.uid(),
      'RESPONSIBLE_WORK_START_APPROVED',
      'work_session',
      v_work_session_id,
      jsonb_build_object(
        'user_id',v_check_in.user_id,
        'event_id',v_check_in.event_id,
        'workplace_id',v_check_in.workplace_id,
        'shift_id',v_shift_id,
        'check_in_id',p_check_in,
        'effective_at',v_effective_at
      )
    );
  end if;

  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values (
    auth.uid(),
    case when p_approve then 'CHECK_IN_APPROVED' else 'CHECK_IN_REJECTED' end,
    'check_in',
    p_check_in,
    jsonb_build_object(
      'user_id',v_check_in.user_id,
      'requester_role',v_requester_role,
      'event_id',v_check_in.event_id,
      'workplace_id',v_check_in.workplace_id,
      'requested_at',v_check_in.requested_at,
      'effective_at',case when p_approve then v_effective_at else null end,
      'work_session_id',v_work_session_id,
      'notes',p_notes
    )
  );

  return p_check_in;
end;
$$;

notify pgrst,'reload schema';
