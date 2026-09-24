create or replace function public.upt_can_read_channel(p_channel uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
  select public.upt_is_approved()
    and exists(
      select 1
      from public.chat_channels c
      where c.id=p_channel
        and public.upt_feature_visible(
          'chat',
          c.event_id,
          case when c.kind='workplace' then c.workplace_id else null end
        )
        and (
          c.kind='organization'
          or (
            c.kind='event'
            and c.event_id is not null
            and exists(
              select 1
              from public.events e
              where e.id=c.event_id
                and e.status<>'archived'
                and now()>=e.start_at
                and now()<=e.end_at+interval '3 days'
            )
            and (
              public.upt_is_admin()
              or exists(
                select 1
                from public.event_members em
                where em.event_id=c.event_id
                  and em.user_id=auth.uid()
              )
            )
          )
          or (
            c.kind='workplace'
            and c.event_id is not null
            and c.workplace_id is not null
            and exists(
              select 1
              from public.events e
              where e.id=c.event_id
                and e.status<>'archived'
                and now()>=e.start_at
                and now()<=e.end_at+interval '3 days'
            )
            and (
              public.upt_is_admin()
              or public.upt_is_responsible(c.event_id,c.workplace_id,auth.uid())
              or exists(
                select 1
                from public.shifts s
                where s.event_id=c.event_id
                  and s.workplace_id=c.workplace_id
                  and s.user_id=auth.uid()
                  and coalesce(s.status,'')<>'cancelled'
              )
            )
          )
        )
    );
$$;

create or replace function public.upt_can_manage_task(p_task uuid,p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
  select exists(
    select 1
    from public.tasks t
    where t.id=p_task
      and (
        public.upt_is_admin(p_uid)
        or (
          t.workplace_id is not null
          and public.upt_is_responsible(t.event_id,t.workplace_id,p_uid)
        )
      )
  );
$$;

create or replace function public.upt_can_read_task(p_task uuid,p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
  select exists(select 1 from public.profiles p where p.id=p_uid and p.approved=true)
  and exists(
    select 1
    from public.tasks t
    where t.id=p_task
      and (
        public.upt_is_admin(p_uid)
        or (t.workplace_id is not null and public.upt_is_responsible(t.event_id,t.workplace_id,p_uid))
        or exists(select 1 from public.task_assignments ta where ta.task_id=t.id and ta.user_id=p_uid)
      )
  );
$$;

create or replace function public.upt_responsible_event_members(p_event uuid,p_workplace uuid)
returns table(id uuid,full_name text,phone_number text,profile_photo_url text)
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;

  if p_workplace is not null then
    if not exists(select 1 from public.workplaces w where w.id=p_workplace and w.event_id=p_event) then
      raise exception 'Werkplek niet gevonden.';
    end if;
    if not (public.upt_is_admin(auth.uid()) or public.upt_is_responsible(p_event,p_workplace,auth.uid())) then
      raise exception 'Geen toegang.';
    end if;
    return query
    select distinct p.id,p.full_name,p.phone_number,p.profile_photo_url
    from public.profiles p
    join public.event_members em on em.user_id=p.id and em.event_id=p_event
    join public.shifts s on s.user_id=p.id and s.event_id=p_event and s.workplace_id=p_workplace and coalesce(s.status,'')<>'cancelled'
    where p.approved=true
    order by p.full_name nulls last,p.id;
  else
    if not (public.upt_is_admin(auth.uid()) or upt_private.is_event_responsible(p_event,auth.uid())) then
      raise exception 'Geen toegang.';
    end if;
    return query
    select distinct p.id,p.full_name,p.phone_number,p.profile_photo_url
    from public.profiles p
    join public.event_members em on em.user_id=p.id
    where em.event_id=p_event and p.approved=true
    order by p.full_name nulls last,p.id;
  end if;
end;
$$;

create or replace function public.upt_create_assigned_task(p_event uuid,p_workplace uuid,p_user uuid,p_title text,p_description text)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_task uuid;
  v_admin boolean:=public.upt_is_admin();
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;

  if not (
    v_admin
    or (p_workplace is not null and public.upt_is_responsible(p_event,p_workplace,auth.uid()))
  ) then
    raise exception 'Verantwoordelijken kunnen alleen taken beheren binnen hun toegewezen werkplek.';
  end if;

  if not v_admin and not upt_private.event_operational(p_event) then raise exception 'Evenement is niet meer operationeel.'; end if;
  if not v_admin and not public.upt_feature_allowed('tasks',p_event,p_workplace) then raise exception 'Taken zijn op dit moment niet beschikbaar.'; end if;

  if p_workplace is not null and not exists(
    select 1 from public.workplaces w where w.id=p_workplace and w.event_id=p_event and w.is_active=true
  ) then raise exception 'Werkplek hoort niet bij dit evenement.'; end if;

  if p_title is null or length(trim(p_title)) not between 1 and 200 or length(coalesce(p_description,''))>4000 then
    raise exception 'Invalid task';
  end if;

  if not exists(
    select 1 from public.profiles p
    join public.event_members m on m.user_id=p.id
    where p.id=p_user and p.approved and m.event_id=p_event
  ) then raise exception 'Approved event member required'; end if;

  if not v_admin and not exists(
    select 1 from public.shifts s
    where s.user_id=p_user and s.event_id=p_event and s.workplace_id=p_workplace and coalesce(s.status,'')<>'cancelled'
  ) then raise exception 'Selecteer alleen personeel dat aan jouw werkplek is toegewezen.'; end if;

  insert into public.tasks(event_id,workplace_id,title,description,created_by)
  values(p_event,p_workplace,trim(p_title),p_description,auth.uid())
  returning id into v_task;

  perform public.upt_assign_task(v_task,p_user);
  return v_task;
end;
$$;

create or replace function public.upt_assign_task(p_task uuid,p_user uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_task public.tasks%rowtype;
  v_assignment uuid;
  v_admin boolean:=public.upt_is_admin();
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into v_task from public.tasks where id=p_task;
  if not found then raise exception 'Task not found'; end if;

  if not (
    v_admin
    or (v_task.workplace_id is not null and public.upt_is_responsible(v_task.event_id,v_task.workplace_id,auth.uid()))
  ) then
    raise exception 'Verantwoordelijken kunnen alleen taken beheren binnen hun toegewezen werkplek.';
  end if;

  if not v_admin and not upt_private.event_operational(v_task.event_id) then raise exception 'Evenement is niet meer operationeel.'; end if;
  if not v_admin and not public.upt_feature_allowed('tasks',v_task.event_id,v_task.workplace_id) then raise exception 'Taken zijn op dit moment niet beschikbaar.'; end if;

  if not exists(
    select 1 from public.event_members em
    join public.profiles p on p.id=em.user_id
    where em.event_id=v_task.event_id and em.user_id=p_user and p.approved=true
  ) then raise exception 'User is not an approved member of this event'; end if;

  if not v_admin and not exists(
    select 1 from public.shifts s
    where s.user_id=p_user and s.event_id=v_task.event_id and s.workplace_id=v_task.workplace_id and coalesce(s.status,'')<>'cancelled'
  ) then raise exception 'Selecteer alleen personeel dat aan jouw werkplek is toegewezen.'; end if;

  insert into public.task_assignments(task_id,user_id,assigned_by,status)
  values(p_task,p_user,auth.uid(),'NOT STARTED')
  on conflict(task_id,user_id) do nothing
  returning id into v_assignment;

  if v_assignment is null then
    select id into v_assignment from public.task_assignments where task_id=p_task and user_id=p_user;
  end if;

  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'TASK_ASSIGNED','task_assignment',v_assignment,jsonb_build_object('task_id',p_task,'user_id',p_user,'workplace_id',v_task.workplace_id));

  return v_assignment;
end;
$$;

drop policy if exists tasks_manage_insert on public.tasks;
create policy tasks_manage_insert on public.tasks for insert to authenticated
with check (
  public.upt_is_admin()
  or (workplace_id is not null and upt_private.event_operational(event_id) and public.upt_is_responsible(event_id,workplace_id,(select auth.uid())))
);

drop policy if exists tasks_manage_update on public.tasks;
create policy tasks_manage_update on public.tasks for update to authenticated
using (
  public.upt_is_admin()
  or (workplace_id is not null and upt_private.event_operational(event_id) and public.upt_is_responsible(event_id,workplace_id,(select auth.uid())))
)
with check (
  public.upt_is_admin()
  or (workplace_id is not null and upt_private.event_operational(event_id) and public.upt_is_responsible(event_id,workplace_id,(select auth.uid())))
);

drop policy if exists tasks_manage_delete on public.tasks;
create policy tasks_manage_delete on public.tasks for delete to authenticated
using (
  public.upt_is_admin()
  or (workplace_id is not null and upt_private.event_operational(event_id) and public.upt_is_responsible(event_id,workplace_id,(select auth.uid())))
);

notify pgrst,'reload schema';
