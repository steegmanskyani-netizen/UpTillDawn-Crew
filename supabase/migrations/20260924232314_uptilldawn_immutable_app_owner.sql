-- Permanent maker/owner privilege for the Up Till Dawn application.
-- Owner identity is environment data and is intentionally not hard-coded here.
-- Production seeds the owner row separately so personal identifiers never enter this public repository.

create table if not exists upt_private.app_owners (
  user_id uuid primary key references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table upt_private.app_owners enable row level security;
revoke all on table upt_private.app_owners from public, anon, authenticated;

create or replace function upt_private.is_app_owner(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, upt_private
as $$
  select p_uid is not null
    and exists(select 1 from upt_private.app_owners o where o.user_id=p_uid);
$$;
revoke all on function upt_private.is_app_owner(uuid) from public, anon, authenticated;

create or replace function public.upt_current_is_owner()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, upt_private
as $$
  select upt_private.is_app_owner(auth.uid());
$$;
revoke all on function public.upt_current_is_owner() from public, anon;
grant execute on function public.upt_current_is_owner() to authenticated;

create or replace function public.upt_is_approved()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, upt_private
as $$
  select auth.uid() is not null
    and (
      upt_private.is_app_owner(auth.uid())
      or exists(
        select 1 from public.profiles p
        where p.id=auth.uid() and p.approved=true
      )
    );
$$;

create or replace function public.upt_effective_role(uid uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, upt_private
as $$
  select case
    when uid is null then null
    when upt_private.is_app_owner(uid) then coalesce(
      (select m.active_role from public.admin_role_modes m where m.user_id=uid),
      (select p.role from public.profiles p where p.id=uid),
      'admin'
    )
    when exists(select 1 from public.profiles p where p.id=uid and p.approved=true) then
      case
        when (select p.role from public.profiles p where p.id=uid)='admin' then coalesce(
          (select m.active_role from public.admin_role_modes m where m.user_id=uid),
          'admin'
        )
        else (select p.role from public.profiles p where p.id=uid)
      end
    else null
  end;
$$;

create or replace function public.upt_is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, upt_private
as $$
  select coalesce(
    upt_private.is_app_owner(uid)
    or public.upt_effective_role(uid)='admin',
    false
  );
$$;

create or replace function public.upt_set_admin_role_mode(p_role text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, upt_private
as $$
declare
  v_uid uuid:=auth.uid();
  v_base_role text;
  v_approved boolean;
  v_old text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_role not in ('admin','staff','responsible_lead') then raise exception 'Ongeldige rolmodus'; end if;

  select p.role,p.approved into v_base_role,v_approved
  from public.profiles p
  where p.id=v_uid;

  if not upt_private.is_app_owner(v_uid)
     and (v_base_role<>'admin' or v_approved is not true)
  then
    raise exception 'Alleen een beheerder kan van rolmodus wisselen';
  end if;

  select coalesce(
    m.active_role,
    case when upt_private.is_app_owner(v_uid) then coalesce(v_base_role,'admin') else 'admin' end
  )
  into v_old
  from (select 1) x
  left join public.admin_role_modes m on m.user_id=v_uid;

  insert into public.admin_role_modes(user_id,active_role,updated_at)
  values(v_uid,p_role,now())
  on conflict(user_id) do update
  set active_role=excluded.active_role,updated_at=excluded.updated_at;

  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_uid,'ADMIN_ROLE_MODE_CHANGED','profile',v_uid,jsonb_build_object('from',v_old,'to',p_role));

  return p_role;
end;
$$;

create or replace function public.upt_admin_set_account(p_user uuid, p_approved boolean, p_role text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, upt_private
as $$
begin
  if not public.upt_is_admin() then raise exception 'Not authorized'; end if;
  if p_role not in ('admin','responsible_lead','staff') or p_role is null or p_approved is null then
    raise exception 'Invalid role';
  end if;

  if upt_private.is_app_owner(p_user) and not p_approved then
    raise exception 'De maker van de app kan niet worden gedeactiveerd.';
  end if;

  if p_user=auth.uid()
     and not upt_private.is_app_owner(p_user)
     and (not p_approved or p_role<>'admin')
  then
    raise exception 'Cannot revoke own admin access';
  end if;

  update public.profiles
  set approved = case when upt_private.is_app_owner(p_user) then true else p_approved end,
      role = p_role
  where id=p_user;

  if not found then raise exception 'Profile not found'; end if;

  if upt_private.is_app_owner(p_user) then
    insert into public.admin_role_modes(user_id,active_role,updated_at)
    values(p_user,p_role,now())
    on conflict(user_id) do update
    set active_role=excluded.active_role,updated_at=excluded.updated_at;
  end if;
end;
$$;

create or replace function upt_private.guard_app_owner_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, upt_private
as $$
begin
  if tg_op='DELETE' then
    if upt_private.is_app_owner(old.id) then
      raise exception 'Het maker-account kan niet worden verwijderd.';
    end if;
    return old;
  end if;

  if upt_private.is_app_owner(old.id) then
    if new.id is distinct from old.id then
      raise exception 'De identiteit van het maker-account kan niet worden gewijzigd.';
    end if;
    if new.approved is not true then
      raise exception 'Het maker-account kan niet worden gedeactiveerd.';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function upt_private.guard_app_owner_profile() from public, anon, authenticated;

drop trigger if exists upt_guard_app_owner_profile on public.profiles;
create trigger upt_guard_app_owner_profile
before update or delete on public.profiles
for each row execute function upt_private.guard_app_owner_profile();

create or replace function upt_private.prevent_app_owner_identity_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, upt_private
as $$
begin
  raise exception 'De maker-identiteit is permanent en kan niet worden gewijzigd of verwijderd.';
end;
$$;
revoke all on function upt_private.prevent_app_owner_identity_mutation() from public, anon, authenticated;

drop trigger if exists upt_lock_app_owner_identity on upt_private.app_owners;
create trigger upt_lock_app_owner_identity
before update or delete on upt_private.app_owners
for each row execute function upt_private.prevent_app_owner_identity_mutation();

notify pgrst,'reload schema';
