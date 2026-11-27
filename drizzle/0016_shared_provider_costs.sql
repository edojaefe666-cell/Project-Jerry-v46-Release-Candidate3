CREATE TABLE IF NOT EXISTS jerry_provider_daily_cost (
  owner_uid text NOT NULL,
  usage_day date NOT NULL,
  daily_limit_micro_usd bigint NOT NULL CHECK (daily_limit_micro_usd > 0),
  reserved_micro_usd bigint NOT NULL DEFAULT 0 CHECK (reserved_micro_usd >= 0),
  actual_micro_usd bigint NOT NULL DEFAULT 0 CHECK (actual_micro_usd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_uid, usage_day)
);

CREATE TABLE IF NOT EXISTS jerry_provider_cost_reservations (
  reservation_id text PRIMARY KEY,
  owner_uid text NOT NULL,
  usage_day date NOT NULL,
  daily_limit_micro_usd bigint NOT NULL CHECK (daily_limit_micro_usd > 0),
  reserved_micro_usd bigint NOT NULL CHECK (reserved_micro_usd > 0),
  status text NOT NULL CHECK (status IN ('reserved','settled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE INDEX IF NOT EXISTS jerry_provider_cost_reservations_owner_day
  ON jerry_provider_cost_reservations(owner_uid, usage_day);
