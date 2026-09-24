-- A workplace Responsible must already be selected for the same event.

drop policy if exists responsible_admin_insert on public.responsible_assignments;
create policy responsible_admin_insert
on public.responsible_assignments
for insert
to authenticated
with check (
  public.upt_is_admin()
  and exists (
    select 1
    from public.event_members em
    join public.profiles p on p.id = em.user_id
    where em.event_id = responsible_assignments.event_id
      and em.user_id = responsible_assignments.user_id
      and em.event_role = 'responsible_lead'
      and p.approved = true
      and p.role = 'responsible_lead'
  )
);

drop policy if exists responsible_admin_update on public.responsible_assignments;
create policy responsible_admin_update
on public.responsible_assignments
for update
to authenticated
using (public.upt_is_admin())
with check (
  public.upt_is_admin()
  and exists (
    select 1
    from public.event_members em
    join public.profiles p on p.id = em.user_id
    where em.event_id = responsible_assignments.event_id
      and em.user_id = responsible_assignments.user_id
      and em.event_role = 'responsible_lead'
      and p.approved = true
      and p.role = 'responsible_lead'
  )
);
