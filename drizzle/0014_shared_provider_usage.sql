CREATE TABLE IF NOT EXISTS jerry_provider_daily_usage (
  owner_uid text NOT NULL,
  usage_day date NOT NULL,
  daily_limit_tokens integer NOT NULL CHECK (daily_limit_tokens > 0),
  reserved_tokens integer NOT NULL DEFAULT 0 CHECK (reserved_tokens >= 0),
  actual_tokens integer NOT NULL DEFAULT 0 CHECK (actual_tokens >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_uid, usage_day)
);
