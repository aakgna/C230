-- Enforces append-only semantics on verification_log at the database layer,
-- independent of application code. Corrections must be inserted as new rows
-- referencing amends_entry_id, never as an UPDATE/DELETE of history.
--
-- Implemented as a trigger rather than REVOKE: Neon's connection role
-- (neondb_owner) owns this table, and table owners implicitly bypass
-- GRANT/REVOKE privilege checks. Triggers fire regardless of ownership, so
-- this is the enforcement mechanism that actually holds here.
CREATE OR REPLACE FUNCTION verification_log_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'verification_log is append-only: % is not permitted (attempted on id=%)', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS verification_log_no_update ON verification_log;
CREATE TRIGGER verification_log_no_update
  BEFORE UPDATE ON verification_log
  FOR EACH ROW EXECUTE FUNCTION verification_log_block_mutation();

DROP TRIGGER IF EXISTS verification_log_no_delete ON verification_log;
CREATE TRIGGER verification_log_no_delete
  BEFORE DELETE ON verification_log
  FOR EACH ROW EXECUTE FUNCTION verification_log_block_mutation();
