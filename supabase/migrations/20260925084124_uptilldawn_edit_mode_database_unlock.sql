create table if not exists upt_private.admin_edit_unlocks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table upt_private.admin_edit_unlocks enable row level security;
revoke all on table upt_private.admin_edit_unlocks from public, anon, authenticated;

create table if not exists upt_private.admin_edit_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz null
);

alter table upt_private.admin_edit_attempts enable row level security;
revoke all on table upt_private.admin_edit_attempts from public, anon, authenticated;

create or replace function public.upt_has_admin_edit_unlock()
returns boolean
language sql
stable
security definer
set search_path='pg_catalog','public','upt_private'
as $$
  select coalesce(
    auth.uid() is not null
    and public.upt_is_approved()
    and public.upt_is_admin(auth.uid())
    and exists(
      select 1
      from upt_private.admin_edit_unlocks u
      where u.user_id=auth.uid()
        and u.expires_at>now()
    ),
    false
  );
$$;

revoke all on function public.upt_has_admin_edit_unlock() from public, anon;
grant execute on function public.upt_has_admin_edit_unlock() to authenticated;

create or replace function public.upt_revoke_admin_edit_unlock()
returns void
language plpgsql
security definer
set search_path='pg_catalog','public','upt_private'
as $$
begin
  if auth.uid() is null then return; end if;
  delete from upt_private.admin_edit_unlocks where user_id=auth.uid();
end;
$$;

revoke all on function public.upt_revoke_admin_edit_unlock() from public, anon;
grant execute on function public.upt_revoke_admin_edit_unlock() to authenticated;

create or replace function public.upt_verify_admin_edit_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path='pg_catalog','public','upt_private','extensions'
as $$
declare
  v_uid uuid:=auth.uid();
  v_hash bytea;
  v_failed integer:=0;
  v_window timestamptz;
  v_locked timestamptz;
begin
  if v_uid is null
     or not public.upt_is_approved()
     or not public.upt_is_admin(v_uid)
     or p_code is null
     or length(p_code)>100 then
    return false;
  end if;

  select a.failed_attempts,a.window_started_at,a.locked_until
  into v_failed,v_window,v_locked
  from upt_private.admin_edit_attempts a
  where a.user_id=v_uid
  for update;

  if v_locked is not null and v_locked>now() then
    return false;
  end if;

  select c.code_hash into v_hash
  from upt_private.admin_edit_config c
  where c.singleton=true;

  if v_hash is null then return false; end if;

  if v_hash=extensions.digest(p_code,'sha256') then
    insert into upt_private.admin_edit_unlocks(user_id,unlocked_at,expires_at)
    values(v_uid,now(),now()+interval '60 minutes')
    on conflict(user_id) do update
      set unlocked_at=excluded.unlocked_at,
          expires_at=excluded.expires_at;
    delete from upt_private.admin_edit_attempts where user_id=v_uid;
    return true;
  end if;

  if v_window is null or v_window<now()-interval '15 minutes' then
    v_failed:=1;
    v_window:=now();
  else
    v_failed:=coalesce(v_failed,0)+1;
  end if;

  insert into upt_private.admin_edit_attempts(user_id,failed_attempts,window_started_at,locked_until)
  values(
    v_uid,
    v_failed,
    v_window,
    case when v_failed>=5 then now()+interval '15 minutes' else null end
  )
  on conflict(user_id) do update
    set failed_attempts=excluded.failed_attempts,
        window_started_at=excluded.window_started_at,
        locked_until=excluded.locked_until;

  return false;
end;
$$;

revoke all on function public.upt_verify_admin_edit_code(text) from public, anon;
grant execute on function public.upt_verify_admin_edit_code(text) to authenticated;

drop policy if exists role_ui_rules_admin_insert on public.role_ui_rules;
drop policy if exists role_ui_rules_admin_update on public.role_ui_rules;
drop policy if exists role_ui_rules_admin_delete on public.role_ui_rules;

create policy role_ui_rules_admin_insert
on public.role_ui_rules
for insert to authenticated
with check (public.upt_is_admin() and public.upt_has_admin_edit_unlock());

create policy role_ui_rules_admin_update
on public.role_ui_rules
for update to authenticated
using (public.upt_is_admin() and public.upt_has_admin_edit_unlock())
with check (public.upt_is_admin() and public.upt_has_admin_edit_unlock());

create policy role_ui_rules_admin_delete
on public.role_ui_rules
for delete to authenticated
using (public.upt_is_admin() and public.upt_has_admin_edit_unlock());
