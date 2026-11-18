-- Phase 2.32/tenant-isolation: durable idempotency, task execution, and Bitcoin finality metadata.
ALTER TABLE ledger_transactions
  ADD COLUMN IF NOT EXISTS confirmation_depth integer,
  ADD COLUMN IF NOT EXISTS verified_block_height integer,
  ADD COLUMN IF NOT EXISTS verified_block_hash text;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  key text NOT NULL,
  command text NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_user_key_unique
  ON idempotency_keys(user_id, key);

CREATE TABLE IF NOT EXISTS task_executions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  execution_id text NOT NULL UNIQUE,
  task_id text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL,
  checkpoint text NOT NULL,
  result_json jsonb,
  started_at timestamp NOT NULL,
  completed_at timestamp,
  updated_at timestamp NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS task_executions_user_task_idempotency_unique
  ON task_executions(user_id, task_id, idempotency_key);
