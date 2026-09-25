create extension if not exists pg_net;

create table if not exists public.push_subscriptions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_endpoint_length check (char_length(endpoint) between 20 and 4096),
  constraint push_p256dh_length check (char_length(p256dh) between 20 and 512),
  constraint push_auth_length check (char_length(auth_key) between 8 and 256)
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id) where enabled=true;
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant all on public.push_subscriptions to service_role;

create table if not exists upt_private.push_delivery_config(
  singleton boolean primary key default true check(singleton),
  vapid_public_key text not null,
  vapid_private_key text not null,
  webhook_secret text not null,
  updated_at timestamptz not null default now()
);
revoke all on upt_private.push_delivery_config from public, anon, authenticated;

create or replace function public.upt_push_public_key()
returns text
language sql stable security definer
set search_path='pg_catalog','public','upt_private'
as $$
  select case when public.upt_is_approved()
    then (select vapid_public_key from upt_private.push_delivery_config where singleton=true)
    else null end;
$$;
revoke all on function public.upt_push_public_key() from public, anon;
grant execute on function public.upt_push_public_key() to authenticated;

create or replace function public.upt_save_push_subscription(
  p_endpoint text,p_p256dh text,p_auth text,p_user_agent text default null
)
returns uuid
language plpgsql security definer
set search_path='pg_catalog','public'
as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if v_user is null or not public.upt_is_approved() then raise exception 'Aanmelden vereist.'; end if;
  if char_length(coalesce(p_endpoint,'')) not between 20 and 4096
    or char_length(coalesce(p_p256dh,'')) not between 20 and 512
    or char_length(coalesce(p_auth,'')) not between 8 and 256 then
    raise exception 'Ongeldige push-subscriptie.';
  end if;
  insert into public.push_subscriptions(user_id,endpoint,p256dh,auth_key,user_agent,enabled,updated_at)
  values(v_user,p_endpoint,p_p256dh,p_auth,left(nullif(p_user_agent,''),500),true,now())
  on conflict(endpoint) do update
  set user_id=excluded.user_id,p256dh=excluded.p256dh,auth_key=excluded.auth_key,
      user_agent=excluded.user_agent,enabled=true,updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.upt_save_push_subscription(text,text,text,text) from public, anon;
grant execute on function public.upt_save_push_subscription(text,text,text,text) to authenticated;

create or replace function public.upt_remove_push_subscription(p_endpoint text)
returns void
language plpgsql security definer
set search_path='pg_catalog','public'
as $$
begin
  if auth.uid() is null then raise exception 'Aanmelden vereist.'; end if;
  delete from public.push_subscriptions where user_id=auth.uid() and endpoint=p_endpoint;
end;
$$;
revoke all on function public.upt_remove_push_subscription(text) from public, anon;
grant execute on function public.upt_remove_push_subscription(text) to authenticated;

create or replace function public.upt_push_delivery_config()
returns table(vapid_public_key text,vapid_private_key text,webhook_secret text)
language sql stable security definer
set search_path='pg_catalog','upt_private'
as $$
  select c.vapid_public_key,c.vapid_private_key,c.webhook_secret
  from upt_private.push_delivery_config c where c.singleton=true;
$$;
revoke all on function public.upt_push_delivery_config() from public, anon, authenticated;
grant execute on function public.upt_push_delivery_config() to service_role;

create or replace function upt_private.deliver_push_notification()
returns trigger
language plpgsql security definer
set search_path='pg_catalog','public','upt_private','net'
as $$
declare v_secret text;
begin
  select webhook_secret into v_secret from upt_private.push_delivery_config where singleton=true;
  if v_secret is null then return new; end if;
  perform net.http_post(
    url := 'https://eakoavcieossazqzplke.supabase.co/functions/v1/push-notification',
    body := jsonb_build_object('notification_id',new.id),
    headers := jsonb_build_object('Content-Type','application/json','x-upt-push-secret',v_secret),
    timeout_milliseconds := 2000
  );
  return new;
exception when others then
  raise warning 'Push dispatch enqueue failed for notification %: %',new.id,sqlerrm;
  return new;
end;
$$;
revoke all on function upt_private.deliver_push_notification() from public, anon, authenticated;

drop trigger if exists crew_notifications_push_dispatch on public.crew_notifications;
create trigger crew_notifications_push_dispatch
after insert on public.crew_notifications
for each row execute function upt_private.deliver_push_notification();

-- Environment-specific VAPID keys and webhook secret are provisioned separately
-- in upt_private.push_delivery_config and are intentionally never committed.
