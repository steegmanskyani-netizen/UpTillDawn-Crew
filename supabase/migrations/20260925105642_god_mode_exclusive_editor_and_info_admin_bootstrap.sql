drop policy if exists role_ui_rules_admin_insert on public.role_ui_rules;
drop policy if exists role_ui_rules_admin_update on public.role_ui_rules;
drop policy if exists role_ui_rules_admin_delete on public.role_ui_rules;

drop function if exists public.upt_verify_admin_edit_code(text);
drop function if exists public.upt_has_admin_edit_unlock();
drop function if exists public.upt_revoke_admin_edit_unlock();

drop table if exists upt_private.admin_edit_attempts;
drop table if exists upt_private.admin_edit_unlocks;
drop table if exists upt_private.admin_edit_config;

create or replace function public.upt_god_is_configured()
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,upt_private
as $$
  select exists(select 1 from upt_private.god_mode_config where singleton=true);
$$;
revoke all on function public.upt_god_is_configured() from public, anon;
grant execute on function public.upt_god_is_configured() to authenticated;

create or replace function public.upt_god_set_credentials(p_login text,p_password text)
returns void
language plpgsql
security definer
set search_path=pg_catalog,public,upt_private,extensions
as $$
begin
  if auth.uid() is null or not upt_private.is_app_owner(auth.uid()) then
    raise exception 'Alleen de maker kan God Mode configureren.';
  end if;
  if lower(trim(coalesce(p_login,'')))<>'edit@uptilldown' then
    raise exception 'God Mode login moet edit@uptilldown zijn.';
  end if;
  if length(coalesce(p_password,''))<10 or length(p_password)>200 then
    raise exception 'God Mode wachtwoord moet minstens 10 tekens bevatten.';
  end if;

  insert into upt_private.god_mode_config(singleton,login_name,password_hash,updated_at)
  values(true,'edit@uptilldown',extensions.crypt(p_password,extensions.gen_salt('bf',12)),now())
  on conflict(singleton) do update
  set login_name=excluded.login_name,password_hash=excluded.password_hash,updated_at=now();

  delete from upt_private.god_mode_sessions;
  delete from upt_private.god_mode_attempts;
end;
$$;
revoke all on function public.upt_god_set_credentials(text,text) from public, anon;
grant execute on function public.upt_god_set_credentials(text,text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_info_admin boolean:=lower(coalesce(new.email,''))='info@uptilldawn.be';
begin
  insert into public.profiles(id,full_name,role,approved)
  values(
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''),split_part(coalesce(new.email,''),'@',1)),
    case when v_info_admin then 'admin' else 'staff' end,
    v_info_admin
  )
  on conflict(id) do nothing;
  return new;
end;
$$;

notify pgrst,'reload schema';
