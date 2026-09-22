-- UPTILLDAWN Crew Management — operational platform
DO $$ BEGIN CREATE TYPE approval_status AS ENUM ('pending','approved','rejected','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE task_status AS ENUM ('not_started','in_progress','completed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE gps_status AS ENUM ('verified','outside_radius','denied','unavailable','inaccurate','offline','not_checked'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE work_status AS ENUM ('active','completed','corrected'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE sync_status AS ENUM ('pending','synced','failed','conflict'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS briefings (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,workplace_id UUID REFERENCES workplaces(id) ON DELETE CASCADE,title TEXT NOT NULL,body TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,required BOOLEAN NOT NULL DEFAULT true,created_by UUID REFERENCES user_profiles(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS briefing_acknowledgements (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),briefing_id UUID NOT NULL REFERENCES briefings(id) ON DELETE CASCADE,user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,version INTEGER NOT NULL,acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(briefing_id,user_id,version));
CREATE TABLE IF NOT EXISTS tasks (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,workplace_id UUID REFERENCES workplaces(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT,status task_status NOT NULL DEFAULT 'not_started',assigned_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,created_by UUID REFERENCES user_profiles(id),completed_by UUID REFERENCES user_profiles(id),completed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS check_ins (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,workplace_id UUID REFERENCES workplaces(id) ON DELETE SET NULL,status approval_status NOT NULL DEFAULT 'pending',gps_status gps_status NOT NULL DEFAULT 'not_checked',latitude NUMERIC(9,6),longitude NUMERIC(9,6),accuracy_m NUMERIC,distance_m NUMERIC,remote BOOLEAN NOT NULL DEFAULT false,selfie_path TEXT,requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),decided_at TIMESTAMPTZ,decided_by UUID REFERENCES user_profiles(id),notes TEXT);
CREATE TABLE IF NOT EXISTS check_outs (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,status approval_status NOT NULL DEFAULT 'pending',requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),decided_at TIMESTAMPTZ,decided_by UUID REFERENCES user_profiles(id),notes TEXT);
CREATE TABLE IF NOT EXISTS work_sessions (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,started_at TIMESTAMPTZ NOT NULL DEFAULT now(),ended_at TIMESTAMPTZ,status work_status NOT NULL DEFAULT 'active',start_gps_status gps_status NOT NULL DEFAULT 'not_checked',stop_gps_status gps_status NOT NULL DEFAULT 'not_checked',created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS one_active_work_session ON work_sessions(user_id) WHERE ended_at IS NULL;
CREATE TABLE IF NOT EXISTS break_sessions (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),work_session_id UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,started_at TIMESTAMPTZ NOT NULL DEFAULT now(),ended_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS one_active_break ON break_sessions(user_id) WHERE ended_at IS NULL;
CREATE TABLE IF NOT EXISTS workplace_transitions (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),work_session_id UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,from_workplace_id UUID REFERENCES workplaces(id),to_workplace_id UUID NOT NULL REFERENCES workplaces(id),transitioned_at TIMESTAMPTZ NOT NULL DEFAULT now(),confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS chat_channels (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),kind TEXT NOT NULL CHECK(kind IN ('organization','event','workplace','private')),event_id UUID REFERENCES events(id) ON DELETE CASCADE,workplace_id UUID REFERENCES workplaces(id) ON DELETE CASCADE,name TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS chat_members (channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,PRIMARY KEY(channel_id,user_id));
CREATE TABLE IF NOT EXISTS messages (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,sender_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,body TEXT NOT NULL CHECK(length(trim(body))>0),moderated_at TIMESTAMPTZ,moderated_by UUID REFERENCES user_profiles(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS message_attachments (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,storage_path TEXT NOT NULL,mime_type TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS crew_notifications (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,title TEXT NOT NULL,body TEXT,kind TEXT NOT NULL DEFAULT 'info',read_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS upt_audit_logs (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),actor_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,action TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id UUID,metadata JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS offline_operation_records (id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,operation_type TEXT NOT NULL,payload JSONB NOT NULL,status sync_status NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),synced_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS event_templates (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),name TEXT NOT NULL,configuration JSONB NOT NULL DEFAULT '{}'::jsonb,created_by UUID REFERENCES user_profiles(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE INDEX IF NOT EXISTS idx_checkins_event_user ON check_ins(event_id,user_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_event_user ON work_sessions(event_id,user_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel_id,created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_event_workplace ON tasks(event_id,workplace_id);

-- Server-authoritative state transitions.
CREATE OR REPLACE FUNCTION public.upt_start_work(p_event UUID,p_shift UUID DEFAULT NULL) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE wid UUID; cid UUID; BEGIN
 IF NOT EXISTS(SELECT 1 FROM event_members WHERE event_id=p_event AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Not an event member'; END IF;
 IF NOT EXISTS(SELECT 1 FROM check_ins WHERE event_id=p_event AND user_id=auth.uid() AND status='approved') THEN RAISE EXCEPTION 'Approved check-in required'; END IF;
 INSERT INTO work_sessions(event_id,user_id,shift_id) VALUES(p_event,auth.uid(),p_shift) RETURNING id INTO wid;
 INSERT INTO upt_audit_logs(actor_id,action,entity_type,entity_id) VALUES(auth.uid(),'START_WORK','work_session',wid); RETURN wid; END $$;
CREATE OR REPLACE FUNCTION public.upt_start_break(p_work_session UUID) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE bid UUID; BEGIN
 IF NOT EXISTS(SELECT 1 FROM work_sessions WHERE id=p_work_session AND user_id=auth.uid() AND ended_at IS NULL) THEN RAISE EXCEPTION 'No active work session'; END IF;
 INSERT INTO break_sessions(work_session_id,user_id) VALUES(p_work_session,auth.uid()) RETURNING id INTO bid; RETURN bid; END $$;
CREATE OR REPLACE FUNCTION public.upt_stop_break(p_break UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN UPDATE break_sessions SET ended_at=now() WHERE id=p_break AND user_id=auth.uid() AND ended_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'No active break'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.upt_stop_work(p_work_session UUID) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 UPDATE break_sessions SET ended_at=now() WHERE work_session_id=p_work_session AND user_id=auth.uid() AND ended_at IS NULL;
 UPDATE work_sessions SET ended_at=now(),status='completed' WHERE id=p_work_session AND user_id=auth.uid() AND ended_at IS NULL; IF NOT FOUND THEN RAISE EXCEPTION 'No active work session'; END IF; END $$;

-- RLS
DO $$ DECLARE t TEXT; BEGIN FOREACH t IN ARRAY ARRAY['briefings','briefing_acknowledgements','tasks','check_ins','check_outs','work_sessions','break_sessions','workplace_transitions','chat_channels','chat_members','messages','message_attachments','crew_notifications','upt_audit_logs','offline_operation_records','event_templates'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); END LOOP; END $$;
CREATE POLICY briefing_read ON briefings FOR SELECT USING(upt_is_admin() OR EXISTS(SELECT 1 FROM event_members e WHERE e.event_id=briefings.event_id AND e.user_id=auth.uid()));
CREATE POLICY briefing_admin ON briefings FOR ALL USING(upt_is_admin() OR upt_is_responsible(event_id,workplace_id)) WITH CHECK(upt_is_admin() OR upt_is_responsible(event_id,workplace_id));
CREATE POLICY ack_own ON briefing_acknowledgements FOR ALL USING(user_id=auth.uid() OR upt_is_admin()) WITH CHECK(user_id=auth.uid() OR upt_is_admin());
CREATE POLICY task_read ON tasks FOR SELECT USING(upt_is_admin() OR assigned_user_id=auth.uid() OR EXISTS(SELECT 1 FROM event_members e WHERE e.event_id=tasks.event_id AND e.user_id=auth.uid()));
CREATE POLICY task_manage ON tasks FOR ALL USING(upt_is_admin() OR upt_is_responsible(event_id,workplace_id)) WITH CHECK(upt_is_admin() OR upt_is_responsible(event_id,workplace_id));
CREATE POLICY checkin_own_read ON check_ins FOR SELECT USING(user_id=auth.uid() OR upt_is_admin() OR upt_is_responsible(event_id,workplace_id));
CREATE POLICY checkin_own_insert ON check_ins FOR INSERT WITH CHECK(user_id=auth.uid());
CREATE POLICY checkin_manage ON check_ins FOR UPDATE USING(upt_is_admin() OR upt_is_responsible(event_id,workplace_id));
CREATE POLICY checkout_access ON check_outs FOR SELECT USING(user_id=auth.uid() OR upt_is_admin() OR upt_is_responsible(event_id,NULL));
CREATE POLICY checkout_insert ON check_outs FOR INSERT WITH CHECK(user_id=auth.uid());
CREATE POLICY checkout_manage ON check_outs FOR UPDATE USING(upt_is_admin() OR upt_is_responsible(event_id,NULL));
CREATE POLICY work_own_read ON work_sessions FOR SELECT USING(user_id=auth.uid() OR upt_is_admin() OR upt_is_responsible(event_id,NULL));
CREATE POLICY break_own_read ON break_sessions FOR SELECT USING(user_id=auth.uid() OR upt_is_admin());
CREATE POLICY transition_own ON workplace_transitions FOR SELECT USING(user_id=auth.uid() OR upt_is_admin());
CREATE POLICY notification_own ON crew_notifications FOR SELECT USING(user_id=auth.uid() OR upt_is_admin());
CREATE POLICY notification_update ON crew_notifications FOR UPDATE USING(user_id=auth.uid());
CREATE POLICY audit_admin ON upt_audit_logs FOR SELECT USING(upt_is_admin());
CREATE POLICY offline_own ON offline_operation_records FOR ALL USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY templates_admin ON event_templates FOR ALL USING(upt_is_admin()) WITH CHECK(upt_is_admin());
CREATE POLICY channels_read ON chat_channels FOR SELECT USING(upt_is_admin() OR EXISTS(SELECT 1 FROM chat_members cm WHERE cm.channel_id=id AND cm.user_id=auth.uid()) OR (kind='organization' AND EXISTS(SELECT 1 FROM user_profiles p WHERE p.id=auth.uid() AND p.account_status='approved')) OR (event_id IS NOT NULL AND EXISTS(SELECT 1 FROM event_members em WHERE em.event_id=chat_channels.event_id AND em.user_id=auth.uid())));
CREATE POLICY messages_read ON messages FOR SELECT USING(EXISTS(SELECT 1 FROM chat_channels c WHERE c.id=channel_id AND (upt_is_admin() OR EXISTS(SELECT 1 FROM chat_members cm WHERE cm.channel_id=c.id AND cm.user_id=auth.uid()) OR (c.kind='organization' AND EXISTS(SELECT 1 FROM user_profiles p WHERE p.id=auth.uid() AND p.account_status='approved')) OR (c.event_id IS NOT NULL AND EXISTS(SELECT 1 FROM event_members em WHERE em.event_id=c.event_id AND em.user_id=auth.uid())))));
CREATE POLICY messages_insert ON messages FOR INSERT WITH CHECK(sender_id=auth.uid());

-- Private buckets. Supabase migration environments support storage schema.
INSERT INTO storage.buckets(id,name,public) VALUES ('uptilldawn-profile','uptilldawn-profile',false),('uptilldawn-checkin','uptilldawn-checkin',false),('uptilldawn-incidents','uptilldawn-incidents',false),('uptilldawn-chat','uptilldawn-chat',false) ON CONFLICT(id) DO NOTHING;
