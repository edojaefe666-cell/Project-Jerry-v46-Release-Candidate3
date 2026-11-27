CREATE TABLE IF NOT EXISTS device_memory_key_envelopes (
  id text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_registration_id text NOT NULL REFERENCES device_registrations(id) ON DELETE CASCADE,
  created_by_device_registration_id text NOT NULL REFERENCES device_registrations(id) ON DELETE RESTRICT,
  key_version integer NOT NULL,
  envelope_version integer NOT NULL,
  algorithm text NOT NULL,
  ephemeral_public_key jsonb NOT NULL,
  salt text NOT NULL,
  iv text NOT NULL,
  ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT device_memory_key_envelopes_owner_device_version_unique UNIQUE (user_id, device_registration_id, key_version),
  CONSTRAINT device_memory_key_envelopes_version_check CHECK (key_version >= 1 AND envelope_version = 1),
  CONSTRAINT device_memory_key_envelopes_algorithm_check CHECK (algorithm = 'ECDH-P256-HKDF-SHA256-AES-256-GCM'),
  CONSTRAINT device_memory_key_envelopes_public_key_check CHECK (
    jsonb_typeof(ephemeral_public_key) = 'object'
    AND ephemeral_public_key->>'kty' = 'EC'
    AND ephemeral_public_key->>'crv' = 'P-256'
    AND jsonb_typeof(ephemeral_public_key->'x') = 'string'
    AND jsonb_typeof(ephemeral_public_key->'y') = 'string'
    AND length(ephemeral_public_key->>'x') = 43
    AND length(ephemeral_public_key->>'y') = 43
    AND NOT (ephemeral_public_key ? 'd')
  ),
  CONSTRAINT device_memory_key_envelopes_salt_check CHECK (salt ~ '^[A-Za-z0-9_-]{43}$'),
  CONSTRAINT device_memory_key_envelopes_iv_check CHECK (iv ~ '^[A-Za-z0-9_-]{16}$'),
  CONSTRAINT device_memory_key_envelopes_ciphertext_check CHECK (ciphertext ~ '^[A-Za-z0-9_-]{64}$'),
  CONSTRAINT device_memory_key_envelopes_status_check CHECK (status IN ('active', 'revoked')),
  CONSTRAINT device_memory_key_envelopes_revocation_check CHECK (
    (status = 'active' AND revoked_at IS NULL) OR (status = 'revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS device_memory_key_envelopes_owner_created_idx
  ON device_memory_key_envelopes (user_id, created_at DESC);
