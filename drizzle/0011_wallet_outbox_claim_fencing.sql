-- Phase 2.50: fencing tokens for durable wallet journal outbox claims.
-- A worker may finish after its stale claim has been reclaimed. The token
-- prevents that older worker from overwriting the newer worker's queue state.
ALTER TABLE wallet_journal_outbox
  ADD COLUMN IF NOT EXISTS claim_token uuid;

CREATE INDEX IF NOT EXISTS wallet_journal_outbox_claim_token_idx
  ON wallet_journal_outbox (claim_token)
  WHERE claim_token IS NOT NULL;
