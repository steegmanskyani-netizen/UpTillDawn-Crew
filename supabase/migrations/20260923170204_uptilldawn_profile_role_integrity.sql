-- Enforce the only supported Uptilldawn account roles at the database layer.
-- RPCs already validate role changes; this closes the remaining direct-admin-write
-- integrity gap so invalid role strings cannot enter profiles.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('staff','responsible_lead','admin'))
  NOT VALID;

ALTER TABLE public.profiles
  VALIDATE CONSTRAINT profiles_role_check;
