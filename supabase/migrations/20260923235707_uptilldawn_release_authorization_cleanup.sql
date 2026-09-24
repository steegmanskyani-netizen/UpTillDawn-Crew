-- Final authorization cleanup for event-level Responsible setup and release visibility.
-- Responsible leads assigned to an event may prepare workplaces, instructions and tasks
-- before the event ends. Staff can read instructions before start, while tasks, shifts,
-- workplaces and incidents become operational only once the event starts.

create or replace function public.upt_can_access_workplace(p_event uuid, p_workplace uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.upt_is_approved()
    and (
      public.upt_is_admin()
      or (
        upt_private.event_operational(p_event)
        and (
          upt_private.is_event_responsible(p_event, auth.uid())
          or public.upt_is_responsible(p_event, p_workplace)
          or (
            p_workplace is null
            and exists (
              select 1
              from public.event_members m
              where m.event_id = p_event
                and m.user_id = auth.uid()
            )
          )
          or (
            p_workplace is not null
            and exists (
              select 1
              from public.shifts s
              where s.event_id = p_event
                and s.workplace_id = p_workplace
                and s.user_id = auth.uid()
                and s.status <> 'cancelled'
            )
          )
        )
      )
    );
$$;

create or replace function public.upt_can_manage_task(p_task uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task
      and (
        public.upt_is_admin(p_uid)
        or upt_private.is_event_responsible(t.event_id, p_uid)
        or (
          t.workplace_id is not null
          and public.upt_is_responsible(t.event_id, t.workplace_id, p_uid)
        )
      )
  );
$$;

create or replace function public.upt_can_read_task(p_task uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_uid and p.approved = true
  )
  and exists (
    select 1
    from public.tasks t
    where t.id = p_task
      and (
        public.upt_is_admin(p_uid)
        or upt_private.is_event_responsible(t.event_id, p_uid)
        or (
          t.workplace_id is not null
          and public.upt_is_responsible(t.event_id, t.workplace_id, p_uid)
        )
        or exists (
          select 1
          from public.task_assignments ta
          where ta.task_id = t.id
            and ta.user_id = p_uid
        )
      )
  );
$$;

create or replace function public.upt_responsible_event_members(p_event uuid, p_workplace uuid)
returns table(id uuid, full_name text, phone_number text, profile_photo_url text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.upt_is_approved() then
    raise exception 'ACCOUNT NOT APPROVED';
  end if;

  if p_workplace is not null and not exists (
    select 1 from public.workplaces w
    where w.id = p_workplace
      and w.event_id = p_event
  ) then
    raise exception 'Werkplek niet gevonden.';
  end if;

  if not (
    public.upt_is_admin(auth.uid())
    or upt_private.is_event_responsible(p_event, auth.uid())
    or (
      p_workplace is not null
      and public.upt_is_responsible(p_event, p_workplace, auth.uid())
    )
  ) then
    raise exception 'Geen toegang.';
  end if;

  return query
  select distinct p.id, p.full_name, p.phone_number, p.profile_photo_url
  from public.profiles p
  join public.event_members em on em.user_id = p.id
  where em.event_id = p_event
    and p.approved = true
  order by p.full_name nulls last, p.id;
end;
$$;

create or replace function public.upt_create_assigned_task(
  p_event uuid,
  p_workplace uuid,
  p_user uuid,
  p_title text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task uuid;
  v_admin boolean := public.upt_is_admin();
begin
  if not public.upt_is_approved() then
    raise exception 'ACCOUNT NOT APPROVED';
  end if;

  if not (
    v_admin
    or upt_private.is_event_responsible(p_event, auth.uid())
    or (
      p_workplace is not null
      and public.upt_is_responsible(p_event, p_workplace, auth.uid())
    )
  ) then
    raise exception 'Not authorized';
  end if;

  if not v_admin and not upt_private.event_operational(p_event) then
    raise exception 'Evenement is niet meer operationeel.';
  end if;

  if p_workplace is not null and not exists (
    select 1 from public.workplaces w
    where w.id = p_workplace
      and w.event_id = p_event
      and w.is_active = true
  ) then
    raise exception 'Werkplek hoort niet bij dit evenement.';
  end if;

  if p_title is null
     or length(trim(p_title)) not between 1 and 200
     or length(coalesce(p_description,'')) > 4000
  then
    raise exception 'Invalid task';
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.event_members m on m.user_id = p.id
    where p.id = p_user
      and p.approved
      and m.event_id = p_event
  ) then
    raise exception 'Approved event member required';
  end if;

  insert into public.tasks(event_id, workplace_id, title, description, created_by)
  values(p_event, p_workplace, trim(p_title), p_description, auth.uid())
  returning id into v_task;

  perform public.upt_assign_task(v_task, p_user);
  return v_task;
end;
$$;

create or replace function public.upt_assign_task(p_task uuid, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.tasks%rowtype;
  v_assignment uuid;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_task from public.tasks where id = p_task;
  if not found then raise exception 'Task not found'; end if;

  if not (
    public.upt_is_admin(auth.uid())
    or upt_private.is_event_responsible(v_task.event_id, auth.uid())
    or (
      v_task.workplace_id is not null
      and public.upt_is_responsible(v_task.event_id, v_task.workplace_id, auth.uid())
    )
  ) then
    raise exception 'Not authorized to assign this task';
  end if;

  if not public.upt_is_admin(auth.uid())
     and not upt_private.event_operational(v_task.event_id)
  then
    raise exception 'Evenement is niet meer operationeel.';
  end if;

  if not exists (
    select 1
    from public.event_members em
    join public.profiles p on p.id = em.user_id
    where em.event_id = v_task.event_id
      and em.user_id = p_user
      and p.approved = true
  ) then
    raise exception 'User is not an approved member of this event';
  end if;

  insert into public.task_assignments(task_id,user_id,assigned_by,status)
  values(p_task,p_user,auth.uid(),'NOT STARTED')
  on conflict (task_id,user_id) do nothing
  returning id into v_assignment;

  if v_assignment is null then
    select id into v_assignment
    from public.task_assignments
    where task_id=p_task and user_id=p_user;
  end if;

  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),'TASK_ASSIGNED','task_assignment',v_assignment,
    jsonb_build_object('task_id',p_task,'user_id',p_user)
  );

  return v_assignment;
end;
$$;

create or replace function public.upt_remove_task_assignment(p_assignment uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.task_assignments%rowtype;
  v_task public.tasks%rowtype;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_assignment
  from public.task_assignments
  where id = p_assignment
  for update;

  if not found then raise exception 'Task assignment not found'; end if;

  select * into v_task from public.tasks where id=v_assignment.task_id;

  if not (
    public.upt_is_admin(auth.uid())
    or upt_private.is_event_responsible(v_task.event_id, auth.uid())
    or (
      v_task.workplace_id is not null
      and public.upt_is_responsible(v_task.event_id,v_task.workplace_id,auth.uid())
    )
  ) then
    raise exception 'Not authorized to remove this assignment';
  end if;

  if not public.upt_is_admin(auth.uid())
     and not upt_private.event_operational(v_task.event_id)
  then
    raise exception 'Evenement is niet meer operationeel.';
  end if;

  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),'TASK_ASSIGNMENT_REMOVED','task_assignment',p_assignment,
    jsonb_build_object('task_id',v_assignment.task_id,'user_id',v_assignment.user_id,'status',v_assignment.status)
  );

  delete from public.task_assignments where id=p_assignment;
end;
$$;

drop policy if exists briefing_manage_insert on public.briefings;
create policy briefing_manage_insert on public.briefings
for insert to authenticated
with check (
  public.upt_is_admin()
  or (
    upt_private.event_operational(event_id)
    and (
      upt_private.is_event_responsible(event_id, (select auth.uid()))
      or (workplace_id is not null and public.upt_is_responsible(event_id, workplace_id))
    )
  )
);

drop policy if exists briefing_manage_update on public.briefings;
create policy briefing_manage_update on public.briefings
for update to authenticated
using (
  public.upt_is_admin()
  or (
    upt_private.event_operational(event_id)
    and (
      upt_private.is_event_responsible(event_id, (select auth.uid()))
      or (workplace_id is not null and public.upt_is_responsible(event_id, workplace_id))
    )
  )
)
with check (
  public.upt_is_admin()
  or (
    upt_private.event_operational(event_id)
    and (
      upt_private.is_event_responsible(event_id, (select auth.uid()))
      or (workplace_id is not null and public.upt_is_responsible(event_id, workplace_id))
    )
  )
);

drop policy if exists briefing_manage_delete on public.briefings;
create policy briefing_manage_delete on public.briefings
for delete to authenticated
using (
  public.upt_is_admin()
  or (
    upt_private.event_operational(event_id)
    and (
      upt_private.is_event_responsible(event_id, (select auth.uid()))
      or (workplace_id is not null and public.upt_is_responsible(event_id, workplace_id))
    )
  )
);

drop policy if exists personal_instructions_read on public.personal_instructions;
create policy personal_instructions_read on public.personal_instructions
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.upt_is_admin((select auth.uid()))
  or upt_private.is_event_responsible(event_id, (select auth.uid()))
  or (
    workplace_id is not null
    and public.upt_is_responsible(event_id, workplace_id, (select auth.uid()))
  )
);

drop policy if exists personal_instructions_manage_insert on public.personal_instructions;
create policy personal_instructions_manage_insert on public.personal_instructions
for insert to authenticated
with check (
  public.upt_is_admin((select auth.uid()))
  or (
    upt_private.event_operational(event_id)
    and (
      upt_private.is_event_responsible(event_id, (select auth.uid()))
      or (
        workplace_id is not null
        and public.upt_is_responsible(event_id, workplace_id, (select auth.uid()))
      )
    )
    and exists (
      select 1 from public.event_members em
      where em.event_id=personal_instructions.event_id
        and em.user_id=personal_instructions.user_id
    )
    and (
      workplace_id is null
      or exists (
        select 1 from public.workplaces w
        where w.id=personal_instructions.workplace_id
          and w.event_id=personal_instructions.event_id
      )
    )
  )
);

drop policy if exists personal_instructions_manage_update on public.personal_instructions;
create policy personal_instructions_manage_update on public.personal_instructions
for update to authenticated
using (
  public.upt_is_admin((select auth.uid()))
  or (
    upt_private.event_operational(event_id)
    and (
      upt_private.is_event_responsible(event_id, (select auth.uid()))
      or (
        workplace_id is not null
        and public.upt_is_responsible(event_id, workplace_id, (select auth.uid()))
      )
    )
  )
)
with check (
  public.upt_is_admin((select auth.uid()))
  or (
    upt_private.event_operational(event_id)
    and (
      upt_private.is_event_responsible(event_id, (select auth.uid()))
      or (
        workplace_id is not null
        and public.upt_is_responsible(event_id, workplace_id, (select auth.uid()))
      )
    )
    and exists (
      select 1 from public.event_members em
      where em.event_id=personal_instructions.event_id
        and em.user_id=personal_instructions.user_id
    )
    and (
      workplace_id is null
      or exists (
        select 1 from public.workplaces w
        where w.id=personal_instructions.workplace_id
          and w.event_id=personal_instructions.event_id
      )
    )
  )
);

drop policy if exists personal_instructions_manage_delete on public.personal_instructions;
create policy personal_instructions_manage_delete on public.personal_instructions
for delete to authenticated
using (
  public.upt_is_admin((select auth.uid()))
  or (
    upt_private.event_operational(event_id)
    and (
      upt_private.is_event_responsible(event_id, (select auth.uid()))
      or (
        workplace_id is not null
        and public.upt_is_responsible(event_id, workplace_id, (select auth.uid()))
      )
    )
  )
);

drop policy if exists tasks_manage_insert on public.tasks;
create policy tasks_manage_insert on public.tasks
for insert to authenticated
with check (
  public.upt_is_admin()
  or (
    upt_private.event_operational(event_id)
    and (
      upt_private.is_event_responsible(event_id, (select auth.uid()))
      or (workplace_id is not null and public.upt_is_responsible(event_id, workplace_id))
    )
  )
);

drop policy if exists tasks_manage_update on public.tasks;
create policy tasks_manage_update on public.tasks
for update to authenticated
using (
  public.upt_is_admin()
  or (
    upt_private.event_operational(event_id)
    and (
      upt_private.is_event_responsible(event_id, (select auth.uid()))
      or (workplace_id is not null and public.upt_is_responsible(event_id, workplace_id))
    )
  )
)
with check (
  public.upt_is_admin()
  or (
    upt_private.event_operational(event_id)
    and (
      upt_private.is_event_responsible(event_id, (select auth.uid()))
      or (workplace_id is not null and public.upt_is_responsible(event_id, workplace_id))
    )
  )
);

drop policy if exists tasks_manage_delete on public.tasks;
create policy tasks_manage_delete on public.tasks
for delete to authenticated
using (
  public.upt_is_admin()
  or (
    upt_private.event_operational(event_id)
    and (
      upt_private.is_event_responsible(event_id, (select auth.uid()))
      or (workplace_id is not null and public.upt_is_responsible(event_id, workplace_id))
    )
  )
);

drop policy if exists upt_event_operational_window on public.tasks;
create policy upt_event_operational_window on public.tasks
as restrictive for select to authenticated
using (
  public.upt_is_admin()
  or (
    (
      upt_private.is_event_responsible(event_id, (select auth.uid()))
      or (
        workplace_id is not null
        and public.upt_is_responsible(event_id, workplace_id, (select auth.uid()))
      )
    )
    and upt_private.event_operational(event_id)
  )
  or upt_private.event_active(event_id)
);

drop policy if exists upt_event_operational_window on public.task_assignments;
create policy upt_event_operational_window on public.task_assignments
as restrictive for select to authenticated
using (
  public.upt_is_admin()
  or exists (
    select 1 from public.tasks t
    where t.id=task_assignments.task_id
      and (
        (
          (
            upt_private.is_event_responsible(t.event_id, (select auth.uid()))
            or (
              t.workplace_id is not null
              and public.upt_is_responsible(t.event_id,t.workplace_id,(select auth.uid()))
            )
          )
          and upt_private.event_operational(t.event_id)
        )
        or upt_private.event_active(t.event_id)
      )
  )
);

drop policy if exists upt_event_operational_window on public.shifts;
create policy upt_event_operational_window on public.shifts
as restrictive for select to authenticated
using (
  public.upt_is_admin()
  or (
    (
      upt_private.is_event_responsible(event_id, (select auth.uid()))
      or public.upt_is_responsible(event_id, workplace_id, (select auth.uid()))
      or user_id = (select auth.uid())
    )
    and upt_private.event_active(event_id)
  )
);

drop policy if exists work_attachments_read on public.work_attachments;
create policy work_attachments_read on public.work_attachments
for select to authenticated
using (
  public.upt_is_admin()
  or (
    briefing_id is not null
    and exists (
      select 1 from public.briefings b
      where b.id=work_attachments.briefing_id
        and public.upt_can_access_workplace(b.event_id,b.workplace_id)
    )
  )
  or (
    personal_instruction_id is not null
    and exists (
      select 1 from public.personal_instructions pi
      where pi.id=work_attachments.personal_instruction_id
        and (
          pi.user_id=(select auth.uid())
          or upt_private.is_event_responsible(pi.event_id,(select auth.uid()))
          or (
            pi.workplace_id is not null
            and public.upt_is_responsible(pi.event_id,pi.workplace_id,(select auth.uid()))
          )
        )
        and upt_private.event_operational(pi.event_id)
    )
  )
  or (
    task_id is not null
    and public.upt_can_read_task(task_id,(select auth.uid()))
    and exists (
      select 1 from public.tasks t
      where t.id=work_attachments.task_id
        and (
          (
            (
              upt_private.is_event_responsible(t.event_id,(select auth.uid()))
              or (
                t.workplace_id is not null
                and public.upt_is_responsible(t.event_id,t.workplace_id,(select auth.uid()))
              )
            )
            and upt_private.event_operational(t.event_id)
          )
          or upt_private.event_active(t.event_id)
        )
    )
  )
);

drop policy if exists work_attachments_insert on public.work_attachments;
create policy work_attachments_insert on public.work_attachments
for insert to authenticated
with check (
  uploaded_by=(select auth.uid())
  and split_part(storage_path,'/',1)=(select auth.uid())::text
  and (
    public.upt_is_admin()
    or (
      briefing_id is not null
      and exists (
        select 1 from public.briefings b
        where b.id=work_attachments.briefing_id
          and upt_private.event_operational(b.event_id)
          and (
            upt_private.is_event_responsible(b.event_id,(select auth.uid()))
            or (
              b.workplace_id is not null
              and public.upt_is_responsible(b.event_id,b.workplace_id,(select auth.uid()))
            )
          )
      )
    )
    or (
      personal_instruction_id is not null
      and exists (
        select 1 from public.personal_instructions pi
        where pi.id=work_attachments.personal_instruction_id
          and upt_private.event_operational(pi.event_id)
          and (
            upt_private.is_event_responsible(pi.event_id,(select auth.uid()))
            or (
              pi.workplace_id is not null
              and public.upt_is_responsible(pi.event_id,pi.workplace_id,(select auth.uid()))
            )
          )
      )
    )
    or (
      task_id is not null
      and public.upt_can_manage_task(task_id,(select auth.uid()))
    )
  )
);

drop policy if exists work_attachments_delete on public.work_attachments;
create policy work_attachments_delete on public.work_attachments
for delete to authenticated
using (
  uploaded_by=(select auth.uid())
  or public.upt_is_admin()
  or (
    briefing_id is not null
    and exists (
      select 1 from public.briefings b
      where b.id=work_attachments.briefing_id
        and (
          upt_private.is_event_responsible(b.event_id,(select auth.uid()))
          or (
            b.workplace_id is not null
            and public.upt_is_responsible(b.event_id,b.workplace_id,(select auth.uid()))
          )
        )
    )
  )
  or (
    personal_instruction_id is not null
    and exists (
      select 1 from public.personal_instructions pi
      where pi.id=work_attachments.personal_instruction_id
        and (
          upt_private.is_event_responsible(pi.event_id,(select auth.uid()))
          or (
            pi.workplace_id is not null
            and public.upt_is_responsible(pi.event_id,pi.workplace_id,(select auth.uid()))
          )
        )
    )
  )
  or (
    task_id is not null
    and public.upt_can_manage_task(task_id,(select auth.uid()))
  )
);

revoke all on function public.upt_can_access_workplace(uuid,uuid) from public, anon;
revoke all on function public.upt_can_manage_task(uuid,uuid) from public, anon;
revoke all on function public.upt_can_read_task(uuid,uuid) from public, anon;
revoke all on function public.upt_responsible_event_members(uuid,uuid) from public, anon;
revoke all on function public.upt_create_assigned_task(uuid,uuid,uuid,text,text) from public, anon;
revoke all on function public.upt_assign_task(uuid,uuid) from public, anon;
revoke all on function public.upt_remove_task_assignment(uuid) from public, anon;

grant execute on function public.upt_can_access_workplace(uuid,uuid) to authenticated;
grant execute on function public.upt_can_manage_task(uuid,uuid) to authenticated;
grant execute on function public.upt_can_read_task(uuid,uuid) to authenticated;
grant execute on function public.upt_responsible_event_members(uuid,uuid) to authenticated;
grant execute on function public.upt_create_assigned_task(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.upt_assign_task(uuid,uuid) to authenticated;
grant execute on function public.upt_remove_task_assignment(uuid) to authenticated;
