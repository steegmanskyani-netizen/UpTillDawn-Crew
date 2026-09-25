revoke execute on function public.upt_private_chat_peers() from authenticated;
revoke select on table public.chat_members from authenticated;

do $$
begin
  if has_function_privilege('authenticated','public.upt_private_chat_peers()','EXECUTE') then
    raise exception 'private chat peer RPC still executable';
  end if;
  if has_table_privilege('authenticated','public.chat_members','SELECT') then
    raise exception 'chat_members still directly selectable';
  end if;
end $$;
