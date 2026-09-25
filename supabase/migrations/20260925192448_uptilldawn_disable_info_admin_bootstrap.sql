create or replace function public.upt_info_admin_bootstrap_open()
returns boolean
language sql
stable
security definer
set search_path='pg_catalog'
as $$
  select false;
$$;

revoke all on function public.upt_info_admin_bootstrap_open() from public, anon, authenticated;
grant execute on function public.upt_info_admin_bootstrap_open() to service_role;

do $audit$
begin
  if public.upt_info_admin_bootstrap_open() then
    raise exception 'bootstrap is still open';
  end if;
  if has_function_privilege('anon','public.upt_info_admin_bootstrap_open()','EXECUTE') then
    raise exception 'anonymous bootstrap execute remains';
  end if;
  if has_function_privilege('authenticated','public.upt_info_admin_bootstrap_open()','EXECUTE') then
    raise exception 'authenticated bootstrap execute remains';
  end if;
end
$audit$;
