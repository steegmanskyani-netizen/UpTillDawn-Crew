-- Regression check: every public foreign key must have a covering index
-- whose leading columns match the FK columns in order.
DO $$
DECLARE
  v_missing text;
BEGIN
  WITH fk AS (
    SELECT
      c.relname AS table_name,
      con.conname AS constraint_name,
      con.conrelid,
      con.conkey
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype = 'f'
      AND n.nspname = 'public'
  )
  SELECT string_agg(table_name || ':' || constraint_name, ', ' ORDER BY table_name, constraint_name)
  INTO v_missing
  FROM fk
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = fk.conrelid
      AND i.indisvalid
      AND (i.indkey::smallint[])[0:cardinality(fk.conkey)-1] = fk.conkey
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL unindexed public foreign keys: %', v_missing;
  END IF;
END $$;

SELECT 'PASS: every public foreign key has a covering leading index' AS result;
