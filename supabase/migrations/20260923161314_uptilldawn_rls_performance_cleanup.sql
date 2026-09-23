-- RLS/index cleanup from Supabase performance advisor.
-- Semantics stay the same while auth.uid() is evaluated once per statement and
-- management policies no longer overlap SELECT policies.

DROP INDEX IF EXISTS public.work_sessions_one_active_per_user_idx;

ALTER POLICY work_sessions_read ON public.work_sessions
USING (
  user_id = (SELECT auth.uid())
  OR public.upt_is_admin()
  OR EXISTS (
    SELECT 1 FROM public.shifts s
    WHERE s.id = work_sessions.shift_id
      AND public.upt_is_responsible(s.event_id, s.workplace_id)
  )
);

ALTER POLICY break_sessions_read ON public.break_sessions
USING (
  user_id = (SELECT auth.uid())
  OR public.upt_is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.work_sessions ws
    JOIN public.shifts s ON s.id = ws.shift_id
    WHERE ws.id = break_sessions.work_session_id
      AND public.upt_is_responsible(s.event_id, s.workplace_id)
  )
);

ALTER POLICY personal_instructions_read ON public.personal_instructions
USING (
  user_id = (SELECT auth.uid())
  OR public.upt_is_admin((SELECT auth.uid()))
);

ALTER POLICY shifts_read ON public.shifts
USING (
  user_id = (SELECT auth.uid())
  OR public.upt_is_admin()
  OR public.upt_is_responsible(event_id, workplace_id)
);

ALTER POLICY notifications_read ON public.crew_notifications
USING (
  user_id = (SELECT auth.uid())
  OR public.upt_is_admin()
);

ALTER POLICY notifications_update ON public.crew_notifications
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

ALTER POLICY transitions_read ON public.workplace_transitions
USING (
  user_id = (SELECT auth.uid())
  OR public.upt_is_admin()
  OR EXISTS (
    SELECT 1 FROM public.work_sessions ws
    WHERE ws.id = workplace_transitions.work_session_id
      AND public.upt_is_responsible(ws.event_id, workplace_transitions.to_workplace_id)
  )
);

ALTER POLICY personal_instruction_ack_read ON public.personal_instruction_acknowledgements
USING (
  user_id = (SELECT auth.uid())
  OR public.upt_is_admin((SELECT auth.uid()))
);

ALTER POLICY acknowledgement_read ON public.briefing_acknowledgements
USING (
  user_id = (SELECT auth.uid())
  OR public.upt_is_admin()
);

ALTER POLICY acknowledgement_insert ON public.briefing_acknowledgements
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.briefings b
    WHERE b.id = briefing_acknowledgements.briefing_id
      AND b.version = briefing_acknowledgements.version
  )
);

ALTER POLICY incidents_read ON public.incidents
USING (
  reporter_id = (SELECT auth.uid())
  OR public.upt_is_admin()
  OR public.upt_is_responsible(event_id, workplace_id)
);

ALTER POLICY incidents_create ON public.incidents
WITH CHECK (
  reporter_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.event_members em
    WHERE em.event_id = incidents.event_id
      AND em.user_id = (SELECT auth.uid())
  )
);

ALTER POLICY chat_members_read ON public.chat_members
USING (
  user_id = (SELECT auth.uid())
  OR public.upt_is_admin((SELECT auth.uid()))
);

ALTER POLICY message_attachments_insert ON public.message_attachments
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_attachments.message_id
      AND m.sender_id = (SELECT auth.uid())
  )
);

ALTER POLICY time_corrections_admin_read ON public.time_corrections
USING (public.upt_is_admin((SELECT auth.uid())));

ALTER POLICY checkins_read ON public.check_ins
USING (
  user_id = (SELECT auth.uid())
  OR public.upt_is_admin((SELECT auth.uid()))
  OR public.upt_is_responsible(event_id, workplace_id, (SELECT auth.uid()))
);

ALTER POLICY checkouts_read ON public.check_outs
USING (
  user_id = (SELECT auth.uid())
  OR public.upt_is_admin((SELECT auth.uid()))
  OR (
    workplace_id IS NOT NULL
    AND public.upt_is_responsible(event_id, workplace_id, (SELECT auth.uid()))
  )
);

ALTER POLICY messages_insert ON public.messages
WITH CHECK (
  sender_id = (SELECT auth.uid())
  AND user_id = (SELECT auth.uid())
  AND public.upt_can_read_channel(channel_id)
);

ALTER POLICY offline_own_read ON public.offline_operation_records
USING (
  user_id = (SELECT auth.uid())
  OR public.upt_is_admin()
);

ALTER POLICY event_members_read ON public.event_members
USING (
  user_id = (SELECT auth.uid())
  OR public.upt_is_admin()
  OR public.upt_is_responsible(event_id, NULL::uuid)
);

ALTER POLICY events_read ON public.events
USING (
  public.upt_is_admin()
  OR EXISTS (
    SELECT 1 FROM public.event_members em
    WHERE em.event_id = events.id
      AND em.user_id = (SELECT auth.uid())
  )
);

ALTER POLICY responsible_read ON public.responsible_assignments
USING (
  user_id = (SELECT auth.uid())
  OR public.upt_is_admin()
  OR EXISTS (
    SELECT 1 FROM public.event_members em
    WHERE em.event_id = responsible_assignments.event_id
      AND em.user_id = (SELECT auth.uid())
  )
);

ALTER POLICY workplaces_read ON public.workplaces
USING (
  public.upt_is_admin()
  OR EXISTS (
    SELECT 1 FROM public.event_members em
    WHERE em.event_id = workplaces.event_id
      AND em.user_id = (SELECT auth.uid())
  )
);

-- Replace permissive ALL policies with command-specific management policies so
-- SELECT has one permissive path per table.

DROP POLICY briefing_manage ON public.briefings;
CREATE POLICY briefing_manage_insert ON public.briefings FOR INSERT TO authenticated
WITH CHECK (public.upt_is_admin() OR (workplace_id IS NOT NULL AND public.upt_is_responsible(event_id, workplace_id)));
CREATE POLICY briefing_manage_update ON public.briefings FOR UPDATE TO authenticated
USING (public.upt_is_admin() OR (workplace_id IS NOT NULL AND public.upt_is_responsible(event_id, workplace_id)))
WITH CHECK (public.upt_is_admin() OR (workplace_id IS NOT NULL AND public.upt_is_responsible(event_id, workplace_id)));
CREATE POLICY briefing_manage_delete ON public.briefings FOR DELETE TO authenticated
USING (public.upt_is_admin() OR (workplace_id IS NOT NULL AND public.upt_is_responsible(event_id, workplace_id)));

DROP POLICY chat_members_admin ON public.chat_members;
CREATE POLICY chat_members_admin_insert ON public.chat_members FOR INSERT TO authenticated
WITH CHECK (public.upt_is_admin((SELECT auth.uid())));
CREATE POLICY chat_members_admin_update ON public.chat_members FOR UPDATE TO authenticated
USING (public.upt_is_admin((SELECT auth.uid())))
WITH CHECK (public.upt_is_admin((SELECT auth.uid())));
CREATE POLICY chat_members_admin_delete ON public.chat_members FOR DELETE TO authenticated
USING (public.upt_is_admin((SELECT auth.uid())));

DROP POLICY event_members_admin ON public.event_members;
CREATE POLICY event_members_admin_insert ON public.event_members FOR INSERT TO authenticated
WITH CHECK (public.upt_is_admin());
CREATE POLICY event_members_admin_update ON public.event_members FOR UPDATE TO authenticated
USING (public.upt_is_admin()) WITH CHECK (public.upt_is_admin());
CREATE POLICY event_members_admin_delete ON public.event_members FOR DELETE TO authenticated
USING (public.upt_is_admin());

DROP POLICY events_admin ON public.events;
CREATE POLICY events_admin_insert ON public.events FOR INSERT TO authenticated
WITH CHECK (public.upt_is_admin());
CREATE POLICY events_admin_update ON public.events FOR UPDATE TO authenticated
USING (public.upt_is_admin()) WITH CHECK (public.upt_is_admin());
CREATE POLICY events_admin_delete ON public.events FOR DELETE TO authenticated
USING (public.upt_is_admin());

DROP POLICY personal_instructions_admin_manage ON public.personal_instructions;
CREATE POLICY personal_instructions_admin_insert ON public.personal_instructions FOR INSERT TO authenticated
WITH CHECK (public.upt_is_admin((SELECT auth.uid())));
CREATE POLICY personal_instructions_admin_update ON public.personal_instructions FOR UPDATE TO authenticated
USING (public.upt_is_admin((SELECT auth.uid())))
WITH CHECK (public.upt_is_admin((SELECT auth.uid())));
CREATE POLICY personal_instructions_admin_delete ON public.personal_instructions FOR DELETE TO authenticated
USING (public.upt_is_admin((SELECT auth.uid())));

DROP POLICY responsible_admin ON public.responsible_assignments;
CREATE POLICY responsible_admin_insert ON public.responsible_assignments FOR INSERT TO authenticated
WITH CHECK (public.upt_is_admin());
CREATE POLICY responsible_admin_update ON public.responsible_assignments FOR UPDATE TO authenticated
USING (public.upt_is_admin()) WITH CHECK (public.upt_is_admin());
CREATE POLICY responsible_admin_delete ON public.responsible_assignments FOR DELETE TO authenticated
USING (public.upt_is_admin());

DROP POLICY shifts_admin ON public.shifts;
CREATE POLICY shifts_admin_insert ON public.shifts FOR INSERT TO authenticated
WITH CHECK (public.upt_is_admin());
CREATE POLICY shifts_admin_update ON public.shifts FOR UPDATE TO authenticated
USING (public.upt_is_admin()) WITH CHECK (public.upt_is_admin());
CREATE POLICY shifts_admin_delete ON public.shifts FOR DELETE TO authenticated
USING (public.upt_is_admin());

DROP POLICY task_assignments_admin_manage ON public.task_assignments;
DROP POLICY task_assignments_read_own ON public.task_assignments;
DROP POLICY task_assignments_responsible_read ON public.task_assignments;
CREATE POLICY task_assignments_read ON public.task_assignments FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR public.upt_is_admin((SELECT auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_assignments.task_id
      AND t.workplace_id IS NOT NULL
      AND public.upt_is_responsible(t.event_id, t.workplace_id, (SELECT auth.uid()))
  )
);
CREATE POLICY task_assignments_admin_insert ON public.task_assignments FOR INSERT TO authenticated
WITH CHECK (public.upt_is_admin((SELECT auth.uid())));
CREATE POLICY task_assignments_admin_update ON public.task_assignments FOR UPDATE TO authenticated
USING (public.upt_is_admin((SELECT auth.uid())))
WITH CHECK (public.upt_is_admin((SELECT auth.uid())));
CREATE POLICY task_assignments_admin_delete ON public.task_assignments FOR DELETE TO authenticated
USING (public.upt_is_admin((SELECT auth.uid())));

DROP POLICY tasks_manage ON public.tasks;
CREATE POLICY tasks_manage_insert ON public.tasks FOR INSERT TO authenticated
WITH CHECK (public.upt_is_admin() OR (workplace_id IS NOT NULL AND public.upt_is_responsible(event_id, workplace_id)));
CREATE POLICY tasks_manage_update ON public.tasks FOR UPDATE TO authenticated
USING (public.upt_is_admin() OR (workplace_id IS NOT NULL AND public.upt_is_responsible(event_id, workplace_id)))
WITH CHECK (public.upt_is_admin() OR (workplace_id IS NOT NULL AND public.upt_is_responsible(event_id, workplace_id)));
CREATE POLICY tasks_manage_delete ON public.tasks FOR DELETE TO authenticated
USING (public.upt_is_admin() OR (workplace_id IS NOT NULL AND public.upt_is_responsible(event_id, workplace_id)));

DROP POLICY workplaces_admin ON public.workplaces;
CREATE POLICY workplaces_admin_insert ON public.workplaces FOR INSERT TO authenticated
WITH CHECK (public.upt_is_admin());
CREATE POLICY workplaces_admin_update ON public.workplaces FOR UPDATE TO authenticated
USING (public.upt_is_admin()) WITH CHECK (public.upt_is_admin());
CREATE POLICY workplaces_admin_delete ON public.workplaces FOR DELETE TO authenticated
USING (public.upt_is_admin());
