-- Incidents can only be created while the related event is active.

create or replace function upt_private.require_active_event_for_operation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event uuid;
begin
  if tg_table_name in ('work_sessions','check_ins','incidents') then
    v_event := new.event_id;
  else
    return new;
  end if;

  if v_event is not null and not upt_private.event_active(v_event) then
    raise exception 'Deze actie is pas beschikbaar vanaf de start van het evenement.';
  end if;

  return new;
end;
$$;

revoke all on function upt_private.require_active_event_for_operation() from public, anon, authenticated;

drop trigger if exists upt_require_active_event_for_incident on public.incidents;
create trigger upt_require_active_event_for_incident
before insert on public.incidents
for each row
execute function upt_private.require_active_event_for_operation();
