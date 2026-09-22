-- UPTILLDAWN Crew Management — Phase 1 core schema
-- Additive migration: preserves StaffPortal tables while introducing the event-crew domain.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'responsible_lead';

DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('pending','approved','rejected','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('draft','published','active','completed','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE shift_status AS ENUM ('scheduled','confirmed','active','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE incident_status AS ENUM ('open','acknowledged','in_progress','resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS account_status account_status NOT NULL DEFAULT 'pending';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS national_register_number TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS iban TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Preserve access for already-existing installations; new registrations remain pending.
UPDATE user_profiles SET account_status='approved' WHERE created_at < now() AND is_active=true AND account_status='pending';

CREATE TABLE IF NOT EXISTS events (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name TEXT NOT NULL, description TEXT, venue TEXT, address TEXT,
 latitude NUMERIC(9,6), longitude NUMERIC(9,6), timezone TEXT NOT NULL DEFAULT 'Europe/Brussels',
 start_at TIMESTAMPTZ NOT NULL, end_at TIMESTAMPTZ NOT NULL, checkin_radius_m INTEGER NOT NULL DEFAULT 100 CHECK(checkin_radius_m BETWEEN 10 AND 10000),
 status event_status NOT NULL DEFAULT 'draft', created_by UUID NOT NULL REFERENCES user_profiles(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(end_at>start_at)
);
CREATE TABLE IF NOT EXISTS workplaces (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT,
 sort_order INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(event_id,name)
);
CREATE TABLE IF NOT EXISTS event_members (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
 event_role user_role NOT NULL DEFAULT 'employee', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(event_id,user_id)
);
CREATE TABLE IF NOT EXISTS responsible_assignments (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE, workplace_id UUID NOT NULL REFERENCES workplaces(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE, assigned_by UUID REFERENCES user_profiles(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(workplace_id,user_id)
);
CREATE TABLE IF NOT EXISTS shifts (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE, workplace_id UUID NOT NULL REFERENCES workplaces(id) ON DELETE RESTRICT,
 user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE, role_name TEXT NOT NULL DEFAULT 'Crew', responsible_lead_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
 scheduled_start TIMESTAMPTZ NOT NULL, scheduled_end TIMESTAMPTZ NOT NULL, status shift_status NOT NULL DEFAULT 'scheduled', overlap_allowed BOOLEAN NOT NULL DEFAULT false,
 notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(scheduled_end>scheduled_start)
);
CREATE INDEX IF NOT EXISTS idx_shifts_user_time ON shifts(user_id,scheduled_start);
CREATE INDEX IF NOT EXISTS idx_shifts_event_workplace ON shifts(event_id,workplace_id);

CREATE TABLE IF NOT EXISTS incidents (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE, workplace_id UUID REFERENCES workplaces(id) ON DELETE SET NULL,
 reporter_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT, responsible_lead_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
 message TEXT NOT NULL CHECK(length(trim(message))>0), photo_path TEXT, latitude NUMERIC(9,6), longitude NUMERIC(9,6), gps_accuracy_m NUMERIC,
 status incident_status NOT NULL DEFAULT 'open', acknowledged_by UUID REFERENCES user_profiles(id), acknowledged_at TIMESTAMPTZ, resolved_by UUID REFERENCES user_profiles(id), resolved_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.upt_is_admin(uid UUID DEFAULT auth.uid()) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=uid AND role='admin'); $$;
CREATE OR REPLACE FUNCTION public.upt_is_responsible(event_uuid UUID, workplace_uuid UUID DEFAULT NULL, uid UUID DEFAULT auth.uid()) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM responsible_assignments ra WHERE ra.user_id=uid AND ra.event_id=event_uuid AND (workplace_uuid IS NULL OR ra.workplace_id=workplace_uuid)); $$;

ALTER TABLE events ENABLE ROW LEVEL SECURITY; ALTER TABLE workplaces ENABLE ROW LEVEL SECURITY; ALTER TABLE event_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE responsible_assignments ENABLE ROW LEVEL SECURITY; ALTER TABLE shifts ENABLE ROW LEVEL SECURITY; ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_read ON events; CREATE POLICY events_read ON events FOR SELECT USING (upt_is_admin() OR EXISTS(SELECT 1 FROM event_members em WHERE em.event_id=id AND em.user_id=auth.uid()));
DROP POLICY IF EXISTS events_admin ON events; CREATE POLICY events_admin ON events FOR ALL USING (upt_is_admin()) WITH CHECK (upt_is_admin());
DROP POLICY IF EXISTS workplaces_read ON workplaces; CREATE POLICY workplaces_read ON workplaces FOR SELECT USING (upt_is_admin() OR EXISTS(SELECT 1 FROM event_members em WHERE em.event_id=event_id AND em.user_id=auth.uid()));
DROP POLICY IF EXISTS workplaces_admin ON workplaces; CREATE POLICY workplaces_admin ON workplaces FOR ALL USING (upt_is_admin()) WITH CHECK (upt_is_admin());
DROP POLICY IF EXISTS event_members_read ON event_members; CREATE POLICY event_members_read ON event_members FOR SELECT USING (user_id=auth.uid() OR upt_is_admin() OR upt_is_responsible(event_id,NULL));
DROP POLICY IF EXISTS event_members_admin ON event_members; CREATE POLICY event_members_admin ON event_members FOR ALL USING (upt_is_admin()) WITH CHECK (upt_is_admin());
DROP POLICY IF EXISTS responsible_read ON responsible_assignments; CREATE POLICY responsible_read ON responsible_assignments FOR SELECT USING (user_id=auth.uid() OR upt_is_admin() OR EXISTS(SELECT 1 FROM event_members em WHERE em.event_id=event_id AND em.user_id=auth.uid()));
DROP POLICY IF EXISTS responsible_admin ON responsible_assignments; CREATE POLICY responsible_admin ON responsible_assignments FOR ALL USING (upt_is_admin()) WITH CHECK (upt_is_admin());
DROP POLICY IF EXISTS shifts_read ON shifts; CREATE POLICY shifts_read ON shifts FOR SELECT USING (user_id=auth.uid() OR upt_is_admin() OR upt_is_responsible(event_id,workplace_id));
DROP POLICY IF EXISTS shifts_admin ON shifts; CREATE POLICY shifts_admin ON shifts FOR ALL USING (upt_is_admin()) WITH CHECK (upt_is_admin());
DROP POLICY IF EXISTS incidents_read ON incidents; CREATE POLICY incidents_read ON incidents FOR SELECT USING (reporter_id=auth.uid() OR upt_is_admin() OR upt_is_responsible(event_id,workplace_id));
DROP POLICY IF EXISTS incidents_create ON incidents; CREATE POLICY incidents_create ON incidents FOR INSERT WITH CHECK (reporter_id=auth.uid() AND EXISTS(SELECT 1 FROM event_members em WHERE em.event_id=event_id AND em.user_id=auth.uid()));
DROP POLICY IF EXISTS incidents_manage ON incidents; CREATE POLICY incidents_manage ON incidents FOR UPDATE USING (upt_is_admin() OR upt_is_responsible(event_id,workplace_id)) WITH CHECK (upt_is_admin() OR upt_is_responsible(event_id,workplace_id));

-- Seed workplace names are templates; actual rows are created per event by application logic.
COMMENT ON TABLE events IS 'UPTILLDAWN event master records';
COMMENT ON TABLE workplaces IS 'Event-scoped operational workplaces (Ticket Scan, Guest List, Artists, Merch, Bar/Toog, Backstage Management, Allrounder, Setup, Breakdown)';
