-- Event-level responsible assignment controls workplace visibility and editing.

create or replace function upt_private.is_event_responsible(
  p_event uuid,
  p_uid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.event_members em
    join public.profiles p on p.id = em.user_id
    where em.event_id = p_event
      and em.user_id = p_uid
      and em.event_role = 'responsible_lead'
      and p.approved = true
      and p.role = 'responsible_lead'
  );
$$;

revoke all on function upt_private.is_event_responsible(uuid,uuid) from public, anon;
grant execute on function upt_private.is_event_responsible(uuid,uuid) to authenticated;

update public.event_members em
set event_role = 'responsible_lead'
from public.profiles p
where p.id = em.user_id
  and p.role = 'responsible_lead'
  and em.event_role <> 'responsible_lead';

insert into public.event_members(event_id,user_id,event_role)
select distinct ra.event_id,ra.user_id,'responsible_lead'
from public.responsible_assignments ra
join public.profiles p on p.id=ra.user_id
where p.approved=true and p.role='responsible_lead'
on conflict (event_id,user_id)
do update set event_role='responsible_lead';

drop policy if exists event_members_read on public.event_members;
create policy event_members_read
on public.event_members
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.upt_is_admin()
  or upt_private.is_event_responsible(event_id, (select auth.uid()))
  or public.upt_is_responsible(event_id, null, (select auth.uid()))
);

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
    or upt_private.is_event_responsible(event_id, (select auth.uid()))
    or exists (
      select 1
      from public.responsible_assignments ra
      where ra.event_id = event_availability.event_id
        and ra.user_id = (select auth.uid())
    )
  )
);

drop policy if exists workplaces_read on public.workplaces;
create policy workplaces_read
on public.workplaces
for select
to authenticated
using (
  public.upt_is_admin()
  or upt_private.is_event_responsible(event_id, (select auth.uid()))
  or public.upt_is_responsible(event_id, id, (select auth.uid()))
  or exists (
    select 1
    from public.shifts s
    where s.event_id = workplaces.event_id
      and s.workplace_id = workplaces.id
      and s.user_id = (select auth.uid())
      and s.status <> 'cancelled'
  )
);

drop policy if exists upt_event_operational_window on public.workplaces;
create policy upt_event_operational_window
on public.workplaces
as restrictive
for select
to authenticated
using (
  public.upt_is_admin()
  or (
    (
      upt_private.is_event_responsible(event_id, (select auth.uid()))
      or public.upt_is_responsible(event_id, id, (select auth.uid()))
    )
    and upt_private.event_operational(event_id)
  )
  or (
    upt_private.event_active(event_id)
    and exists (
      select 1
      from public.shifts s
      where s.event_id = workplaces.event_id
        and s.workplace_id = workplaces.id
        and s.user_id = (select auth.uid())
        and s.status <> 'cancelled'
    )
  )
);

drop policy if exists workplaces_admin_insert on public.workplaces;
drop policy if exists workplaces_manage_insert on public.workplaces;
create policy workplaces_manage_insert
on public.workplaces
for insert
to authenticated
with check (
  public.upt_is_admin()
  or (
    upt_private.is_event_responsible(event_id, (select auth.uid()))
    and upt_private.event_operational(event_id)
  )
);

drop policy if exists workplaces_admin_update on public.workplaces;
drop policy if exists workplaces_manage_update on public.workplaces;
create policy workplaces_manage_update
on public.workplaces
for update
to authenticated
using (
  public.upt_is_admin()
  or (
    upt_private.is_event_responsible(event_id, (select auth.uid()))
    and upt_private.event_operational(event_id)
  )
)
with check (
  public.upt_is_admin()
  or (
    upt_private.is_event_responsible(event_id, (select auth.uid()))
    and upt_private.event_operational(event_id)
  )
);
