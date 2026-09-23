-- Rich in-app notifications with safe links and controlled read acknowledgements.

ALTER TABLE public.crew_notifications
ADD COLUMN IF NOT EXISTS link text;

ALTER TABLE public.crew_notifications
DROP CONSTRAINT IF EXISTS crew_notifications_link_check;

ALTER TABLE public.crew_notifications
ADD CONSTRAINT crew_notifications_link_check
CHECK (link IS NULL OR (length(link) <= 500 AND left(link,1) = '/'));

REVOKE UPDATE ON public.crew_notifications FROM authenticated;
GRANT UPDATE(read_at) ON public.crew_notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.upt_mark_notification_read(p_notification uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.upt_is_approved() THEN
    RAISE EXCEPTION 'ACCOUNT NOT APPROVED';
  END IF;

  UPDATE public.crew_notifications
  SET read_at = coalesce(read_at, now())
  WHERE id = p_notification
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Melding niet gevonden.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.upt_notify_briefing_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.crew_notifications(user_id,title,body,kind,link)
  SELECT DISTINCT
    p.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'Nieuwe briefing' ELSE 'Briefing gewijzigd' END,
    NEW.title,
    'briefing',
    '/briefings'
  FROM public.profiles p
  WHERE p.approved = true
    AND (
      public.upt_is_admin(p.id)
      OR (
        NEW.workplace_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.event_members em
          WHERE em.event_id = NEW.event_id AND em.user_id = p.id
        )
      )
      OR (
        NEW.workplace_id IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.shifts s
            WHERE s.event_id = NEW.event_id
              AND s.workplace_id = NEW.workplace_id
              AND s.user_id = p.id
              AND s.status <> 'cancelled'
          )
          OR EXISTS (
            SELECT 1 FROM public.responsible_assignments r
            WHERE r.event_id = NEW.event_id
              AND r.workplace_id = NEW.workplace_id
              AND r.user_id = p.id
          )
        )
      )
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS upt_briefing_notify ON public.briefings;
CREATE TRIGGER upt_briefing_notify
AFTER INSERT OR UPDATE OF title,body,required,version
ON public.briefings
FOR EACH ROW
EXECUTE FUNCTION public.upt_notify_briefing_change();

CREATE OR REPLACE FUNCTION public.upt_notify_personal_instruction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.crew_notifications(user_id,title,body,kind,link)
  VALUES (
    NEW.user_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'Nieuwe persoonlijke instructie' ELSE 'Persoonlijke instructie gewijzigd' END,
    NEW.title,
    'personal_instruction',
    '/briefings'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS upt_personal_instruction_notify ON public.personal_instructions;
CREATE TRIGGER upt_personal_instruction_notify
AFTER INSERT OR UPDATE OF title,body,required,version
ON public.personal_instructions
FOR EACH ROW
EXECUTE FUNCTION public.upt_notify_personal_instruction();

CREATE OR REPLACE FUNCTION public.upt_notify_task_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_title text;
BEGIN
  SELECT t.title INTO v_title
  FROM public.tasks t
  WHERE t.id = NEW.task_id;

  INSERT INTO public.crew_notifications(user_id,title,body,kind,link)
  VALUES (NEW.user_id, 'Nieuwe taak', v_title, 'task', '/tasks');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS upt_task_assignment_notify ON public.task_assignments;
CREATE TRIGGER upt_task_assignment_notify
AFTER INSERT
ON public.task_assignments
FOR EACH ROW
EXECUTE FUNCTION public.upt_notify_task_assignment();

REVOKE ALL ON FUNCTION public.upt_mark_notification_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upt_notify_briefing_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upt_notify_personal_instruction() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upt_notify_task_assignment() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.upt_mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upt_notify_briefing_change() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.upt_notify_personal_instruction() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.upt_notify_task_assignment() TO postgres, service_role;
