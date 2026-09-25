create or replace function public.upt_start_work(
  p_event uuid,
  p_shift uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  raise exception 'Direct werk starten is uitgeschakeld. Dien je starturen in via de QR-workflow.';
end
$$;

create or replace function public.upt_stop_work(
  p_work_session uuid
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  raise exception 'Direct werk stoppen is uitgeschakeld. Dien je stopuren in via de QR-workflow.';
end
$$;

revoke all on function public.upt_start_work(uuid,uuid) from public,anon,authenticated;
revoke all on function public.upt_stop_work(uuid) from public,anon,authenticated;

revoke all on function public.upt_notify_shift_change() from public,anon,authenticated;
revoke all on function public.upt_task_reconfirm_after_change() from public,anon,authenticated;
grant execute on function public.upt_notify_shift_change() to postgres,service_role;
grant execute on function public.upt_task_reconfirm_after_change() to postgres,service_role;

notify pgrst,'reload schema';
