create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp,upt_private
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

  if v_info_admin then
    insert into upt_private.password_change_required(user_id,required_since)
    values(new.id,now())
    on conflict(user_id) do update set required_since=excluded.required_since;
  end if;
  return new;
end;
$$;

create or replace function public.upt_info_admin_bootstrap_open()
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,upt_private,auth
as $$
  select case
    when not exists(select 1 from auth.users u where lower(u.email)='info@uptilldawn.be' and u.deleted_at is null)
      then true
    else exists(
      select 1
      from auth.users u
      join upt_private.password_change_required p on p.user_id=u.id
      where lower(u.email)='info@uptilldawn.be' and u.deleted_at is null
    )
  end;
$$;
revoke all on function public.upt_info_admin_bootstrap_open() from public;
grant execute on function public.upt_info_admin_bootstrap_open() to anon,authenticated;

notify pgrst,'reload schema';
