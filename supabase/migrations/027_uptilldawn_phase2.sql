-- UPTILLDAWN Phase 2: integrity and account approval helpers
CREATE OR REPLACE FUNCTION prevent_shift_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.overlap_allowed = false AND EXISTS (
   SELECT 1 FROM shifts s WHERE s.user_id=NEW.user_id AND s.id<>NEW.id AND s.status<>'cancelled'
   AND s.overlap_allowed=false AND tstzrange(s.scheduled_start,s.scheduled_end,'[)') && tstzrange(NEW.scheduled_start,NEW.scheduled_end,'[)')
 ) THEN RAISE EXCEPTION 'Shift overlaps an existing assignment'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_prevent_shift_overlap ON shifts;
CREATE TRIGGER trg_prevent_shift_overlap BEFORE INSERT OR UPDATE OF user_id,scheduled_start,scheduled_end,overlap_allowed,status ON shifts FOR EACH ROW EXECUTE FUNCTION prevent_shift_overlap();
CREATE INDEX IF NOT EXISTS idx_event_members_event_user ON event_members(event_id,user_id);
CREATE INDEX IF NOT EXISTS idx_responsible_event_workplace ON responsible_assignments(event_id,workplace_id,user_id);
