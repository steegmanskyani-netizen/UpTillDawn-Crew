-- UPTILLDAWN security/integrity hardening
-- Keep privileged time transitions behind authenticated RPC calls.

CREATE OR REPLACE FUNCTION public.upt_start_work(p_event UUID,p_shift UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE wid UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM event_members WHERE event_id=p_event AND user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Not an event member';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM check_ins WHERE event_id=p_event AND user_id=auth.uid() AND status='approved') THEN
    RAISE EXCEPTION 'Approved check-in required';
  END IF;
  IF p_shift IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM shifts WHERE id=p_shift AND event_id=p_event AND user_id=auth.uid() AND status <> 'cancelled'
  ) THEN RAISE EXCEPTION 'Invalid shift'; END IF;
  INSERT INTO work_sessions(event_id,user_id,shift_id) VALUES(p_event,auth.uid(),p_shift) RETURNING id INTO wid;
  INSERT INTO upt_audit_logs(actor_id,action,entity_type,entity_id) VALUES(auth.uid(),'START_WORK','work_session',wid);
  RETURN wid;
END $$;

CREATE OR REPLACE FUNCTION public.upt_start_break(p_work_session UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE bid UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM work_sessions WHERE id=p_work_session AND user_id=auth.uid() AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'No active work session';
  END IF;
  INSERT INTO break_sessions(work_session_id,user_id) VALUES(p_work_session,auth.uid()) RETURNING id INTO bid;
  INSERT INTO upt_audit_logs(actor_id,action,entity_type,entity_id) VALUES(auth.uid(),'START_BREAK','break_session',bid);
  RETURN bid;
END $$;

CREATE OR REPLACE FUNCTION public.upt_stop_break(p_break UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE break_sessions SET ended_at=now() WHERE id=p_break AND user_id=auth.uid() AND ended_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active break'; END IF;
  INSERT INTO upt_audit_logs(actor_id,action,entity_type,entity_id) VALUES(auth.uid(),'STOP_BREAK','break_session',p_break);
END $$;

CREATE OR REPLACE FUNCTION public.upt_stop_work(p_work_session UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE break_sessions SET ended_at=now() WHERE work_session_id=p_work_session AND user_id=auth.uid() AND ended_at IS NULL;
  UPDATE work_sessions SET ended_at=now(),status='completed' WHERE id=p_work_session AND user_id=auth.uid() AND ended_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active work session'; END IF;
  INSERT INTO upt_audit_logs(actor_id,action,entity_type,entity_id) VALUES(auth.uid(),'STOP_WORK','work_session',p_work_session);
END $$;

REVOKE ALL ON FUNCTION public.upt_start_work(UUID,UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upt_start_break(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upt_stop_break(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upt_stop_work(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upt_start_work(UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upt_start_break(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upt_stop_break(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upt_stop_work(UUID) TO authenticated;

-- Approval rows must stay internally consistent.
ALTER TABLE check_ins DROP CONSTRAINT IF EXISTS check_ins_remote_selfie_required;
ALTER TABLE check_ins ADD CONSTRAINT check_ins_remote_selfie_required CHECK (NOT remote OR selfie_path IS NOT NULL);
ALTER TABLE check_ins DROP CONSTRAINT IF EXISTS check_ins_decision_consistent;
ALTER TABLE check_ins ADD CONSTRAINT check_ins_decision_consistent CHECK (
  (status='pending' AND decided_at IS NULL AND decided_by IS NULL) OR
  (status IN ('approved','rejected','cancelled') AND decided_at IS NOT NULL AND decided_by IS NOT NULL)
);
ALTER TABLE check_outs DROP CONSTRAINT IF EXISTS check_outs_decision_consistent;
ALTER TABLE check_outs ADD CONSTRAINT check_outs_decision_consistent CHECK (
  (status='pending' AND decided_at IS NULL AND decided_by IS NULL) OR
  (status IN ('approved','rejected','cancelled') AND decided_at IS NOT NULL AND decided_by IS NOT NULL)
);
