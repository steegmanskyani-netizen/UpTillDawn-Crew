revoke insert, update, delete, truncate, references, trigger
on table public.role_ui_rules
from authenticated;

grant select on table public.role_ui_rules to authenticated;
