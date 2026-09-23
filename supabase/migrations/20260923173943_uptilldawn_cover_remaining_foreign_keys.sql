-- Cover remaining public foreign-key columns reported by the Supabase advisor.
-- The database is still effectively empty, so regular CREATE INDEX is safe here.
-- These are single-column foreign keys; existing composite indexes are left untouched.

CREATE INDEX IF NOT EXISTS idx_fk_briefings_created_by ON public.briefings(created_by);
CREATE INDEX IF NOT EXISTS idx_fk_briefings_workplace_id ON public.briefings(workplace_id);

CREATE INDEX IF NOT EXISTS idx_fk_chat_channels_event_id ON public.chat_channels(event_id);
CREATE INDEX IF NOT EXISTS idx_fk_chat_channels_workplace_id ON public.chat_channels(workplace_id);

CREATE INDEX IF NOT EXISTS idx_fk_check_ins_approved_by ON public.check_ins(approved_by);
CREATE INDEX IF NOT EXISTS idx_fk_check_ins_decided_by ON public.check_ins(decided_by);

CREATE INDEX IF NOT EXISTS idx_fk_check_outs_decided_by ON public.check_outs(decided_by);
CREATE INDEX IF NOT EXISTS idx_fk_check_outs_event_id ON public.check_outs(event_id);

CREATE INDEX IF NOT EXISTS idx_fk_event_members_user_id ON public.event_members(user_id);
CREATE INDEX IF NOT EXISTS idx_fk_event_templates_created_by ON public.event_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_fk_events_created_by ON public.events(created_by);

CREATE INDEX IF NOT EXISTS idx_fk_incidents_acknowledged_by ON public.incidents(acknowledged_by);
CREATE INDEX IF NOT EXISTS idx_fk_incidents_reporter_id ON public.incidents(reporter_id);
CREATE INDEX IF NOT EXISTS idx_fk_incidents_resolved_by ON public.incidents(resolved_by);
CREATE INDEX IF NOT EXISTS idx_fk_incidents_responsible_lead_id ON public.incidents(responsible_lead_id);
CREATE INDEX IF NOT EXISTS idx_fk_incidents_user_id ON public.incidents(user_id);
CREATE INDEX IF NOT EXISTS idx_fk_incidents_workplace_id ON public.incidents(workplace_id);

CREATE INDEX IF NOT EXISTS idx_fk_messages_event_id ON public.messages(event_id);
CREATE INDEX IF NOT EXISTS idx_fk_messages_moderated_by ON public.messages(moderated_by);
CREATE INDEX IF NOT EXISTS idx_fk_messages_sender_id ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_fk_messages_user_id ON public.messages(user_id);
CREATE INDEX IF NOT EXISTS idx_fk_messages_workplace_id ON public.messages(workplace_id);

CREATE INDEX IF NOT EXISTS idx_fk_personal_instructions_created_by ON public.personal_instructions(created_by);
CREATE INDEX IF NOT EXISTS idx_fk_responsible_assignments_assigned_by ON public.responsible_assignments(assigned_by);
CREATE INDEX IF NOT EXISTS idx_fk_shifts_responsible_lead_id ON public.shifts(responsible_lead_id);
CREATE INDEX IF NOT EXISTS idx_fk_task_assignments_assigned_by ON public.task_assignments(assigned_by);

CREATE INDEX IF NOT EXISTS idx_fk_tasks_assigned_user_id ON public.tasks(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_fk_tasks_completed_by ON public.tasks(completed_by);
CREATE INDEX IF NOT EXISTS idx_fk_tasks_created_by ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_fk_tasks_workplace_id ON public.tasks(workplace_id);

CREATE INDEX IF NOT EXISTS idx_fk_time_corrections_corrected_by ON public.time_corrections(corrected_by);
CREATE INDEX IF NOT EXISTS idx_fk_upt_audit_logs_actor_id ON public.upt_audit_logs(actor_id);

CREATE INDEX IF NOT EXISTS idx_fk_workplace_transitions_from_workplace
  ON public.workplace_transitions(from_workplace_id);
CREATE INDEX IF NOT EXISTS idx_fk_workplace_transitions_to_workplace
  ON public.workplace_transitions(to_workplace_id);
CREATE INDEX IF NOT EXISTS idx_fk_workplace_transitions_user_id
  ON public.workplace_transitions(user_id);
