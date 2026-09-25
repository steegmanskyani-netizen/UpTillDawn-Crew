create index if not exists check_ins_shift_id_idx on public.check_ins(shift_id);
create index if not exists check_ins_work_session_id_idx on public.check_ins(work_session_id);
create index if not exists check_outs_shift_id_idx on public.check_outs(shift_id);
create index if not exists check_outs_work_session_id_idx on public.check_outs(work_session_id);
create index if not exists time_review_requests_reviewed_by_idx on public.time_review_requests(reviewed_by);
create index if not exists time_review_requests_shift_id_idx on public.time_review_requests(shift_id);
create index if not exists time_review_requests_work_session_id_idx on public.time_review_requests(work_session_id);