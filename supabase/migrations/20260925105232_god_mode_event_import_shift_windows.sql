alter table public.events
  add column if not exists facebook_event_url text;

alter table public.shifts
  add column if not exists shift_kind text not null default 'event';

alter table public.shifts
  drop constraint if exists shifts_shift_kind_check;
alter table public.shifts
  add constraint shifts_shift_kind_check
  check (shift_kind in ('event','setup','breakdown'));

create table if not exists upt_private.password_change_required (
  user_id uuid primary key references auth.users(id) on delete cascade,
  required_since timestamptz not null default now()
);
alter table upt_private.password_change_required enable row level security;
revoke all on table upt_private.password_change_required from public, anon, authenticated;

create or replace function public.upt_password_change_required()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, upt_private
as $$
  select auth.uid() is not null
    and exists(select 1 from upt_private.password_change_required p where p.user_id=auth.uid());
$$;
revoke all on function public.upt_password_change_required() from public, anon;
grant execute on function public.upt_password_change_required() to authenticated;

create or replace function public.upt_mark_password_changed()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, upt_private
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from upt_private.password_change_required where user_id=auth.uid();
end;
$$;
revoke all on function public.upt_mark_password_changed() from public, anon;
grant execute on function public.upt_mark_password_changed() to authenticated;

create table if not exists upt_private.god_mode_config (
  singleton boolean primary key default true check (singleton),
  login_name text not null,
  password_hash text not null,
  updated_at timestamptz not null default now()
);
alter table upt_private.god_mode_config enable row level security;
revoke all on table upt_private.god_mode_config from public, anon, authenticated;

create table if not exists upt_private.god_mode_sessions (
  token_hash bytea primary key,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table upt_private.god_mode_sessions enable row level security;
revoke all on table upt_private.god_mode_sessions from public, anon, authenticated;

create table if not exists upt_private.god_mode_attempts (
  singleton boolean primary key default true check (singleton),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz null
);
alter table upt_private.god_mode_attempts enable row level security;
revoke all on table upt_private.god_mode_attempts from public, anon, authenticated;

create or replace function upt_private.god_session_valid(p_token text)
returns boolean
language sql
volatile
security definer
set search_path = pg_catalog, upt_private, extensions
as $$
  select p_token is not null
    and length(p_token) between 32 and 256
    and exists(
      select 1 from upt_private.god_mode_sessions s
      where s.token_hash=extensions.digest(p_token,'sha256')
        and s.expires_at>now()
    );
$$;
revoke all on function upt_private.god_session_valid(text) from public, anon, authenticated;

create or replace function public.upt_god_login(p_login text,p_password text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, upt_private, extensions
as $$
declare
  v_login text;
  v_hash text;
  v_failed integer:=0;
  v_window timestamptz;
  v_locked timestamptz;
  v_token text;
begin
  if p_login is null or p_password is null or length(p_login)>200 or length(p_password)>200 then
    return null;
  end if;

  select a.failed_attempts,a.window_started_at,a.locked_until
    into v_failed,v_window,v_locked
  from upt_private.god_mode_attempts a
  where singleton=true
  for update;

  if v_locked is not null and v_locked>now() then return null; end if;

  select lower(trim(c.login_name)),c.password_hash into v_login,v_hash
  from upt_private.god_mode_config c where singleton=true;

  if v_hash is not null
     and lower(trim(p_login))=v_login
     and extensions.crypt(p_password,v_hash)=v_hash then
    delete from upt_private.god_mode_sessions where expires_at<=now();
    v_token:=encode(extensions.gen_random_bytes(32),'hex');
    insert into upt_private.god_mode_sessions(token_hash,expires_at)
    values(extensions.digest(v_token,'sha256'),now()+interval '2 hours');
    delete from upt_private.god_mode_attempts where singleton=true;
    return v_token;
  end if;

  if v_window is null or v_window<now()-interval '15 minutes' then
    v_failed:=1; v_window:=now();
  else
    v_failed:=coalesce(v_failed,0)+1;
  end if;

  insert into upt_private.god_mode_attempts(singleton,failed_attempts,window_started_at,locked_until)
  values(true,v_failed,v_window,case when v_failed>=5 then now()+interval '15 minutes' else null end)
  on conflict(singleton) do update
  set failed_attempts=excluded.failed_attempts,
      window_started_at=excluded.window_started_at,
      locked_until=excluded.locked_until;
  return null;
end;
$$;
revoke all on function public.upt_god_login(text,text) from public;
grant execute on function public.upt_god_login(text,text) to anon, authenticated;

create or replace function public.upt_god_session_valid(p_token text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, upt_private
as $$
begin
  if not upt_private.god_session_valid(p_token) then return false; end if;
  update upt_private.god_mode_sessions
  set last_seen_at=now()
  where token_hash=extensions.digest(p_token,'sha256');
  return true;
end;
$$;
revoke all on function public.upt_god_session_valid(text) from public;
grant execute on function public.upt_god_session_valid(text) to anon, authenticated;

create or replace function public.upt_god_logout(p_token text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, upt_private, extensions
as $$
begin
  if p_token is null then return; end if;
  delete from upt_private.god_mode_sessions
  where token_hash=extensions.digest(p_token,'sha256');
end;
$$;
revoke all on function public.upt_god_logout(text) from public;
grant execute on function public.upt_god_logout(text) to anon, authenticated;

create or replace function public.upt_god_role_rules(p_token text,p_role text)
returns table(
  role text, feature_key text, label text, group_key text, visible boolean,
  enabled boolean, condition_key text, sort_order integer, settings jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, upt_private
as $$
begin
  if not upt_private.god_session_valid(p_token) then raise exception 'Invalid God Mode session'; end if;
  if p_role not in ('staff','responsible_lead','admin') then raise exception 'Invalid role'; end if;
  return query
    select r.role,r.feature_key,r.label,r.group_key,r.visible,r.enabled,r.condition_key,r.sort_order,r.settings
    from public.role_ui_rules r
    where r.role=p_role
    order by r.sort_order,r.feature_key;
end;
$$;
revoke all on function public.upt_god_role_rules(text,text) from public;
grant execute on function public.upt_god_role_rules(text,text) to anon, authenticated;

create or replace function public.upt_god_save_role_rules(p_token text,p_role text,p_rules jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, upt_private
as $$
declare
  v jsonb;
  v_condition text;
begin
  if not upt_private.god_session_valid(p_token) then raise exception 'Invalid God Mode session'; end if;
  if p_role not in ('staff','responsible_lead','admin') then raise exception 'Invalid role'; end if;
  if jsonb_typeof(p_rules)<>'array' or jsonb_array_length(p_rules)>60 then raise exception 'Invalid rules'; end if;

  for v in select * from jsonb_array_elements(p_rules)
  loop
    v_condition:=coalesce(v->>'condition_key','never');
    if v_condition not in ('always','assigned_event','assigned_workplace_role','event_active','shift_active','never') then
      raise exception 'Invalid condition';
    end if;
    update public.role_ui_rules
    set label=left(coalesce(v->>'label',label),80),
        group_key=left(coalesce(v->>'group_key',group_key),100),
        visible=coalesce((v->>'visible')::boolean,visible),
        enabled=coalesce((v->>'enabled')::boolean,enabled),
        condition_key=v_condition,
        sort_order=coalesce((v->>'sort_order')::integer,sort_order),
        settings=coalesce(v->'settings',settings),
        updated_at=now(),
        updated_by=null
    where role=p_role and feature_key=v->>'feature_key';
  end loop;
end;
$$;
revoke all on function public.upt_god_save_role_rules(text,text,jsonb) from public;
grant execute on function public.upt_god_save_role_rules(text,text,jsonb) to anon, authenticated;

drop function if exists public.upt_create_shift(uuid,uuid,text,timestamptz,timestamptz,boolean);
create or replace function public.upt_create_shift(
  p_workplace uuid,
  p_user uuid,
  p_role_name text,
  p_start timestamptz,
  p_end timestamptz,
  p_overlap_allowed boolean default false,
  p_shift_kind text default 'event'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid:=auth.uid();
  v_event uuid;
  v_shift uuid;
  v_event_start timestamptz;
  v_event_end timestamptz;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if not public.upt_is_admin(v_actor) then raise exception 'Alleen admin kan diensten aanmaken of aanpassen.'; end if;

  select w.event_id,e.start_at,e.end_at into v_event,v_event_start,v_event_end
  from public.workplaces w join public.events e on e.id=w.event_id
  where w.id=p_workplace and w.is_active=true;

  if v_event is null then raise exception 'Actieve werkplek niet gevonden.'; end if;
  if p_start is null or p_end is null or p_end<=p_start then raise exception 'Ongeldige dienstperiode.'; end if;
  if p_role_name is null or length(trim(p_role_name)) not between 1 and 200 then raise exception 'Ongeldige rol.'; end if;
  if p_shift_kind not in ('event','setup','breakdown') then raise exception 'Ongeldig diensttype.'; end if;

  if p_shift_kind='event' and (p_start<v_event_start or p_end>v_event_end) then
    raise exception 'Een evenementshift moet binnen de evenementuren vallen.';
  elsif p_shift_kind='setup' and (p_start<v_event_start-interval '3 days' or p_end>v_event_end) then
    raise exception 'Opbouw kan maximaal 3 dagen voor het evenement starten.';
  elsif p_shift_kind='breakdown' and (p_start<v_event_start or p_end>v_event_end+interval '3 days') then
    raise exception 'Afbouw kan maximaal 3 dagen na het evenement eindigen.';
  end if;

  if not exists (
    select 1 from public.event_members em join public.profiles p on p.id=em.user_id
    where em.event_id=v_event and em.user_id=p_user and p.approved=true
  ) then raise exception 'Goedgekeurd evenementlid vereist.'; end if;

  if not coalesce(p_overlap_allowed,false) and exists(
    select 1 from public.shifts s
    where s.user_id=p_user and s.status<>'cancelled'
      and s.scheduled_start<p_end and s.scheduled_end>p_start
  ) then raise exception 'Dienst overlapt met een bestaande dienst.'; end if;

  insert into public.shifts(
    event_id,workplace_id,user_id,role_name,scheduled_start,scheduled_end,
    start_time,end_time,overlap_allowed,status,shift_kind
  ) values(
    v_event,p_workplace,p_user,trim(p_role_name),p_start,p_end,
    p_start,p_end,coalesce(p_overlap_allowed,false),'scheduled',p_shift_kind
  ) returning id into v_shift;
  return v_shift;
end;
$$;
revoke all on function public.upt_create_shift(uuid,uuid,text,timestamptz,timestamptz,boolean,text) from public, anon;
grant execute on function public.upt_create_shift(uuid,uuid,text,timestamptz,timestamptz,boolean,text) to authenticated;

drop function if exists public.upt_update_shift(uuid,text,timestamptz,timestamptz,boolean);
create or replace function public.upt_update_shift(
  p_shift uuid,
  p_role_name text,
  p_start timestamptz,
  p_end timestamptz,
  p_overlap_allowed boolean default false,
  p_shift_kind text default 'event'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid:=auth.uid();
  v_shift public.shifts%rowtype;
  v_event_start timestamptz;
  v_event_end timestamptz;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if not public.upt_is_admin(v_actor) then raise exception 'Alleen admin kan diensten aanmaken of aanpassen.'; end if;

  select * into v_shift from public.shifts where id=p_shift for update;
  if not found then raise exception 'Dienst niet gevonden.'; end if;
  if v_shift.status='cancelled' then raise exception 'Geannuleerde dienst kan niet worden gewijzigd.'; end if;
  if p_start is null or p_end is null or p_end<=p_start then raise exception 'Ongeldige dienstperiode.'; end if;
  if p_role_name is null or length(trim(p_role_name)) not between 1 and 200 then raise exception 'Ongeldige rol.'; end if;
  if p_shift_kind not in ('event','setup','breakdown') then raise exception 'Ongeldig diensttype.'; end if;

  select start_at,end_at into v_event_start,v_event_end from public.events where id=v_shift.event_id;
  if p_shift_kind='event' and (p_start<v_event_start or p_end>v_event_end) then
    raise exception 'Een evenementshift moet binnen de evenementuren vallen.';
  elsif p_shift_kind='setup' and (p_start<v_event_start-interval '3 days' or p_end>v_event_end) then
    raise exception 'Opbouw kan maximaal 3 dagen voor het evenement starten.';
  elsif p_shift_kind='breakdown' and (p_start<v_event_start or p_end>v_event_end+interval '3 days') then
    raise exception 'Afbouw kan maximaal 3 dagen na het evenement eindigen.';
  end if;

  if exists(select 1 from public.work_sessions ws where ws.shift_id=p_shift and ws.ended_at is null) then
    raise exception 'Actieve werktijd verhindert wijziging van de dienst.';
  end if;

  if not coalesce(p_overlap_allowed,false) and exists(
    select 1 from public.shifts s
    where s.id<>p_shift and s.user_id=v_shift.user_id and s.status<>'cancelled'
      and s.scheduled_start<p_end and s.scheduled_end>p_start
  ) then raise exception 'Dienst overlapt met een bestaande dienst.'; end if;

  update public.shifts
  set role_name=trim(p_role_name),scheduled_start=p_start,scheduled_end=p_end,
      start_time=p_start,end_time=p_end,overlap_allowed=coalesce(p_overlap_allowed,false),
      shift_kind=p_shift_kind,updated_at=now()
  where id=p_shift;
end;
$$;
revoke all on function public.upt_update_shift(uuid,text,timestamptz,timestamptz,boolean,text) from public, anon;
grant execute on function public.upt_update_shift(uuid,text,timestamptz,timestamptz,boolean,text) to authenticated;

update public.role_ui_rules
set condition_key='shift_active',updated_at=now()
where role='responsible_lead' and feature_key='operations';

notify pgrst,'reload schema';
