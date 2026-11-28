CREATE TABLE IF NOT EXISTS memory_rotation_snapshots (
 id text PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 rotation_id text NOT NULL, from_key_version integer NOT NULL CHECK (from_key_version >= 1),
 total_records integer NOT NULL CHECK (total_records >= 0),
 manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[A-Za-z0-9_-]{43}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT memory_rotation_snapshots_owner_rotation_unique UNIQUE (user_id, rotation_id)
);
CREATE INDEX IF NOT EXISTS memory_rotation_snapshots_owner_created_idx ON memory_rotation_snapshots (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS memory_rotation_snapshot_items (
 snapshot_id text NOT NULL REFERENCES memory_rotation_snapshots(id) ON DELETE CASCADE,
 user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 record_id text NOT NULL, key_version integer NOT NULL CHECK (key_version >= 1),
 revision integer NOT NULL CHECK (revision >= 1), record_created_at timestamptz NOT NULL,
 CONSTRAINT memory_rotation_snapshot_items_snapshot_record_unique UNIQUE (snapshot_id, record_id)
);
CREATE INDEX IF NOT EXISTS memory_rotation_snapshot_items_snapshot_order_idx ON memory_rotation_snapshot_items (snapshot_id, record_id);
CREATE INDEX IF NOT EXISTS memory_rotation_snapshot_items_owner_snapshot_idx ON memory_rotation_snapshot_items (user_id, snapshot_id);
