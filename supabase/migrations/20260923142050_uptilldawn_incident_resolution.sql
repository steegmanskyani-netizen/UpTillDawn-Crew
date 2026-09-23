-- Controlled incident acknowledgement and resolution.
-- Direct client writes remain disabled; these RPCs enforce the same admin/responsible scope as incident reads.

CREATE OR REPLACE FUNCTION public.upt_acknowledge_incident(p_incident uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_incident public.incidents%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Aanmelden vereist.'; END IF;

  SELECT * INTO v_incident FROM public.incidents WHERE id = p_incident FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Incident niet gevonden.'; END IF;

  IF NOT (public.upt_is_admin(v_actor) OR public.upt_is_responsible(v_incident.event_id, v_incident.workplace_id, v_actor)) THEN
    RAISE EXCEPTION 'Geen toegang.';
  END IF;

  IF v_incident.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'Incident is al opgelost.'; END IF;

  UPDATE public.incidents
  SET status = CASE WHEN status = 'open' THEN 'acknowledged' ELSE status END,
      acknowledged_by = COALESCE(acknowledged_by, v_actor),
      acknowledged_at = COALESCE(acknowledged_at, now()),
      updated_at = now()
  WHERE id = p_incident;

  INSERT INTO public.upt_audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_actor, 'INCIDENT_ACKNOWLEDGED', 'incident', p_incident, jsonb_build_object('previous_status', v_incident.status));
END;
$$;

CREATE OR REPLACE FUNCTION public.upt_resolve_incident(p_incident uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_incident public.incidents%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Aanmelden vereist.'; END IF;

  SELECT * INTO v_incident FROM public.incidents WHERE id = p_incident FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Incident niet gevonden.'; END IF;

  IF NOT (public.upt_is_admin(v_actor) OR public.upt_is_responsible(v_incident.event_id, v_incident.workplace_id, v_actor)) THEN
    RAISE EXCEPTION 'Geen toegang.';
  END IF;

  IF v_incident.resolved_at IS NOT NULL THEN RETURN; END IF;

  UPDATE public.incidents
  SET status = 'resolved',
      acknowledged_by = COALESCE(acknowledged_by, v_actor),
      acknowledged_at = COALESCE(acknowledged_at, now()),
      resolved_by = v_actor,
      resolved_at = now(),
      updated_at = now()
  WHERE id = p_incident;

  INSERT INTO public.upt_audit_logs(actor_id, action, entity_type, entity_id, metadata)
  VALUES (v_actor, 'INCIDENT_RESOLVED', 'incident', p_incident, jsonb_build_object('previous_status', v_incident.status));
END;
$$;

REVOKE ALL ON FUNCTION public.upt_acknowledge_incident(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upt_resolve_incident(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upt_acknowledge_incident(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upt_resolve_incident(uuid) TO authenticated;
