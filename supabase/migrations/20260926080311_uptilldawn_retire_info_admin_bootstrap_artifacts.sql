drop trigger if exists upt_promote_confirmed_info_admin on auth.users;
drop function if exists public.upt_promote_confirmed_info_admin();

drop function if exists public.upt_info_admin_bootstrap_open();
drop function if exists public.upt_password_change_required();
drop function if exists public.upt_mark_password_changed();
drop table if exists upt_private.password_change_required;

do $audit$
begin
  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal
      and n.nspname='auth'
      and c.relname='users'
      and t.tgname='upt_promote_confirmed_info_admin'
  ) then
    raise exception 'legacy info admin promotion trigger still exists';
  end if;
  if to_regprocedure('public.upt_promote_confirmed_info_admin()') is not null
     or to_regprocedure('public.upt_info_admin_bootstrap_open()') is not null
     or to_regprocedure('public.upt_password_change_required()') is not null
     or to_regprocedure('public.upt_mark_password_changed()') is not null then
    raise exception 'legacy info admin bootstrap function still exists';
  end if;
  if to_regclass('upt_private.password_change_required') is not null then
    raise exception 'legacy password-change marker table still exists';
  end if;
end
$audit$;

notify pgrst,'reload schema';
