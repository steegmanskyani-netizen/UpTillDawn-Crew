create or replace function upt_private.deliver_push_notification()
returns trigger
language plpgsql
security definer
set search_path='pg_catalog','public','upt_private','net'
as $$
declare
  v_secret text;
begin
  select webhook_secret into v_secret
  from upt_private.push_delivery_config
  where singleton=true;

  if v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://eakoavcieossazqzplke.supabase.co/functions/v1/push-notification',
    body := jsonb_build_object('notification_id',new.id),
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-upt-push-secret',v_secret
    ),
    timeout_milliseconds := 10000
  );

  return new;
exception when others then
  raise warning 'Push dispatch enqueue failed for notification %: %',new.id,sqlerrm;
  return new;
end;
$$;

revoke all on function upt_private.deliver_push_notification()
from public, anon, authenticated;
