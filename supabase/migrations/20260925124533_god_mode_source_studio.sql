-- God Mode credentials stay encrypted in Vault; never in source or browser storage.
create or replace function public.upt_god_repository_secret(p_token text)
returns text language plpgsql security definer set search_path=pg_catalog,upt_private as $$
begin
  if not upt_private.god_session_valid(p_token) then raise exception 'Invalid God Mode session'; end if;
  return (select decrypted_secret from vault.decrypted_secrets where name='uptilldawn_godmode_github');
end; $$;

create or replace function public.upt_god_repository_connect(p_token text,p_secret text)
returns void language plpgsql security definer set search_path=pg_catalog,upt_private as $$
declare v_id uuid;
begin
  if not upt_private.god_session_valid(p_token) then raise exception 'Invalid God Mode session'; end if;
  if p_secret is null or length(p_secret) not between 20 and 500 then raise exception 'Invalid credential'; end if;
  perform pg_advisory_xact_lock(hashtext('uptilldawn_godmode_github'));
  select id into v_id from vault.secrets where name='uptilldawn_godmode_github';
  if v_id is null then
    perform vault.create_secret(p_secret,'uptilldawn_godmode_github','God Mode repository editor');
  else
    perform vault.update_secret(v_id,p_secret);
  end if;
end; $$;

create or replace function public.upt_god_repository_disconnect(p_token text)
returns void language plpgsql security definer set search_path=pg_catalog,upt_private as $$
begin
  if not upt_private.god_session_valid(p_token) then raise exception 'Invalid God Mode session'; end if;
  perform pg_advisory_xact_lock(hashtext('uptilldawn_godmode_github'));
  delete from vault.secrets where name='uptilldawn_godmode_github';
end; $$;

create table upt_private.god_data_audit (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  table_name text not null,
  operation text not null,
  before_row jsonb,
  after_row jsonb
);
alter table upt_private.god_data_audit enable row level security;
revoke all on upt_private.god_data_audit from public,anon,authenticated;

create or replace function public.upt_god_data_catalog(p_token text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,upt_private as $$
declare v_result jsonb;
begin
  if not upt_private.god_session_valid(p_token) then raise exception 'Invalid God Mode session'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'columns',(
    select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'generated',a.attgenerated<>'' or a.attidentity<>'' ) order by a.attnum)
    from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  ),'primaryKey',(
    select coalesce(jsonb_agg(a.attname order by k.ordinality),'[]'::jsonb)
    from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,ordinality)
    join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
    where i.indrelid=c.oid and i.indisprimary
  )) order by c.relname),'[]'::jsonb) into v_result
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p');
  return v_result;
end; $$;

create or replace function public.upt_god_data_rows(p_token text,p_table text,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path=pg_catalog,upt_private as $$
declare v_result jsonb; v_order text;
begin
  if not upt_private.god_session_valid(p_token) then raise exception 'Invalid God Mode session'; end if;
  if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Invalid offset'; end if;
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=p_table and c.relkind in ('r','p')) then raise exception 'Unknown table'; end if;
  select string_agg(format('%I',a.attname),',' order by k.ordinality) into v_order
  from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum,ordinality)
  join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
  where i.indrelid=to_regclass(format('public.%I',p_table)) and i.indisprimary;
  execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from (select * from public.%I %s limit 50 offset $1) r',p_table,case when v_order is null then '' else 'order by '||v_order end)
  into v_result using p_offset;
  return v_result;
end; $$;

create or replace function public.upt_god_data_mutate(p_token text,p_table text,p_operation text,p_key jsonb,p_before jsonb,p_values jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,upt_private as $$
declare v_table oid; v_pk text[]; v_col text; v_columns text; v_select text; v_set text; v_after jsonb; v_before jsonb; v_count integer;
begin
  if not upt_private.god_session_valid(p_token) then raise exception 'Invalid God Mode session'; end if;
  select c.oid into v_table from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=p_table and c.relkind in ('r','p');
  if v_table is null then raise exception 'Unknown table'; end if;
  if p_operation not in ('insert','update','delete') then raise exception 'Invalid operation'; end if;
  if length(coalesce(p_values::text,''))>100000 or length(coalesce(p_before::text,''))>200000 then raise exception 'Row too large'; end if;
  if p_operation<>'insert' then
    select array_agg(a.attname) into v_pk from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid=v_table and i.indisprimary;
    if v_pk is null or jsonb_typeof(p_key) is distinct from 'object' or jsonb_typeof(p_before) is distinct from 'object' then raise exception 'Primary key and original row required'; end if;
    if (select count(*) from jsonb_object_keys(p_key))<>array_length(v_pk,1) or not p_key ?& v_pk then raise exception 'Invalid primary key'; end if;
    execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1 for update',p_table) into v_before using p_key;
    if v_before is null or v_before<>p_before then raise exception 'Row changed; reload before saving'; end if;
  end if;
  if p_operation='delete' then
    execute format('delete from public.%I t where to_jsonb(t) @> $1',p_table) using p_key;
    get diagnostics v_count=row_count;
  else
    if jsonb_typeof(p_values) is distinct from 'object' or p_values='{}'::jsonb then raise exception 'Values required'; end if;
    for v_col in select jsonb_object_keys(p_values) loop
      if not exists(select 1 from pg_attribute where attrelid=v_table and attname=v_col and attnum>0 and not attisdropped and attgenerated='' and attidentity='') then raise exception 'Unknown or generated column: %',v_col; end if;
      v_columns:=concat_ws(',',v_columns,format('%I',v_col));
      v_select:=concat_ws(',',v_select,format('r.%I',v_col));
      v_set:=concat_ws(',',v_set,format('%I=r.%I',v_col,v_col));
    end loop;
    if p_operation='insert' then
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I.*)',p_table,v_columns,v_select,p_table,p_table) into v_after using p_values;
    else
      execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) r where to_jsonb(t) @> $2 returning to_jsonb(t.*)',p_table,v_set,p_table) into v_after using p_values,p_key;
    end if;
    get diagnostics v_count=row_count;
  end if;
  if v_count<>1 then raise exception 'Expected exactly one row'; end if;
  insert into upt_private.god_data_audit(table_name,operation,before_row,after_row) values(p_table,p_operation,v_before,v_after);
  return jsonb_build_object('ok',true,'row',v_after);
end; $$;

revoke all on function public.upt_god_repository_secret(text),public.upt_god_repository_connect(text,text),public.upt_god_repository_disconnect(text),public.upt_god_data_catalog(text),public.upt_god_data_rows(text,text,integer),public.upt_god_data_mutate(text,text,text,jsonb,jsonb,jsonb) from public;
grant execute on function public.upt_god_repository_secret(text),public.upt_god_repository_connect(text,text),public.upt_god_repository_disconnect(text),public.upt_god_data_catalog(text),public.upt_god_data_rows(text,text,integer),public.upt_god_data_mutate(text,text,text,jsonb,jsonb,jsonb) to anon,authenticated;
notify pgrst,'reload schema';

create or replace function public.upt_god_database_secret(p_token text)
returns text language plpgsql security definer set search_path=pg_catalog,upt_private as $$
begin
  if not upt_private.god_session_valid(p_token) then raise exception 'Invalid God Mode session'; end if;
  return (select decrypted_secret from vault.decrypted_secrets where name='uptilldawn_godmode_database');
end; $$;

create or replace function public.upt_god_database_connect(p_token text,p_secret text)
returns void language plpgsql security definer set search_path=pg_catalog,upt_private as $$
declare v_id uuid;
begin
  if not upt_private.god_session_valid(p_token) then raise exception 'Invalid God Mode session'; end if;
  if p_secret is null or length(p_secret) not between 20 and 500 then raise exception 'Invalid credential'; end if;
  perform pg_advisory_xact_lock(hashtext('uptilldawn_godmode_database'));
  select id into v_id from vault.secrets where name='uptilldawn_godmode_database';
  if v_id is null then
    perform vault.create_secret(p_secret,'uptilldawn_godmode_database','God Mode database editor');
  else
    perform vault.update_secret(v_id,p_secret);
  end if;
end; $$;

create or replace function public.upt_god_database_disconnect(p_token text)
returns void language plpgsql security definer set search_path=pg_catalog,upt_private as $$
begin
  if not upt_private.god_session_valid(p_token) then raise exception 'Invalid God Mode session'; end if;
  perform pg_advisory_xact_lock(hashtext('uptilldawn_godmode_database'));
  delete from vault.secrets where name='uptilldawn_godmode_database';
end; $$;


revoke all on function public.upt_god_database_secret(text),public.upt_god_database_connect(text,text),public.upt_god_database_disconnect(text) from public;
grant execute on function public.upt_god_database_secret(text),public.upt_god_database_connect(text,text),public.upt_god_database_disconnect(text) to anon,authenticated;
notify pgrst,'reload schema';
