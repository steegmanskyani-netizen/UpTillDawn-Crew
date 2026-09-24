create or replace function public.upt_create_incident(
  p_event uuid,
  p_workplace uuid,
  p_message text,
  p_photo_path text default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_accuracy_m numeric default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_actor uuid:=auth.uid();
  v_message text:=trim(coalesce(p_message,''));
  v_media text:=nullif(trim(coalesce(p_photo_path,'')),'');
  v_incident uuid;
  v_mime text;
begin
  if not public.upt_is_approved() then raise exception 'ACCOUNT NOT APPROVED'; end if;
  if not public.upt_feature_allowed('incidents',p_event,p_workplace) then raise exception 'Incidenten zijn alleen beschikbaar tijdens je actieve shift.'; end if;
  if length(v_message) not between 1 and 4000 then raise exception 'Ongeldige melding.'; end if;
  if not exists(select 1 from public.event_members em where em.event_id=p_event and em.user_id=v_actor) then raise exception 'Geen toegang tot event.'; end if;
  if p_workplace is not null and not exists(
    select 1 from public.shifts s where s.event_id=p_event and s.workplace_id=p_workplace and s.user_id=v_actor
      and s.status<>'cancelled' and now() between s.scheduled_start and s.scheduled_end
  ) then raise exception 'Geen toegang tot werkplek.'; end if;
  if v_media is not null then
    if split_part(v_media,'/',1)<>v_actor::text then raise exception 'Ongeldig mediapad.'; end if;
    select o.metadata->>'mimetype' into v_mime from storage.objects o where o.bucket_id='incident-photos' and o.name=v_media;
    if v_mime is null or v_mime not in ('image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime') then
      raise exception 'Ongeldige incidentmedia.';
    end if;
  end if;
  if (p_latitude is null)<>(p_longitude is null) then raise exception 'Onvolledige GPS-coördinaten.'; end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180) then raise exception 'Ongeldige GPS-coördinaten.'; end if;
  if p_accuracy_m is not null and p_accuracy_m<0 then raise exception 'Ongeldige GPS-nauwkeurigheid.'; end if;

  insert into public.incidents(user_id,reporter_id,event_id,workplace_id,message,description,photo_path,latitude,longitude,gps_accuracy_m)
  values(v_actor,v_actor,p_event,p_workplace,v_message,v_message,v_media,p_latitude,p_longitude,p_accuracy_m)
  returning id into v_incident;

  insert into public.crew_notifications(user_id,title,body,kind,link)
  select distinct p.id,'URGENT',v_incident::text,'incident','/incidents'
  from public.profiles p
  where p.approved and (
    public.upt_effective_role(p.id)='admin'
    or p.id=v_actor
    or (
      public.upt_effective_role(p.id)='responsible_lead'
      and exists (
        select 1 from public.responsible_assignments r
        join public.shifts s on s.event_id=r.event_id and s.workplace_id=r.workplace_id and s.user_id=p.id
        where r.user_id=p.id and r.event_id=p_event
          and (p_workplace is null or r.workplace_id=p_workplace)
          and s.status<>'cancelled'
          and now() between s.scheduled_start and s.scheduled_end
      )
    )
  );

  insert into public.upt_audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(v_actor,'URGENT','incidents',v_incident,jsonb_build_object('has_media',v_media is not null,'media_type',v_mime,'has_gps',p_latitude is not null,'gps_accuracy_m',p_accuracy_m));
  return v_incident;
end;
$$;

create or replace function public.upt_notify_check_decision()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if TG_OP='INSERT' then
    insert into public.crew_notifications(user_id,title,body,kind)
    select distinct
      p.id,
      case when TG_TABLE_NAME='check_ins' then 'Check-in aangevraagd' else 'Check-out aangevraagd' end,
      NEW.id::text,
      TG_TABLE_NAME
    from public.profiles p
    where p.approved
      and (
        public.upt_effective_role(p.id)='admin'
        or (
          public.upt_effective_role(p.id)='responsible_lead'
          and exists(
            select 1
            from public.responsible_assignments r
            where r.user_id=p.id
              and r.event_id=NEW.event_id
              and r.workplace_id=NEW.workplace_id
          )
        )
      );
  elsif NEW.status is distinct from OLD.status then
    insert into public.crew_notifications(user_id,title,body,kind)
    values(NEW.user_id,'Aanvraag: '||NEW.status,NEW.id::text,TG_TABLE_NAME);
  end if;
  return NEW;
end;
$$;

notify pgrst,'reload schema';
