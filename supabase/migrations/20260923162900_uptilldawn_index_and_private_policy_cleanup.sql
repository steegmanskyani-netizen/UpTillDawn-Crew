-- Final pre-release database cleanup:
-- remove objectively redundant indexes, add covering indexes for hot operational
-- relations, and make the private break-warning table's deny-by-default RLS explicit.

DROP INDEX IF EXISTS public.idx_event_members_event_user;
DROP INDEX IF EXISTS public.task_assignments_task_idx;

CREATE INDEX IF NOT EXISTS briefing_ack_user_idx
  ON public.briefing_acknowledgements(user_id, briefing_id, version);

CREATE INDEX IF NOT EXISTS briefings_event_workplace_idx
  ON public.briefings(event_id, workplace_id);

CREATE INDEX IF NOT EXISTS chat_members_user_channel_idx
  ON public.chat_members(user_id, channel_id);

CREATE INDEX IF NOT EXISTS check_ins_workplace_status_idx
  ON public.check_ins(workplace_id, status);

CREATE INDEX IF NOT EXISTS crew_notifications_user_created_idx
  ON public.crew_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS incidents_event_workplace_status_created_idx
  ON public.incidents(event_id, workplace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS message_attachments_message_idx
  ON public.message_attachments(message_id);

CREATE INDEX IF NOT EXISTS offline_operations_user_synced_idx
  ON public.offline_operation_records(user_id, synced_at);

CREATE INDEX IF NOT EXISTS responsible_assignments_user_event_workplace_idx
  ON public.responsible_assignments(user_id, event_id, workplace_id);

CREATE INDEX IF NOT EXISTS shifts_workplace_start_idx
  ON public.shifts(workplace_id, scheduled_start);

CREATE INDEX IF NOT EXISTS upt_audit_logs_created_idx
  ON public.upt_audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS work_sessions_shift_idx
  ON public.work_sessions(shift_id);

CREATE INDEX IF NOT EXISTS workplace_transitions_session_confirmed_idx
  ON public.workplace_transitions(work_session_id, confirmed_at DESC);

CREATE INDEX IF NOT EXISTS break_sessions_work_session_started_idx
  ON public.break_sessions(work_session_id, started_at);

DROP POLICY IF EXISTS break_warning_receipts_client_deny
  ON upt_private.break_warning_receipts;
CREATE POLICY break_warning_receipts_client_deny
  ON upt_private.break_warning_receipts
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
