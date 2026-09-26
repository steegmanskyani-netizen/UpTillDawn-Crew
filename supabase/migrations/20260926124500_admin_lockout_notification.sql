-- Notify the permanent app owner after an admin login lockout.

create or replace function upt_private.notify_admin_lockout()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'upt_private'
as $$
declare
  v_recipient uuid;
begin
  if new.event_type <> 'locked_after_failures' then
    return new;
  end if;

  select u.id
  into v_recipient
  from auth.users u
  where upt_private.is_app_owner(u.id)
  order by u.created_at
  limit 1;

  if v_recipient is null then
    return new;
  end if;

  insert into public.crew_notifications
    (user_id, title, body, link, read_at)
  values (
    v_recipient,
    'Admin-login tijdelijk geblokkeerd',
    left(
      concat(
        '3 mislukte admin-loginpogingen. Account: ', new.login_key,
        '. IP: ', coalesce(nullif(new.ip_address, ''), 'onbekend'),
        '. Locatie (benadering): ', coalesce(nullif(new.approximate_location, ''), 'onbekend'),
        '. Apparaat/browser: ', coalesce(nullif(new.user_agent, ''), 'onbekend'),
        '. Login gedurende 15 minuten geblokkeerd.'
      ),
      2000
    ),
    '/notifications',
    null
  );

  return new;
end;
$$;

revoke all on function upt_private.notify_admin_lockout()
from public, anon, authenticated;

drop trigger if exists admin_login_lockout_notification
on upt_private.admin_login_security_events;

create trigger admin_login_lockout_notification
after insert on upt_private.admin_login_security_events
for each row
when (new.event_type = 'locked_after_failures')
execute function upt_private.notify_admin_lockout();
