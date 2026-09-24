drop policy if exists workplaces_manage_insert on public.workplaces;
create policy workplaces_manage_insert
on public.workplaces
for insert
to authenticated
with check (public.upt_is_admin());

drop policy if exists workplaces_manage_update on public.workplaces;
create policy workplaces_manage_update
on public.workplaces
for update
to authenticated
using (public.upt_is_admin())
with check (public.upt_is_admin());

drop policy if exists shifts_read on public.shifts;
create policy shifts_read
on public.shifts
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.upt_is_admin()
  or upt_private.is_event_responsible(event_id, (select auth.uid()))
  or public.upt_is_responsible(event_id, workplace_id, (select auth.uid()))
);

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
      'requester_role',v_requester_role,
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

notify pgrst,'reload schema';
