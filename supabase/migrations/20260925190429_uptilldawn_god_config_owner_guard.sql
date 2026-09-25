create or replace function public.upt_god_is_configured()
returns boolean
language sql
stable
security definer
set search_path='pg_catalog','upt_private','auth'
as $$
  select case
    when auth.uid() is not null and upt_private.is_app_owner(auth.uid())
      then exists(select 1 from upt_private.god_mode_config where singleton=true)
    else false
  end;
$$;

revoke all on function public.upt_god_is_configured() from public, anon;
grant execute on function public.upt_god_is_configured() to authenticated;
