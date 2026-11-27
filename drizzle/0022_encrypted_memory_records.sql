CREATE TABLE IF NOT EXISTS encrypted_memory_records (
  id text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_version integer NOT NULL,
  revision integer NOT NULL,
  iv text NOT NULL,
  ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT encrypted_memory_records_id_check CHECK (length(id) BETWEEN 16 AND 128 AND id ~ '^[A-Za-z0-9_-]+$'),
  CONSTRAINT encrypted_memory_records_key_version_check CHECK (key_version >= 1),
  CONSTRAINT encrypted_memory_records_revision_check CHECK (revision >= 1),
  CONSTRAINT encrypted_memory_records_iv_check CHECK (length(iv) = 16 AND iv ~ '^[A-Za-z0-9_-]+$'),
  CONSTRAINT encrypted_memory_records_ciphertext_check CHECK (length(ciphertext) BETWEEN 23 AND 64000 AND ciphertext ~ '^[A-Za-z0-9_-]+$')
);

CREATE INDEX IF NOT EXISTS encrypted_memory_records_owner_updated_idx
  ON encrypted_memory_records (user_id, updated_at, id);
