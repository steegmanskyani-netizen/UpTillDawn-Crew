create or replace function public.upt_extract_facebook_event_image()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare marker constant text := '#upt-image='; pos integer;
begin
  if new.facebook_event_url is not null then
    pos := strpos(new.facebook_event_url, marker);
    if pos > 0 then
      if coalesce(new.image_url,'') = '' then new.image_url := substr(new.facebook_event_url, pos + length(marker)); end if;
      new.facebook_event_url := left(new.facebook_event_url, pos - 1);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists upt_events_extract_facebook_image on public.events;
create trigger upt_events_extract_facebook_image before insert or update of facebook_event_url on public.events for each row execute function public.upt_extract_facebook_event_image();
revoke all on function public.upt_extract_facebook_event_image() from public, anon, authenticated;
