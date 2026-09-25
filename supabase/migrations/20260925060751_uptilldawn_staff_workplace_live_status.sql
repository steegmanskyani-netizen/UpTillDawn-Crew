update public.role_ui_rules
set visible=true,
    enabled=true,
    condition_key='assigned_event',
    updated_at=now()
where role='staff' and feature_key='workplaces';

create or replace function public.upt_staff_workplace_live_status()
returns table(
  session_id uuid,
  user_id uuid,
  full_name text,
  workplace_id uuid,
  workplace_name text,
  status text
)
language sql
stable
security definer
set search_path = 'pg_catalog','public','upt_private'
as $$
  with own_workplaces as (
    select distinct s.event_id,s.workplace_id
    from public.shifts s
    join public.events e on e.id=s.event_id
    where s.user_id=auth.uid()
      and coalesce(s.status,'')<>'cancelled'
      and e.status<>'archived'
      and now() between e.start_at and e.end_at
  )
  select distinct
    ws.id as session_id,
    ws.user_id,
    p.full_name,
    cs.workplace_id,
    w.name as workplace_name,
    case
      when exists(
        select 1
        from public.break_sessions bs
        where bs.work_session_id=ws.id
          and bs.ended_at is null
      ) then 'PAUZE'
      else 'WERKT'
    end as status
  from own_workplaces ow
  join public.shifts cs
    on cs.event_id=ow.event_id
   and cs.workplace_id=ow.workplace_id
   and coalesce(cs.status,'')<>'cancelled'
  join public.work_sessions ws
    on ws.shift_id=cs.id
   and ws.ended_at is null
  join public.profiles p
    on p.id=ws.user_id
   and p.approved=true
  join public.workplaces w
    on w.id=cs.workplace_id
  where auth.uid() is not null
    and public.upt_is_approved()
    and public.upt_effective_role(auth.uid())='staff'
    and ws.user_id<>auth.uid()
  order by w.name,p.full_name,ws.id;
$$;

revoke all on function public.upt_staff_workplace_live_status() from public;
revoke all on function public.upt_staff_workplace_live_status() from anon;
grant execute on function public.upt_staff_workplace_live_status() to authenticated;
