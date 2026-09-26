-- Responsible leads are elevated only from one hour before their assigned event
-- until the event ends. Outside that window they resolve to employee.
create or replace function public.upt_effective_role(uid uuid default auth.uid())
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select case
    when uid is null then null
    when exists (
      select 1 from public.profiles p
      where p.id = uid and p.approved = true and p.role = 'admin'
    ) then coalesce(
      (select m.active_role from public.admin_role_modes m where m.user_id = uid),
      'admin'
    )
    when exists (
      select 1 from public.profiles p
      where p.id = uid and p.approved = true
    ) and exists (
      select 1
      from public.responsible_assignments ra
      join public.events e on e.id = ra.event_id
      where ra.user_id = uid
        and now() >= e.start_at - interval '1 hour'
        and now() <= e.end_at
        and coalesce(e.status, '') <> 'archived'
    ) then 'responsible_lead'
    when exists (
      select 1 from public.profiles p
      where p.id = uid and p.approved = true
    ) then 'employee'
    else null
  end;
$$;
