-- Defense-in-depth alongside the app-level status checks in
-- app/(app)/verification/pending/actions.ts: once a submission is approved, block any further
-- UPDATE at the database layer too, so an approved submission can never be silently edited
-- after the fact. Rejected/pending rows stay editable (the resubmit flow depends on that).
-- Same rationale and pattern as verification_log_block_mutation in migration 0001.
CREATE OR REPLACE FUNCTION verification_submissions_block_approved_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION 'verification_submissions row % is approved and cannot be modified further', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS verification_submissions_no_update_when_approved ON verification_submissions;
CREATE TRIGGER verification_submissions_no_update_when_approved
  BEFORE UPDATE ON verification_submissions
  FOR EACH ROW EXECUTE FUNCTION verification_submissions_block_approved_update();
