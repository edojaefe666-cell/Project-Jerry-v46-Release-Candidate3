-- Phase 2.44: immutable, tenant-scoped double-entry journal.
-- Amounts are integer atomic units (satoshis for BTC); never use floating point.
CREATE TABLE IF NOT EXISTS journal_accounts (
  id bigserial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  account_code text NOT NULL,
  asset text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_code, asset),
  UNIQUE (user_id, id)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id bigserial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
  reversal_of bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, reversal_of) REFERENCES journal_entries(user_id, id),
  UNIQUE (reversal_of)
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id bigserial PRIMARY KEY,
  user_id integer NOT NULL,
  journal_entry_id bigint NOT NULL,
  account_id bigint NOT NULL,
  asset text NOT NULL,
  debit_units bigint NOT NULL DEFAULT 0 CHECK (debit_units >= 0),
  credit_units bigint NOT NULL DEFAULT 0 CHECK (credit_units >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((debit_units > 0 AND credit_units = 0) OR (credit_units > 0 AND debit_units = 0)),
  FOREIGN KEY (user_id, journal_entry_id) REFERENCES journal_entries(user_id, id),
  FOREIGN KEY (user_id, account_id) REFERENCES journal_accounts(user_id, id)
);
CREATE INDEX IF NOT EXISTS journal_lines_user_asset_account_idx
  ON journal_lines(user_id, asset, account_id);
CREATE INDEX IF NOT EXISTS journal_lines_entry_idx
  ON journal_lines(user_id, journal_entry_id);

-- A journal can be assembled only while draft, then sealed exactly once as posted.
-- Posted entries and all lines are immutable; corrections require a new reversal.
CREATE OR REPLACE FUNCTION protect_journal_entry() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Journal entries cannot be deleted; create a reversal entry.';
  END IF;
  IF OLD.status <> 'draft' OR NEW.status <> 'posted'
     OR NEW.user_id <> OLD.user_id
     OR NEW.idempotency_key <> OLD.idempotency_key
     OR NEW.description <> OLD.description
     OR NEW.reversal_of IS DISTINCT FROM OLD.reversal_of
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Journal entries may only transition once from draft to posted.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS journal_entries_immutable ON journal_entries;
CREATE TRIGGER journal_entries_immutable BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION protect_journal_entry();

CREATE OR REPLACE FUNCTION protect_journal_line() RETURNS trigger AS $$
DECLARE entry_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Journal lines are immutable; create a reversal entry.';
  END IF;
  SELECT status INTO entry_status FROM journal_entries
    WHERE user_id = NEW.user_id AND id = NEW.journal_entry_id;
  IF entry_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Journal lines can only be added to a draft entry.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS journal_lines_immutable ON journal_lines;
CREATE TRIGGER journal_lines_immutable BEFORE INSERT OR UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION protect_journal_line();

-- The deferred check runs after all lines have been inserted and the draft sealed.
CREATE OR REPLACE FUNCTION assert_posted_journal_balanced() RETURNS trigger AS $$
DECLARE line_count bigint;
DECLARE bad_asset text;
BEGIN
  IF NEW.status = 'posted' AND OLD.status = 'draft' THEN
    SELECT count(*) INTO line_count FROM journal_lines
      WHERE user_id = NEW.user_id AND journal_entry_id = NEW.id;
    IF line_count < 2 THEN
      RAISE EXCEPTION 'A posted journal entry requires at least two lines.';
    END IF;
    SELECT asset INTO bad_asset FROM journal_lines
      WHERE user_id = NEW.user_id AND journal_entry_id = NEW.id
      GROUP BY asset HAVING sum(debit_units) <> sum(credit_units) LIMIT 1;
    IF bad_asset IS NOT NULL THEN
      RAISE EXCEPTION 'Journal entry is unbalanced for asset %.', bad_asset;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS journal_entries_balance_check ON journal_entries;
CREATE CONSTRAINT TRIGGER journal_entries_balance_check
  AFTER UPDATE OF status ON journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_posted_journal_balanced();
