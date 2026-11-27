CREATE TABLE IF NOT EXISTS jerry_owner_rate_limits (
  owner_uid text NOT NULL,
  bucket_key text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 0),
  PRIMARY KEY(owner_uid,bucket_key)
);
CREATE INDEX IF NOT EXISTS jerry_owner_rate_limits_window
  ON jerry_owner_rate_limits(window_started_at);
