create or replace function public.upt_admin_delete_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, upt_private
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.upt_is_admin(v_actor) then raise exception 'Geen toegang.'; end if;
  if p_user is null then raise exception 'Gebruiker ontbreekt.'; end if;
  if p_user = v_actor then raise exception 'Je kunt je eigen account niet verwijderen.'; end if;
  if exists (select 1 from upt_private.app_owners where user_id = p_user) then raise exception 'Een app-eigenaar kan niet via personeelsbeheer worden verwijderd.'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'Gebruiker niet gevonden.'; end if;
  insert into public.upt_audit_logs(actor_id, action, entity_type, entity_id, metadata) values (v_actor, 'admin_delete_user', 'profile', p_user, jsonb_build_object('mode','defensive_hard_delete'));
  update public.messages set sender_id = null where sender_id = p_user;
  delete from public.incidents where reporter_id = p_user;
  delete from public.time_corrections where corrected_by = p_user;
  delete from public.work_attachments where uploaded_by = p_user;
  delete from auth.users where id = p_user;
end;
$$;
revoke all on function public.upt_admin_delete_user(uuid) from public, anon;
grant execute on function public.upt_admin_delete_user(uuid) to authenticated;
