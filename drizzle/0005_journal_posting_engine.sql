-- Phase 2.45: deterministic idempotent posting and stronger database invariants.
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS request_hash text;

-- Serialize line insertion with sealing of the parent journal entry.
CREATE OR REPLACE FUNCTION protect_journal_line() RETURNS trigger AS $$
DECLARE entry_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Journal lines are immutable; create a reversal entry.';
  END IF;
  SELECT status INTO entry_status FROM journal_entries
    WHERE user_id = NEW.user_id AND id = NEW.journal_entry_id FOR UPDATE;
  IF entry_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Journal lines can only be added to a draft entry.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM journal_accounts
    WHERE user_id = NEW.user_id AND id = NEW.account_id AND asset = NEW.asset
  ) THEN
    RAISE EXCEPTION 'Journal line asset must match its tenant-owned account asset.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS journal_lines_immutable ON journal_lines;
CREATE TRIGGER journal_lines_immutable BEFORE INSERT OR UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION protect_journal_line();

-- Entries created by the posting engine always carry a canonical request digest.
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_request_hash_check
  CHECK (request_hash IS NULL OR request_hash ~ '^[a-f0-9]{64}$');
