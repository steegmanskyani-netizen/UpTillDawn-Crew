create table if not exists upt_private.admin_edit_config (
  singleton boolean primary key default true check (singleton),
  code_hash bytea not null,
  updated_at timestamptz not null default now()
);

alter table upt_private.admin_edit_config enable row level security;
revoke all on table upt_private.admin_edit_config from public, anon, authenticated;

create or replace function public.upt_verify_admin_edit_code(p_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = 'pg_catalog','public','upt_private','extensions'
as $$
declare
  v_hash bytea;
begin
  if auth.uid() is null
     or not public.upt_is_approved()
     or not public.upt_is_admin(auth.uid())
     or p_code is null
     or length(p_code) > 100 then
    return false;
  end if;

  select code_hash into v_hash
  from upt_private.admin_edit_config
  where singleton=true;

  if v_hash is null then
    return false;
  end if;

  return v_hash = extensions.digest(p_code,'sha256');
end;
$$;

revoke all on function public.upt_verify_admin_edit_code(text) from public, anon;
grant execute on function public.upt_verify_admin_edit_code(text) to authenticated;

-- The actual edit-code hash is environment data and is intentionally not hard-coded
-- into this public migration. Seed upt_private.admin_edit_config separately per environment.
