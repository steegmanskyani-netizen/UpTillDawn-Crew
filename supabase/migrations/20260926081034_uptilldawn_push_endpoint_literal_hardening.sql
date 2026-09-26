create or replace function upt_private.push_endpoint_is_safe(p_endpoint text)
returns boolean
language plpgsql
immutable
security invoker
set search_path='pg_catalog'
as $$
declare
  v text:=lower(trim(coalesce(p_endpoint,'')));
  v_authority text;
  v_host text;
begin
  if char_length(v) not between 20 and 4096 or v !~ '^https://[^/?#]+/' then
    return false;
  end if;

  v_authority:=split_part(split_part(v,'://',2),'/',1);
  if v_authority='' or position('@' in v_authority)>0
     or position('[' in v_authority)>0 or position(']' in v_authority)>0 then
    return false;
  end if;

  v_host:=split_part(v_authority,':',1);
  if v_host='' or v_host !~ '^[a-z0-9.-]+$'
     or v_host not like '%.%'
     or v_host like '.%' or v_host like '%.' or v_host like '%..%' then
    return false;
  end if;

  if v_host='localhost'
     or v_host like '%.localhost'
     or v_host like '%.local'
     or v_host like '%.internal' then
    return false;
  end if;

  if v_host ~ '^[0-9]+$'
     or v_host ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function upt_private.push_endpoint_is_safe(text) from public, anon, authenticated;

create or replace function public.upt_save_push_subscription(
  p_endpoint text,p_p256dh text,p_auth text,p_user_agent text default null
)
returns uuid
language plpgsql security definer
set search_path='pg_catalog','public','upt_private'
as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
  if v_user is null or not public.upt_is_approved() then raise exception 'Aanmelden vereist.'; end if;
  if not upt_private.push_endpoint_is_safe(p_endpoint)
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

do $audit$
begin
  if upt_private.push_endpoint_is_safe('https://127.0.0.1/push')
     or upt_private.push_endpoint_is_safe('https://2130706433/push')
     or upt_private.push_endpoint_is_safe('https://[::ffff:127.0.0.1]/push')
     or upt_private.push_endpoint_is_safe('https://localhost/push')
     or upt_private.push_endpoint_is_safe('https://user:pass@push.example.com/push') then
    raise exception 'unsafe push endpoint accepted';
  end if;
  if not upt_private.push_endpoint_is_safe('https://fcm.googleapis.com/fcm/send/example') then
    raise exception 'valid push provider endpoint rejected';
  end if;
end
$audit$;
