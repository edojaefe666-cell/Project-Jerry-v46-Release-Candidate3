CREATE TABLE IF NOT EXISTS memory_recovery_envelopes (
  id text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_version integer NOT NULL,
  envelope_version integer NOT NULL,
  algorithm text NOT NULL,
  salt text NOT NULL,
  iv text NOT NULL,
  ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memory_recovery_envelopes_owner_key_version_unique UNIQUE (user_id, key_version),
  CONSTRAINT memory_recovery_envelopes_key_version_check CHECK (key_version >= 1 AND envelope_version = 1),
  CONSTRAINT memory_recovery_envelopes_algorithm_check CHECK (algorithm = 'HKDF-SHA256-AES-256-GCM'),
  CONSTRAINT memory_recovery_envelopes_salt_check CHECK (salt ~ '^[A-Za-z0-9_-]{43}$'),
  CONSTRAINT memory_recovery_envelopes_iv_check CHECK (iv ~ '^[A-Za-z0-9_-]{16}$'),
  CONSTRAINT memory_recovery_envelopes_ciphertext_check CHECK (ciphertext ~ '^[A-Za-z0-9_-]{64}$')
);

CREATE INDEX IF NOT EXISTS memory_recovery_envelopes_owner_created_idx
  ON memory_recovery_envelopes (user_id, created_at DESC);
