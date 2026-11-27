CREATE TABLE IF NOT EXISTS jerry_provider_daily_operations (
  owner_uid text NOT NULL,
  usage_day date NOT NULL,
  daily_limit_operations integer NOT NULL CHECK (daily_limit_operations > 0),
  used_operations integer NOT NULL DEFAULT 0 CHECK (used_operations >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_uid, usage_day)
);
