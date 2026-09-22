-- UPTILLDAWN RLS hardening
-- Remove legacy permissive policies that bypass the newer scoped policies.

-- ============================================================
-- EVENTS
-- ============================================================

DROP POLICY IF EXISTS "Admins can manage all events."
ON public.events;

DROP POLICY IF EXISTS "Authenticated users can view events."
ON public.events;

-- Keep:
-- events_admin
-- events_read


-- ============================================================
-- WORKPLACES
-- ============================================================

DROP POLICY IF EXISTS "Admins can manage all workplaces."
ON public.workplaces;

DROP POLICY IF EXISTS "Authenticated users can view workplaces for their events."
ON public.workplaces;

-- Keep:
-- workplaces_admin
-- workplaces_read


-- ============================================================
-- SHIFTS
-- ============================================================

DROP POLICY IF EXISTS "Admins can manage all shifts."
ON public.shifts;

DROP POLICY IF EXISTS "Users can view their own shifts."
ON public.shifts;

-- Keep:
-- shifts_admin
-- shifts_read


-- ============================================================
-- CHECK-INS
-- ============================================================

DROP POLICY IF EXISTS "Admins and responsible leads can manage check-ins."
ON public.check_ins;

DROP POLICY IF EXISTS "Users can manage their own check-ins."
ON public.check_ins;

-- Keep scoped policies:
-- checkins_insert
-- checkins_manage
-- checkins_read


-- ============================================================
-- INCIDENTS
-- ============================================================

DROP POLICY IF EXISTS "Admins and responsible leads can manage incidents."
ON public.incidents;

DROP POLICY IF EXISTS "Users can create incidents."
ON public.incidents;

DROP POLICY IF EXISTS "Users can view incidents they created."
ON public.incidents;

-- Keep:
-- incidents_create
-- incidents_manage
-- incidents_read


-- ============================================================
-- WORK SESSIONS
-- ============================================================

DROP POLICY IF EXISTS "Admins can manage all work sessions."
ON public.work_sessions;

DROP POLICY IF EXISTS "Users can view their own work sessions."
ON public.work_sessions;

-- Keep work_sessions_read.
-- Work-session mutations should go through the server-authoritative RPCs.


-- ============================================================
-- BREAK SESSIONS
-- ============================================================

DROP POLICY IF EXISTS "Admins can manage all break sessions."
ON public.break_sessions;

DROP POLICY IF EXISTS "Users can view their own break sessions."
ON public.break_sessions;

-- Keep break_sessions_read.
-- Break mutations should go through server-authoritative RPCs.


-- ============================================================
-- LEGACY GENERAL CHAT POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can send general chat messages."
ON public.messages;

DROP POLICY IF EXISTS "Authenticated users can view general chat messages."
ON public.messages;

-- Keep channel-based messages_insert / messages_read.


-- ============================================================
-- MESSAGE ATTACHMENTS
-- ============================================================

DROP POLICY IF EXISTS "Users can view attachments for messages they can see."
ON public.message_attachments;

DROP POLICY IF EXISTS message_attachments_read
ON public.message_attachments;

CREATE POLICY message_attachments_read
ON public.message_attachments
FOR SELECT
USING (
  public.upt_is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.id = message_attachments.message_id
      AND (
        m.sender_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.chat_channels c
          WHERE c.id = m.channel_id
            AND (
              EXISTS (
                SELECT 1
                FROM public.chat_members cm
                WHERE cm.channel_id = c.id
                  AND cm.user_id = auth.uid()
              )
              OR (
                c.kind = 'organization'
                AND EXISTS (
                  SELECT 1
                  FROM public.profiles p
                  WHERE p.id = auth.uid()
                    AND p.approved = true
                )
              )
              OR (
                c.event_id IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM public.event_members em
                  WHERE em.event_id = c.event_id
                    AND em.user_id = auth.uid()
                )
              )
            )
        )
      )
  )
);

