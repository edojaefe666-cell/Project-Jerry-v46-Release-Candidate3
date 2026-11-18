-- Phase 2.49: durable wallet->journal outbox.
-- The wallet state/legacy ledger and journal use separate transaction handles;
-- financial events are therefore recorded durably in the same workspace DB
-- transaction and journaled asynchronously with retry semantics.
CREATE TABLE IF NOT EXISTS wallet_journal_outbox (
  id bigserial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  event_key text NOT NULL,
  tx_ref text NOT NULL,
  payload_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','processed')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_key)
);
CREATE INDEX IF NOT EXISTS wallet_journal_outbox_pending_idx
  ON wallet_journal_outbox(status, available_at, id);
