-- Rename the dedicated God Mode login without changing its password.
CREATE OR REPLACE FUNCTION public.upt_god_set_credentials(p_login text, p_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'upt_private', 'extensions'
AS $function$
begin
  if auth.uid() is null or not upt_private.is_app_owner(auth.uid()) then
    raise exception 'Alleen de maker kan God Mode configureren.';
  end if;
  if lower(trim(coalesce(p_login,'')))<>'godmode@uptilldawn' then
    raise exception 'God Mode login moet godmode@uptilldawn zijn.';
  end if;
  if length(coalesce(p_password,''))<10 or length(p_password)>200 then
    raise exception 'God Mode wachtwoord moet minstens 10 tekens bevatten.';
  end if;

  insert into upt_private.god_mode_config(singleton,login_name,password_hash,updated_at)
  values(true,'godmode@uptilldawn',extensions.crypt(p_password,extensions.gen_salt('bf',12)),now())
  on conflict(singleton) do update
  set login_name=excluded.login_name,password_hash=excluded.password_hash,updated_at=now();

  delete from upt_private.god_mode_sessions;
  delete from upt_private.god_mode_attempts;
end;
$function$;

update upt_private.god_mode_config
set login_name='godmode@uptilldawn', updated_at=now()
where singleton=true and login_name in ('edit@uptilldawn','edit@uptilldown');
