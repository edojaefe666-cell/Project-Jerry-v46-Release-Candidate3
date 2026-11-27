CREATE TABLE IF NOT EXISTS jerry_provider_daily_cost (
  owner_uid text NOT NULL,
  usage_day date NOT NULL,
  daily_limit_micro_usd bigint NOT NULL CHECK (daily_limit_micro_usd > 0),
  reserved_micro_usd bigint NOT NULL DEFAULT 0 CHECK (reserved_micro_usd >= 0),
  actual_micro_usd bigint NOT NULL DEFAULT 0 CHECK (actual_micro_usd >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_uid, usage_day)
);
