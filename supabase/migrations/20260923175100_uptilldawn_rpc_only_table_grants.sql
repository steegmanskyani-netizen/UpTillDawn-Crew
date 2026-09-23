-- Remove direct browser mutation grants from tables whose writes are intentionally RPC/trigger controlled.
-- SELECT remains available where RLS permits it. SECURITY DEFINER workflow functions execute as their owner.

REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.break_sessions,
  public.chat_channels,
  public.chat_members,
  public.crew_notifications,
  public.event_templates,
  public.shifts,
  public.tasks,
  public.upt_audit_logs,
  public.work_sessions,
  public.workplace_transitions
FROM authenticated;
