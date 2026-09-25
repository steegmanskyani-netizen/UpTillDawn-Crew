-- Run as the project database administrator. Every change is rolled back.
begin;
insert into upt_private.god_mode_sessions(token_hash,expires_at)
values(extensions.digest('studio-test-session-00000000000000000000000000000000','sha256'),now()+interval '5 minutes');
set local role anon;
do $$
declare token text:='studio-test-session-00000000000000000000000000000000'; row_before jsonb; row_after jsonb; result jsonb; denied boolean:=false;
begin
  begin perform public.upt_god_data_catalog('invalid'); exception when others then denied:=true; end;
  if not denied then raise exception 'Unauthenticated catalog access allowed'; end if;
  denied:=false;
  begin perform public.upt_god_repository_secret('invalid'); exception when others then denied:=true; end;
  if not denied then raise exception 'Unauthenticated credential access allowed'; end if;
  denied:=false;
  begin perform public.upt_god_database_secret('invalid'); exception when others then denied:=true; end;
  if not denied then raise exception 'Unauthenticated database credential access allowed'; end if;
  if jsonb_array_length(public.upt_god_data_catalog(token))=0 then raise exception 'Catalog empty'; end if;
  denied:=false;
  begin perform public.upt_god_data_rows(token,'profiles;drop table public.profiles',0); exception when others then denied:=true; end;
  if not denied then raise exception 'Unsafe table name accepted'; end if;
  result:=public.upt_god_data_mutate(token,'role_ui_rules','insert','{}',null,'{"role":"staff","feature_key":"studio_regression_fixture","label":"Before","group_key":"studio_test"}');
  row_before:=result->'row';
  if row_before->>'label'<>'Before' then raise exception 'Insert failed'; end if;
  result:=public.upt_god_data_mutate(token,'role_ui_rules','update','{"role":"staff","feature_key":"studio_regression_fixture"}',row_before,'{"label":"After"}');
  row_after:=result->'row';
  if row_after->>'label'<>'After' then raise exception 'Update failed'; end if;
  denied:=false;
  begin perform public.upt_god_data_mutate(token,'role_ui_rules','update','{"role":"staff","feature_key":"studio_regression_fixture"}',row_before,'{"label":"Stale overwrite"}'); exception when others then denied:=true; end;
  if not denied then raise exception 'Stale update allowed'; end if;
  denied:=false;
  begin perform public.upt_god_data_mutate(token,'role_ui_rules','delete','{}',row_after,'{}'); exception when others then denied:=true; end;
  if not denied then raise exception 'Unscoped delete allowed'; end if;
  result:=public.upt_god_data_mutate(token,'role_ui_rules','delete','{"role":"staff","feature_key":"studio_regression_fixture"}',row_after,'{}');
  if not (result->>'ok')::boolean then raise exception 'Delete failed'; end if;
end; $$;
reset role;
do $$ begin
  if (select count(*) from upt_private.god_data_audit where table_name='role_ui_rules' and coalesce(after_row,before_row)->>'feature_key'='studio_regression_fixture')<>3 then raise exception 'Audit trail incomplete'; end if;
end; $$;
rollback;
