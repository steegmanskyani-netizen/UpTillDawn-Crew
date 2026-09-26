create or replace function public.upt_admin_set_account(p_user uuid,p_approved boolean,p_role text)
returns void language plpgsql security definer set search_path to 'pg_catalog','public','upt_private','auth' as $$
begin
 if not public.upt_is_admin() then raise exception 'Not authorized'; end if;
 if p_role='__delete__' then
  if p_user=auth.uid() then raise exception 'Je kunt je eigen account niet verwijderen.'; end if;
  if upt_private.is_app_owner(p_user) then raise exception 'Een app-eigenaar kan niet via personeelsbeheer worden verwijderd.'; end if;
  if not exists(select 1 from auth.users where id=p_user) then raise exception 'Gebruiker niet gevonden.'; end if;
  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'admin_delete_user','profile',p_user,jsonb_build_object('mode','defensive_hard_delete'));
  update public.messages set sender_id=null where sender_id=p_user;
  delete from public.incidents where reporter_id=p_user;
  delete from public.time_corrections where corrected_by=p_user;
  delete from public.work_attachments where uploaded_by=p_user;
  delete from auth.users where id=p_user;
  return;
 end if;
 if p_role not in ('admin','responsible_lead','staff') or p_role is null or p_approved is null then raise exception 'Invalid role'; end if;
 if upt_private.is_app_owner(p_user) and not p_approved then raise exception 'De maker van de app kan niet worden gedeactiveerd.'; end if;
 if p_user=auth.uid() and not upt_private.is_app_owner(p_user) and (not p_approved or p_role<>'admin') then raise exception 'Cannot revoke own admin access'; end if;
 update public.profiles set approved=case when upt_private.is_app_owner(p_user) then true else p_approved end,role=p_role where id=p_user;
 if not found then raise exception 'Profile not found'; end if;
 if upt_private.is_app_owner(p_user) then insert into public.admin_role_modes(user_id,active_role,updated_at) values(p_user,p_role,now()) on conflict(user_id) do update set active_role=excluded.active_role,updated_at=excluded.updated_at; end if;
end;$$;
drop function if exists public.upt_admin_delete_user(uuid);
