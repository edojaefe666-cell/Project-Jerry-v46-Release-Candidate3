-- Phase 2.31: prevent duplicate ledger rows per user transaction reference.
-- Run only after confirming no existing duplicate (user_id, tx_ref) pairs.
CREATE UNIQUE INDEX IF NOT EXISTS ledger_transactions_user_tx_ref_unique
  ON ledger_transactions(user_id, tx_ref);
