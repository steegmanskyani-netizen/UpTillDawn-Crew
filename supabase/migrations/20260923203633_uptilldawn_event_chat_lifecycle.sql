-- Event-scoped chats, workplace chat authorization, and a three-day post-event chat window.

CREATE SCHEMA IF NOT EXISTS upt_private;
REVOKE ALL ON SCHEMA upt_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA upt_private TO authenticated;

CREATE OR REPLACE FUNCTION upt_private.event_operational(p_event uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = p_event
      AND now() <= e.end_at
  );
$$;

REVOKE ALL ON FUNCTION upt_private.event_operational(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION upt_private.event_operational(uuid) TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS chat_channels_one_event_general
ON public.chat_channels(event_id)
WHERE kind = 'event';

CREATE UNIQUE INDEX IF NOT EXISTS chat_channels_one_workplace
ON public.chat_channels(workplace_id)
WHERE kind = 'workplace';

CREATE OR REPLACE FUNCTION public.upt_seed_workplace_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_name text;
BEGIN
  SELECT e.name
  INTO v_event_name
  FROM public.events e
  WHERE e.id = NEW.event_id;

  IF v_event_name IS NULL THEN
    RAISE EXCEPTION 'Event niet gevonden voor werkplekchat.';
  END IF;

  INSERT INTO public.chat_channels(kind, event_id, workplace_id, name)
  VALUES ('workplace', NEW.event_id, NEW.id, v_event_name || ' - ' || NEW.name)
  ON CONFLICT DO NOTHING;

  UPDATE public.chat_channels
  SET event_id = NEW.event_id,
      name = v_event_name || ' - ' || NEW.name
  WHERE kind = 'workplace'
    AND workplace_id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.upt_seed_workplace_chat() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS upt_seed_workplace_chat ON public.workplaces;
CREATE TRIGGER upt_seed_workplace_chat
AFTER INSERT OR UPDATE OF name, event_id
ON public.workplaces
FOR EACH ROW
EXECUTE FUNCTION public.upt_seed_workplace_chat();

CREATE OR REPLACE FUNCTION public.upt_seed_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.workplaces(event_id, name, sort_order)
  SELECT NEW.id, n, ord::integer
  FROM unnest(ARRAY[
    'Ticket Scan','Guest List','Artists','Merch','Bar/Toog',
    'Backstage Management','Allrounder','Setup','Breakdown'
  ]) WITH ORDINALITY x(n, ord);

  INSERT INTO public.chat_channels(kind, event_id, name)
  VALUES ('event', NEW.id, NEW.name || ' - algemene chat')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.upt_seed_event() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.upt_sync_event_chat_names()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.chat_channels
  SET name = NEW.name || ' - algemene chat'
  WHERE kind = 'event'
    AND event_id = NEW.id;

  UPDATE public.chat_channels c
  SET name = NEW.name || ' - ' || w.name
  FROM public.workplaces w
  WHERE c.kind = 'workplace'
    AND c.event_id = NEW.id
    AND c.workplace_id = w.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.upt_sync_event_chat_names() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS upt_sync_event_chat_names ON public.events;
CREATE TRIGGER upt_sync_event_chat_names
AFTER UPDATE OF name
ON public.events
FOR EACH ROW
WHEN (OLD.name IS DISTINCT FROM NEW.name)
EXECUTE FUNCTION public.upt_sync_event_chat_names();

UPDATE public.chat_channels
SET name = 'Algemene chat'
WHERE kind = 'organization';

INSERT INTO public.chat_channels(kind, event_id, name)
SELECT 'event', e.id, e.name || ' - algemene chat'
FROM public.events e
WHERE NOT EXISTS (
  SELECT 1
  FROM public.chat_channels c
  WHERE c.kind = 'event'
    AND c.event_id = e.id
);

INSERT INTO public.chat_channels(kind, event_id, workplace_id, name)
SELECT 'workplace', w.event_id, w.id, e.name || ' - ' || w.name
FROM public.workplaces w
JOIN public.events e ON e.id = w.event_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.chat_channels c
  WHERE c.kind = 'workplace'
    AND c.workplace_id = w.id
);

UPDATE public.chat_channels c
SET name = e.name || ' - algemene chat'
FROM public.events e
WHERE c.kind = 'event'
  AND c.event_id = e.id;

UPDATE public.chat_channels c
SET name = e.name || ' - ' || w.name
FROM public.workplaces w
JOIN public.events e ON e.id = w.event_id
WHERE c.kind = 'workplace'
  AND c.workplace_id = w.id;

CREATE OR REPLACE FUNCTION public.upt_can_read_channel(p_channel uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.upt_is_approved()
    AND EXISTS (
      SELECT 1
      FROM public.chat_channels c
      WHERE c.id = p_channel
        AND (
          public.upt_is_admin()
          OR c.kind = 'organization'
          OR (
            c.kind = 'private'
            AND EXISTS (
              SELECT 1
              FROM public.chat_members m
              WHERE m.channel_id = c.id
                AND m.user_id = auth.uid()
            )
          )
          OR (
            c.kind = 'event'
            AND c.event_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.events e
              WHERE e.id = c.event_id
                AND now() <= e.end_at + interval '3 days'
            )
            AND (
              EXISTS (
                SELECT 1
                FROM public.event_members m
                WHERE m.event_id = c.event_id
                  AND m.user_id = auth.uid()
              )
              OR EXISTS (
                SELECT 1
                FROM public.shifts s
                WHERE s.event_id = c.event_id
                  AND s.user_id = auth.uid()
                  AND s.status <> 'cancelled'
              )
              OR EXISTS (
                SELECT 1
                FROM public.responsible_assignments r
                WHERE r.event_id = c.event_id
                  AND r.user_id = auth.uid()
              )
            )
          )
          OR (
            c.kind = 'workplace'
            AND c.event_id IS NOT NULL
            AND c.workplace_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.events e
              WHERE e.id = c.event_id
                AND now() <= e.end_at + interval '3 days'
            )
            AND (
              public.upt_is_responsible(c.event_id, c.workplace_id)
              OR EXISTS (
                SELECT 1
                FROM public.shifts s
                WHERE s.event_id = c.event_id
                  AND s.workplace_id = c.workplace_id
                  AND s.user_id = auth.uid()
                  AND s.status <> 'cancelled'
              )
            )
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION public.upt_can_read_channel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upt_can_read_channel(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.upt_can_access_workplace(p_event uuid, p_workplace uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.upt_is_approved()
    AND (
      public.upt_is_admin()
      OR (
        upt_private.event_operational(p_event)
        AND (
          public.upt_is_responsible(p_event, p_workplace)
          OR (
            p_workplace IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.event_members m
              WHERE m.event_id = p_event
                AND m.user_id = auth.uid()
            )
          )
          OR (
            p_workplace IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.shifts s
              WHERE s.event_id = p_event
                AND s.workplace_id = p_workplace
                AND s.user_id = auth.uid()
                AND s.status <> 'cancelled'
            )
          )
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.upt_can_access_workplace(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upt_can_access_workplace(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS upt_event_visibility_window ON public.events;
CREATE POLICY upt_event_visibility_window
ON public.events
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.upt_is_admin()
  OR now() <= end_at + interval '3 days'
);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workplaces',
    'event_members',
    'responsible_assignments',
    'shifts',
    'briefings',
    'tasks',
    'check_ins',
    'check_outs',
    'work_sessions',
    'incidents',
    'personal_instructions'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS upt_event_operational_window ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY upt_event_operational_window ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.upt_is_admin() OR upt_private.event_operational(event_id))',
      t
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS upt_event_operational_window ON public.break_sessions;
CREATE POLICY upt_event_operational_window
ON public.break_sessions
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.upt_is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.work_sessions ws
    WHERE ws.id = break_sessions.work_session_id
      AND upt_private.event_operational(ws.event_id)
  )
);

DROP POLICY IF EXISTS upt_event_operational_window ON public.workplace_transitions;
CREATE POLICY upt_event_operational_window
ON public.workplace_transitions
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.upt_is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.work_sessions ws
    WHERE ws.id = workplace_transitions.work_session_id
      AND upt_private.event_operational(ws.event_id)
  )
);

DROP POLICY IF EXISTS upt_event_operational_window ON public.briefing_acknowledgements;
CREATE POLICY upt_event_operational_window
ON public.briefing_acknowledgements
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.upt_is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.briefings b
    WHERE b.id = briefing_acknowledgements.briefing_id
      AND upt_private.event_operational(b.event_id)
  )
);

DROP POLICY IF EXISTS upt_event_operational_window ON public.task_assignments;
CREATE POLICY upt_event_operational_window
ON public.task_assignments
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.upt_is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.id = task_assignments.task_id
      AND upt_private.event_operational(t.event_id)
  )
);

DROP POLICY IF EXISTS upt_event_operational_window ON public.personal_instruction_acknowledgements;
CREATE POLICY upt_event_operational_window
ON public.personal_instruction_acknowledgements
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.upt_is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.personal_instructions pi
    WHERE pi.id = personal_instruction_acknowledgements.instruction_id
      AND upt_private.event_operational(pi.event_id)
  )
);
