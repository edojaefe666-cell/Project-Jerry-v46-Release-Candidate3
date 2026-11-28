CREATE TABLE IF NOT EXISTS memory_rotation_snapshots (
  id text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rotation_id text NOT NULL,
  from_key_version integer NOT NULL,
  total_records integer NOT NULL,
  manifest_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memory_rotation_snapshots_owner_rotation_unique UNIQUE (user_id, rotation_id),
  CONSTRAINT memory_rotation_snapshots_key_version_check CHECK (from_key_version >= 1),
  CONSTRAINT memory_rotation_snapshots_total_check CHECK (total_records >= 0 AND total_records <= 100000),
  CONSTRAINT memory_rotation_snapshots_hash_check CHECK (manifest_sha256 ~ '^[A-Za-z0-9_-]{43}$')
);
CREATE INDEX IF NOT EXISTS memory_rotation_snapshots_owner_created_idx
  ON memory_rotation_snapshots (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_rotation_snapshot_records (
  id text PRIMARY KEY,
  snapshot_id text NOT NULL REFERENCES memory_rotation_snapshots(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  record_id text NOT NULL,
  key_version integer NOT NULL,
  revision integer NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT memory_rotation_snapshot_records_ordinal_unique UNIQUE (snapshot_id, ordinal),
  CONSTRAINT memory_rotation_snapshot_records_record_unique UNIQUE (snapshot_id, record_id),
  CONSTRAINT memory_rotation_snapshot_records_ordinal_check CHECK (ordinal >= 0),
  CONSTRAINT memory_rotation_snapshot_records_version_check CHECK (key_version >= 1 AND revision >= 1)
);
CREATE INDEX IF NOT EXISTS memory_rotation_snapshot_records_owner_snapshot_idx
  ON memory_rotation_snapshot_records (user_id, snapshot_id, ordinal);
