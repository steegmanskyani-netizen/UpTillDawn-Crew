create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  insert into public.profiles(id,full_name,role,approved)
  values(
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''),split_part(coalesce(new.email,''),'@',1)),
    'staff',
    false
  )
  on conflict(id) do nothing;
  return new;
end;
$$;

create or replace function public.upt_promote_confirmed_info_admin()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,upt_private
as $$
begin
  if lower(coalesce(new.email,''))='info@uptilldawn.be'
     and new.email_confirmed_at is not null
     and old.email_confirmed_at is null then
    update public.profiles
    set role='admin',approved=true,updated_at=now()
    where id=new.id;

    insert into upt_private.password_change_required(user_id,required_since)
    values(new.id,now())
    on conflict(user_id) do update set required_since=excluded.required_since;
  end if;
  return new;
end;
$$;
revoke all on function public.upt_promote_confirmed_info_admin() from public,anon,authenticated;

drop trigger if exists upt_promote_confirmed_info_admin on auth.users;
create trigger upt_promote_confirmed_info_admin
after update of email_confirmed_at on auth.users
for each row
when (new.email_confirmed_at is not null and old.email_confirmed_at is null)
execute function public.upt_promote_confirmed_info_admin();

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
    when exists(
      select 1 from auth.users u
      where lower(u.email)='info@uptilldawn.be'
        and u.deleted_at is null
        and u.email_confirmed_at is null
    ) then true
    else exists(
      select 1
      from auth.users u
      join upt_private.password_change_required p on p.user_id=u.id
      where lower(u.email)='info@uptilldawn.be' and u.deleted_at is null
    )
  end;
$$;

notify pgrst,'reload schema';
