revoke all on function public.upt_request_check_in(uuid,uuid,boolean,text,numeric,numeric,numeric,text)
from public,anon,authenticated;

revoke all on function public.upt_request_check_out(uuid,text)
from public,anon,authenticated;

revoke all on function public.upt_mark_shift_revision()
from public,anon,authenticated;

grant execute on function public.upt_mark_shift_revision()
to postgres,service_role;

notify pgrst,'reload schema';
