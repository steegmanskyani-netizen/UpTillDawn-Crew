-- Staff content becomes visible only from the assigned event start.
-- Shift creation/edit/cancellation is admin-only.

create or replace function public.upt_create_shift(
  p_workplace uuid,
  p_user uuid,
  p_role_name text,
  p_start timestamptz,
  p_end timestamptz,
  p_overlap_allowed boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_event uuid;
  v_shift uuid;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if not public.upt_is_admin(v_actor) then raise exception 'Alleen admin kan diensten aanmaken of aanpassen.'; end if;

  select w.event_id into v_event
  from public.workplaces w
  where w.id = p_workplace and w.is_active = true;

  if v_event is null then raise exception 'Actieve werkplek niet gevonden.'; end if;
  if p_start is null or p_end is null or p_end <= p_start then raise exception 'Ongeldige dienstperiode.'; end if;
  if p_role_name is null or length(trim(p_role_name)) not between 1 and 200 then raise exception 'Ongeldige rol.'; end if;

  if not exists (
    select 1
    from public.event_members em
    join public.profiles p on p.id = em.user_id
    where em.event_id = v_event
      and em.user_id = p_user
      and p.approved = true
  ) then
    raise exception 'Goedgekeurd evenementlid vereist.';
  end if;

  if not coalesce(p_overlap_allowed, false) and exists (
    select 1
    from public.shifts s
    where s.user_id = p_user
      and s.status <> 'cancelled'
      and s.scheduled_start < p_end
      and s.scheduled_end > p_start
  ) then
    raise exception 'Dienst overlapt met een bestaande dienst.';
  end if;

  insert into public.shifts(
    event_id, workplace_id, user_id, role_name,
    scheduled_start, scheduled_end, start_time, end_time,
    overlap_allowed, status
  )
  values (
    v_event, p_workplace, p_user, trim(p_role_name),
    p_start, p_end, p_start, p_end,
    coalesce(p_overlap_allowed, false), 'scheduled'
  )
  returning id into v_shift;

  return v_shift;
end;
$$;

create or replace function public.upt_update_shift(
  p_shift uuid,
  p_role_name text,
  p_start timestamptz,
  p_end timestamptz,
  p_overlap_allowed boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_shift public.shifts%rowtype;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if not public.upt_is_admin(v_actor) then raise exception 'Alleen admin kan diensten aanmaken of aanpassen.'; end if;

  select * into v_shift from public.shifts where id = p_shift for update;
  if not found then raise exception 'Dienst niet gevonden.'; end if;
  if v_shift.status = 'cancelled' then raise exception 'Geannuleerde dienst kan niet worden gewijzigd.'; end if;
  if p_start is null or p_end is null or p_end <= p_start then raise exception 'Ongeldige dienstperiode.'; end if;
  if p_role_name is null or length(trim(p_role_name)) not between 1 and 200 then raise exception 'Ongeldige rol.'; end if;

  if exists (
    select 1 from public.work_sessions ws
    where ws.shift_id = p_shift and ws.ended_at is null
  ) then
    raise exception 'Actieve werktijd verhindert wijziging van de dienst.';
  end if;

  if not coalesce(p_overlap_allowed, false) and exists (
    select 1
    from public.shifts s
    where s.id <> p_shift
      and s.user_id = v_shift.user_id
      and s.status <> 'cancelled'
      and s.scheduled_start < p_end
      and s.scheduled_end > p_start
  ) then
    raise exception 'Dienst overlapt met een bestaande dienst.';
  end if;

  update public.shifts
  set role_name = trim(p_role_name),
      scheduled_start = p_start,
      scheduled_end = p_end,
      start_time = p_start,
      end_time = p_end,
      overlap_allowed = coalesce(p_overlap_allowed, false),
      updated_at = now()
  where id = p_shift;
end;
$$;

create or replace function public.upt_cancel_shift(
  p_shift uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_shift public.shifts%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if not public.upt_is_admin(v_actor) then raise exception 'Alleen admin kan diensten aanmaken of aanpassen.'; end if;

  select * into v_shift from public.shifts where id = p_shift for update;
  if not found then raise exception 'Dienst niet gevonden.'; end if;

  if exists (
    select 1 from public.work_sessions ws
    where ws.shift_id = p_shift and ws.ended_at is null
  ) then
    raise exception 'Actieve werktijd verhindert annulering.';
  end if;

  update public.shifts
  set status = 'cancelled',
      notes = case
        when v_reason is null then notes
        when notes is null or trim(notes) = '' then 'Geannuleerd: ' || left(v_reason, 500)
        else notes || E'\nGeannuleerd: ' || left(v_reason, 500)
      end,
      updated_at = now()
  where id = p_shift;
end;
$$;

revoke all on function public.upt_create_shift(uuid,uuid,text,timestamptz,timestamptz,boolean) from public, anon;
revoke all on function public.upt_update_shift(uuid,text,timestamptz,timestamptz,boolean) from public, anon;
revoke all on function public.upt_cancel_shift(uuid,text) from public, anon;
grant execute on function public.upt_create_shift(uuid,uuid,text,timestamptz,timestamptz,boolean) to authenticated;
grant execute on function public.upt_update_shift(uuid,text,timestamptz,timestamptz,boolean) to authenticated;
grant execute on function public.upt_cancel_shift(uuid,text) to authenticated;

drop policy if exists upt_event_visibility_window on public.events;
create policy upt_event_visibility_window
on public.events
as restrictive
for select
to authenticated
using (
  public.upt_is_admin()
  or (
    public.upt_is_responsible(id, null, (select auth.uid()))
    and now() <= end_at + interval '3 days'
  )
  or (
    now() >= start_at
    and now() <= end_at + interval '3 days'
  )
);

drop policy if exists upt_event_operational_window on public.briefings;
create policy upt_event_operational_window
on public.briefings
as restrictive
for select
to authenticated
using (
  public.upt_is_admin()
  or (
    public.upt_is_responsible(event_id, workplace_id, (select auth.uid()))
    and upt_private.event_operational(event_id)
  )
  or upt_private.event_active(event_id)
);

drop policy if exists upt_event_operational_window on public.personal_instructions;
create policy upt_event_operational_window
on public.personal_instructions
as restrictive
for select
to authenticated
using (
  public.upt_is_admin()
  or (
    workplace_id is not null
    and public.upt_is_responsible(event_id, workplace_id, (select auth.uid()))
    and upt_private.event_operational(event_id)
  )
  or upt_private.event_active(event_id)
);

drop policy if exists upt_event_operational_window on public.tasks;
create policy upt_event_operational_window
on public.tasks
as restrictive
for select
to authenticated
using (
  public.upt_is_admin()
  or (
    workplace_id is not null
    and public.upt_is_responsible(event_id, workplace_id, (select auth.uid()))
    and upt_private.event_operational(event_id)
  )
  or upt_private.event_active(event_id)
);

drop policy if exists upt_event_operational_window on public.task_assignments;
create policy upt_event_operational_window
on public.task_assignments
as restrictive
for select
to authenticated
using (
  public.upt_is_admin()
  or exists (
    select 1
    from public.tasks t
    where t.id = task_assignments.task_id
      and (
        (
          t.workplace_id is not null
          and public.upt_is_responsible(t.event_id, t.workplace_id, (select auth.uid()))
          and upt_private.event_operational(t.event_id)
        )
        or upt_private.event_active(t.event_id)
      )
  )
);

drop policy if exists work_attachments_read on public.work_attachments;
create policy work_attachments_read
on public.work_attachments
for select
to authenticated
using (
  public.upt_is_admin()
  or (
    briefing_id is not null
    and exists (
      select 1
      from public.briefings b
      where b.id = work_attachments.briefing_id
        and public.upt_can_access_workplace(b.event_id, b.workplace_id)
        and (
          (
            public.upt_is_responsible(b.event_id, b.workplace_id, (select auth.uid()))
            and upt_private.event_operational(b.event_id)
          )
          or upt_private.event_active(b.event_id)
        )
    )
  )
  or (
    personal_instruction_id is not null
    and exists (
      select 1
      from public.personal_instructions pi
      where pi.id = work_attachments.personal_instruction_id
        and (
          pi.user_id = (select auth.uid())
          or (
            pi.workplace_id is not null
            and public.upt_is_responsible(pi.event_id, pi.workplace_id, (select auth.uid()))
          )
        )
        and (
          (
            pi.workplace_id is not null
            and public.upt_is_responsible(pi.event_id, pi.workplace_id, (select auth.uid()))
            and upt_private.event_operational(pi.event_id)
          )
          or upt_private.event_active(pi.event_id)
        )
    )
  )
  or (
    task_id is not null
    and public.upt_can_read_task(task_id, (select auth.uid()))
    and exists (
      select 1
      from public.tasks t
      where t.id = work_attachments.task_id
        and (
          (
            t.workplace_id is not null
            and public.upt_is_responsible(t.event_id, t.workplace_id, (select auth.uid()))
            and upt_private.event_operational(t.event_id)
          )
          or upt_private.event_active(t.event_id)
        )
    )
  )
);
