-- Distributed Geoapify quota guard: 60 requests per authenticated account per rolling minute bucket.
create table if not exists upt_private.geoapify_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table upt_private.geoapify_rate_limits enable row level security;
revoke all on upt_private.geoapify_rate_limits from public, anon, authenticated;

create or replace function public.upt_geoapify_rate_limit()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, upt_private
as $$
declare
  v_uid uuid := auth.uid();
  v_row upt_private.geoapify_rate_limits%rowtype;
  v_now timestamptz := clock_timestamp();
  v_retry integer;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  insert into upt_private.geoapify_rate_limits(user_id, window_started_at, request_count, updated_at)
  values(v_uid, v_now, 1, v_now)
  on conflict (user_id) do nothing;

  select * into v_row
  from upt_private.geoapify_rate_limits
  where user_id = v_uid
  for update;

  if v_row.window_started_at <= v_now - interval '60 seconds' then
    update upt_private.geoapify_rate_limits
    set window_started_at = v_now, request_count = 1, updated_at = v_now
    where user_id = v_uid;
    return jsonb_build_object('allowed', true, 'retry_after', 0);
  end if;

  -- A freshly inserted row already represents this request.
  if v_row.request_count = 1 and v_row.updated_at = v_row.window_started_at then
    return jsonb_build_object('allowed', true, 'retry_after', 0);
  end if;

  if v_row.request_count >= 60 then
    v_retry := greatest(1, ceil(extract(epoch from ((v_row.window_started_at + interval '60 seconds') - v_now)))::integer);
    return jsonb_build_object('allowed', false, 'retry_after', v_retry);
  end if;

  update upt_private.geoapify_rate_limits
  set request_count = request_count + 1, updated_at = v_now
  where user_id = v_uid;

  return jsonb_build_object('allowed', true, 'retry_after', 0);
end;
$$;

revoke all on function public.upt_geoapify_rate_limit() from public, anon;
grant execute on function public.upt_geoapify_rate_limit() to authenticated;

notify pgrst, 'reload schema';
