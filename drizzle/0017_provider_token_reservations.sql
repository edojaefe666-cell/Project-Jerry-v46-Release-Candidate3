CREATE TABLE IF NOT EXISTS jerry_provider_token_reservations (
  reservation_id text PRIMARY KEY,
  owner_uid text NOT NULL,
  usage_day date NOT NULL,
  daily_limit_tokens integer NOT NULL CHECK (daily_limit_tokens > 0),
  reserved_tokens bigint NOT NULL CHECK (reserved_tokens > 0),
  status text NOT NULL CHECK (status IN ('reserved','settled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE INDEX IF NOT EXISTS jerry_provider_token_reservations_owner_day
  ON jerry_provider_token_reservations(owner_uid, usage_day);
