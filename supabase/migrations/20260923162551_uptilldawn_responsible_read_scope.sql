-- Responsible Leads must be able to read their assigned event/workplace without
-- becoming broad event members, while remaining scoped to assigned workplaces.

ALTER POLICY events_read ON public.events
USING (
  public.upt_is_admin()
  OR public.upt_is_responsible(id, NULL::uuid, (SELECT auth.uid()))
  OR EXISTS (
    SELECT 1
    FROM public.event_members em
    JOIN public.profiles p ON p.id = em.user_id
    WHERE em.event_id = events.id
      AND em.user_id = (SELECT auth.uid())
      AND p.approved = true
      AND p.role = 'staff'
  )
);

ALTER POLICY workplaces_read ON public.workplaces
USING (
  public.upt_is_admin()
  OR public.upt_is_responsible(event_id, id, (SELECT auth.uid()))
  OR EXISTS (
    SELECT 1
    FROM public.event_members em
    JOIN public.profiles p ON p.id = em.user_id
    WHERE em.event_id = workplaces.event_id
      AND em.user_id = (SELECT auth.uid())
      AND p.approved = true
      AND p.role = 'staff'
  )
);
