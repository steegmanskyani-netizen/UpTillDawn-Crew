-- Admin portal login protection: 3 failures => temporary lockout + auditable security event.
-- IP/location/device are intentionally supplied by the trusted server layer; never trust browser input.

create table if not exists upt_private.admin_login_attempts (
  login_key text primary key,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists upt_private.admin_login_security_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  event_type text not null check (event_type in ('locked_after_failures','successful_login_after_failures')),
  login_key text not null,
  failed_attempts integer not null default 0,
  ip_address text,
  approximate_location text,
  user_agent text
);

alter table upt_private.admin_login_attempts enable row level security;
alter table upt_private.admin_login_security_events enable row level security;
revoke all on upt_private.admin_login_attempts from public,anon,authenticated;
revoke all on upt_private.admin_login_security_events from public,anon,authenticated;

create or replace function public.upt_admin_login_guard(p_login text)
returns jsonb
language plpgsql security definer
set search_path=pg_catalog,upt_private
as $$
declare v_key text:=lower(trim(coalesce(p_login,''))); v_row upt_private.admin_login_attempts%rowtype;
begin
  if v_key='' or length(v_key)>320 then return jsonb_build_object('allowed',false,'reason','invalid'); end if;
  select * into v_row from upt_private.admin_login_attempts where login_key=v_key;
  if found and v_row.locked_until is not null and v_row.locked_until>now() then
    return jsonb_build_object('allowed',false,'reason','locked','locked_until',v_row.locked_until);
  end if;
  return jsonb_build_object('allowed',true);
end; $$;

create or replace function public.upt_admin_login_failure(p_login text,p_ip text default null,p_location text default null,p_user_agent text default null)
returns jsonb
language plpgsql security definer
set search_path=pg_catalog,upt_private
as $$
declare v_key text:=lower(trim(coalesce(p_login,''))); v_count integer; v_start timestamptz; v_lock timestamptz;
begin
  if v_key='' or length(v_key)>320 then return jsonb_build_object('locked',false); end if;
  select failed_attempts,window_started_at into v_count,v_start from upt_private.admin_login_attempts where login_key=v_key for update;
  if v_start is null or v_start<now()-interval '15 minutes' then v_count:=1; v_start:=now(); else v_count:=coalesce(v_count,0)+1; end if;
  v_lock:=case when v_count>=3 then now()+interval '15 minutes' else null end;
  insert into upt_private.admin_login_attempts(login_key,failed_attempts,window_started_at,locked_until,updated_at)
  values(v_key,v_count,v_start,v_lock,now())
  on conflict(login_key) do update set failed_attempts=excluded.failed_attempts,window_started_at=excluded.window_started_at,locked_until=excluded.locked_until,updated_at=now();
  if v_lock is not null then
    insert into upt_private.admin_login_security_events(event_type,login_key,failed_attempts,ip_address,approximate_location,user_agent)
    values('locked_after_failures',v_key,v_count,left(p_ip,128),left(p_location,300),left(p_user_agent,1000));
  end if;
  return jsonb_build_object('locked',v_lock is not null,'failed_attempts',v_count,'locked_until',v_lock);
end; $$;

create or replace function public.upt_admin_login_success(p_login text,p_ip text default null,p_location text default null,p_user_agent text default null)
returns void
language plpgsql security definer
set search_path=pg_catalog,upt_private
as $$
declare v_key text:=lower(trim(coalesce(p_login,''))); v_count integer;
begin
  select failed_attempts into v_count from upt_private.admin_login_attempts where login_key=v_key;
  if coalesce(v_count,0)>0 then
    insert into upt_private.admin_login_security_events(event_type,login_key,failed_attempts,ip_address,approximate_location,user_agent)
    values('successful_login_after_failures',v_key,v_count,left(p_ip,128),left(p_location,300),left(p_user_agent,1000));
  end if;
  delete from upt_private.admin_login_attempts where login_key=v_key;
end; $$;

revoke all on function public.upt_admin_login_guard(text),public.upt_admin_login_failure(text,text,text,text),public.upt_admin_login_success(text,text,text,text) from public;
grant execute on function public.upt_admin_login_guard(text),public.upt_admin_login_failure(text,text,text,text),public.upt_admin_login_success(text,text,text,text) to anon,authenticated;
notify pgrst,'reload schema';
