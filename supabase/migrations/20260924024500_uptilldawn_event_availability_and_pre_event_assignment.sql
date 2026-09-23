-- Future event availability, pre-event staff selection, and manager assignment support.

create table if not exists public.event_availability (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response text not null check (response in ('can','cannot')),
  responded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.event_availability enable row level security;
grant select, insert, update on public.event_availability to authenticated;

drop policy if exists event_availability_read on public.event_availability;
create policy event_availability_read
on public.event_availability
for select
to authenticated
using (
  public.upt_is_approved()
  and (
    user_id = (select auth.uid())
    or public.upt_is_admin((select auth.uid()))
    or exists (
      select 1
      from public.responsible_assignments ra
      where ra.event_id = event_availability.event_id
        and ra.user_id = (select auth.uid())
    )
  )
);

drop policy if exists event_availability_insert on public.event_availability;
create policy event_availability_insert
on public.event_availability
for insert
to authenticated
with check (
  public.upt_is_approved()
  and user_id = (select auth.uid())
  and exists (
    select 1
    from public.events e
    where e.id = event_availability.event_id
      and now() < e.start_at
      and e.status <> 'archived'
  )
);

drop policy if exists event_availability_update on public.event_availability;
create policy event_availability_update
on public.event_availability
for update
to authenticated
using (
  public.upt_is_approved()
  and user_id = (select auth.uid())
)
with check (
  public.upt_is_approved()
  and user_id = (select auth.uid())
  and exists (
    select 1
    from public.events e
    where e.id = event_availability.event_id
      and now() < e.start_at
      and e.status <> 'archived'
  )
);

drop policy if exists events_read on public.events;
create policy events_read
on public.events
for select
to authenticated
using (
  public.upt_is_admin()
  or (
    now() < start_at
    and status <> 'archived'
  )
  or public.upt_is_responsible(id, null, (select auth.uid()))
  or exists (
    select 1
    from public.event_members em
    where em.event_id = events.id
      and em.user_id = (select auth.uid())
  )
);

drop policy if exists upt_event_visibility_window on public.events;
create policy upt_event_visibility_window
on public.events
as restrictive
for select
to authenticated
using (
  public.upt_is_admin()
  or (
    now() < start_at
    and status <> 'archived'
  )
  or (
    (
      public.upt_is_responsible(id, null, (select auth.uid()))
      or exists (
        select 1
        from public.event_members em
        where em.event_id = events.id
          and em.user_id = (select auth.uid())
      )
    )
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
  or upt_private.event_operational(event_id)
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
  or upt_private.event_operational(event_id)
);

drop policy if exists upt_event_operational_window on public.shifts;
create policy upt_event_operational_window
on public.shifts
as restrictive
for select
to authenticated
using (
  public.upt_is_admin()
  or (
    public.upt_is_responsible(event_id, workplace_id, (select auth.uid()))
    and upt_private.event_operational(event_id)
  )
  or (
    user_id = (select auth.uid())
    and upt_private.event_active(event_id)
  )
);

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

  if not exists (
    select 1
    from public.workplaces w
    where w.id = p_workplace
      and w.event_id = p_event
  ) then
    raise exception 'Werkplek niet gevonden.';
  end if;

  if not (
    public.upt_is_admin(auth.uid())
    or public.upt_is_responsible(p_event, p_workplace, auth.uid())
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

revoke all on function public.upt_responsible_event_members(uuid, uuid) from public, anon;
grant execute on function public.upt_responsible_event_members(uuid, uuid) to authenticated;

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
begin
  if not public.upt_is_approved()
     or not (
       public.upt_is_admin()
       or (
         p_workplace is not null
         and public.upt_is_responsible(p_event, p_workplace)
       )
     )
  then
    raise exception 'Not authorized';
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

revoke all on function public.upt_create_assigned_task(uuid,uuid,uuid,text,text) from public, anon;
grant execute on function public.upt_create_assigned_task(uuid,uuid,uuid,text,text) to authenticated;
