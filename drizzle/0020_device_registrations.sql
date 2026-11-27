CREATE TABLE IF NOT EXISTS device_registrations (
  id text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_name text NOT NULL,
  platform text NOT NULL,
  exchange_public_key jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  CONSTRAINT device_registrations_owner_device_unique UNIQUE (user_id, device_id),
  CONSTRAINT device_registrations_status_check CHECK (status IN ('pending', 'active', 'revoked')),
  CONSTRAINT device_registrations_id_check CHECK (length(id) BETWEEN 16 AND 128),
  CONSTRAINT device_registrations_device_id_check CHECK (length(device_id) BETWEEN 16 AND 128),
  CONSTRAINT device_registrations_name_check CHECK (length(device_name) BETWEEN 1 AND 80),
  CONSTRAINT device_registrations_platform_check CHECK (platform IN ('android', 'web', 'ios', 'other')),
  CONSTRAINT device_registrations_public_key_object_check CHECK (jsonb_typeof(exchange_public_key) = 'object'),
  CONSTRAINT device_registrations_public_key_curve_check CHECK (
    exchange_public_key->>'kty' = 'EC' AND exchange_public_key->>'crv' = 'P-256'
    AND length(exchange_public_key->>'x') = 43 AND length(exchange_public_key->>'y') = 43
  ),
  CONSTRAINT device_registrations_approval_state_check CHECK (
    (status = 'pending' AND approved_at IS NULL AND revoked_at IS NULL)
    OR (status = 'active' AND approved_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS device_registrations_owner_created_idx
  ON device_registrations (user_id, created_at DESC);
