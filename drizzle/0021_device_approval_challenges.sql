ALTER TABLE device_registrations
  ADD COLUMN IF NOT EXISTS signing_public_key jsonb;

ALTER TABLE device_registrations
  ADD CONSTRAINT device_registrations_signing_public_key_check
  CHECK (
    signing_public_key IS NULL OR (
      jsonb_typeof(signing_public_key) = 'object'
      AND signing_public_key->>'kty' = 'EC'
      AND signing_public_key->>'crv' = 'P-256'
      AND jsonb_typeof(signing_public_key->'x') = 'string'
      AND jsonb_typeof(signing_public_key->'y') = 'string'
      AND length(signing_public_key->>'x') = 43
      AND length(signing_public_key->>'y') = 43
      AND NOT (signing_public_key ? 'd')
    )
  );

CREATE TABLE IF NOT EXISTS device_approval_challenges (
  id text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  approver_registration_id text NOT NULL REFERENCES device_registrations(id) ON DELETE CASCADE,
  target_registration_id text NOT NULL REFERENCES device_registrations(id) ON DELETE CASCADE,
  nonce text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_approval_challenges_id_check CHECK (length(id) BETWEEN 16 AND 128),
  CONSTRAINT device_approval_challenges_nonce_check CHECK (length(nonce) BETWEEN 32 AND 256),
  CONSTRAINT device_approval_challenges_distinct_devices_check CHECK (approver_registration_id <> target_registration_id)
);

CREATE INDEX IF NOT EXISTS device_approval_challenges_owner_expiry_idx
  ON device_approval_challenges (user_id, expires_at);
CREATE INDEX IF NOT EXISTS device_approval_challenges_approver_idx
  ON device_approval_challenges (approver_registration_id, created_at DESC);
