CREATE TABLE IF NOT EXISTS device_http_request_challenges (
  id text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_registration_id text NOT NULL REFERENCES device_registrations(id) ON DELETE CASCADE,
  nonce text NOT NULL UNIQUE,
  method text NOT NULL CHECK (method IN ('GET', 'POST', 'PUT')),
  path text NOT NULL CHECK (path LIKE '/api/memory/encrypted%'),
  body_sha256 text NOT NULL CHECK (length(body_sha256) = 43 AND body_sha256 ~ '^[A-Za-z0-9_-]+$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_http_request_challenges_nonce_check CHECK (length(nonce) BETWEEN 32 AND 256 AND nonce ~ '^[A-Za-z0-9_-]+$')
);
CREATE INDEX IF NOT EXISTS device_http_request_challenges_owner_expiry_idx
  ON device_http_request_challenges (user_id, expires_at);
