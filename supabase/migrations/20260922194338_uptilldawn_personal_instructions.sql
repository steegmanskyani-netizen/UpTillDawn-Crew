-- Uptilldawn personal instructions
-- Individual event instructions with versioned acknowledgement.

CREATE TABLE IF NOT EXISTS public.personal_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  event_id UUID NOT NULL
    REFERENCES public.events(id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES public.profiles(id)
    ON DELETE CASCADE,

  title TEXT NOT NULL,
  body TEXT NOT NULL,

  version INTEGER NOT NULL DEFAULT 1,
  required BOOLEAN NOT NULL DEFAULT true,

  created_by UUID
    REFERENCES public.profiles(id)
    ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT personal_instructions_version_check
    CHECK (version >= 1),

  CONSTRAINT personal_instructions_title_check
    CHECK (length(trim(title)) > 0),

  CONSTRAINT personal_instructions_body_check
    CHECK (length(trim(body)) > 0)
);

CREATE TABLE IF NOT EXISTS public.personal_instruction_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  instruction_id UUID NOT NULL
    REFERENCES public.personal_instructions(id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES public.profiles(id)
    ON DELETE CASCADE,

  version INTEGER NOT NULL,

  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT personal_instruction_ack_unique
    UNIQUE (instruction_id, user_id, version),

  CONSTRAINT personal_instruction_ack_version_check
    CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS personal_instructions_event_idx
ON public.personal_instructions(event_id);

CREATE INDEX IF NOT EXISTS personal_instructions_user_idx
ON public.personal_instructions(user_id);

CREATE INDEX IF NOT EXISTS personal_instruction_ack_user_idx
ON public.personal_instruction_acknowledgements(user_id);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.personal_instructions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.personal_instruction_acknowledgements
ENABLE ROW LEVEL SECURITY;

-- Assigned employee can read own instructions.
-- Admin can read all.
CREATE POLICY personal_instructions_read
ON public.personal_instructions
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.upt_is_admin(auth.uid())
);

-- Only admins manage personal instructions.
CREATE POLICY personal_instructions_admin_manage
ON public.personal_instructions
FOR ALL
TO authenticated
USING (
  public.upt_is_admin(auth.uid())
)
WITH CHECK (
  public.upt_is_admin(auth.uid())
);

-- Employee can see own acknowledgement records.
-- Admin can see all.
CREATE POLICY personal_instruction_ack_read
ON public.personal_instruction_acknowledgements
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.upt_is_admin(auth.uid())
);

-- ============================================================
-- Acknowledgement RPC
-- Uses server timestamp and current instruction version.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upt_acknowledge_personal_instruction(
  p_instruction UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  instruction_user UUID;
  instruction_version INTEGER;
  acknowledgement_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT
    user_id,
    version
  INTO
    instruction_user,
    instruction_version
  FROM public.personal_instructions
  WHERE id = p_instruction;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Personal instruction not found';
  END IF;

  IF instruction_user <> auth.uid() THEN
    RAISE EXCEPTION 'Instruction is not assigned to this user';
  END IF;

  INSERT INTO public.personal_instruction_acknowledgements (
    instruction_id,
    user_id,
    version,
    acknowledged_at
  )
  VALUES (
    p_instruction,
    auth.uid(),
    instruction_version,
    now()
  )
  ON CONFLICT (instruction_id, user_id, version)
  DO UPDATE SET
    acknowledged_at =
      public.personal_instruction_acknowledgements.acknowledged_at
  RETURNING id INTO acknowledgement_id;

  INSERT INTO public.upt_audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    auth.uid(),
    'PERSONAL_INSTRUCTION_ACKNOWLEDGED',
    'personal_instruction',
    p_instruction,
    jsonb_build_object(
      'version', instruction_version,
      'acknowledgement_id', acknowledgement_id
    )
  );

  RETURN acknowledgement_id;
END;
$$;

-- ============================================================
-- Automatically increment version when content changes.
-- This makes an old acknowledgement invalid for the new version.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upt_version_personal_instruction()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.required IS DISTINCT FROM OLD.required
  THEN
    NEW.version := OLD.version + 1;
  ELSE
    NEW.version := OLD.version;
  END IF;

  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
upt_personal_instruction_version_trigger
ON public.personal_instructions;

CREATE TRIGGER upt_personal_instruction_version_trigger
BEFORE UPDATE
ON public.personal_instructions
FOR EACH ROW
EXECUTE FUNCTION public.upt_version_personal_instruction();

-- ============================================================
-- Permissions
-- ============================================================

REVOKE ALL ON TABLE public.personal_instructions FROM anon;

REVOKE ALL ON TABLE public.personal_instruction_acknowledgements FROM anon;

GRANT SELECT ON TABLE public.personal_instructions TO authenticated;

GRANT SELECT ON TABLE public.personal_instruction_acknowledgements TO authenticated;

-- Admin management still remains protected by RLS.
GRANT INSERT, UPDATE, DELETE
ON TABLE public.personal_instructions
TO authenticated;

-- No direct acknowledgement inserts.
REVOKE INSERT, UPDATE, DELETE
ON TABLE public.personal_instruction_acknowledgements
FROM authenticated;

REVOKE ALL ON FUNCTION
public.upt_acknowledge_personal_instruction(UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
public.upt_acknowledge_personal_instruction(UUID)
TO authenticated;

-- Trigger function does not need direct application access.
REVOKE ALL ON FUNCTION
public.upt_version_personal_instruction()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
public.upt_version_personal_instruction()
TO postgres, service_role;

