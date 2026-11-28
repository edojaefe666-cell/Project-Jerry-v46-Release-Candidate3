CREATE TABLE IF NOT EXISTS memory_rotation_checkpoints (
  id text PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rotation_id text NOT NULL,
  from_key_version integer NOT NULL,
  to_key_version integer NOT NULL,
  checkpoint_revision integer NOT NULL DEFAULT 1,
  phase text NOT NULL,
  checkpoint_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memory_rotation_checkpoints_owner_rotation_unique UNIQUE (user_id, rotation_id),
  CONSTRAINT memory_rotation_checkpoints_versions_check CHECK (from_key_version >= 1 AND to_key_version = from_key_version + 1),
  CONSTRAINT memory_rotation_checkpoints_revision_check CHECK (checkpoint_revision >= 1),
  CONSTRAINT memory_rotation_checkpoints_phase_check CHECK (phase IN ('prepared','applying','verifying','ready_for_owner_approval','paused','aborted'))
);
CREATE INDEX IF NOT EXISTS memory_rotation_checkpoints_owner_updated_idx
  ON memory_rotation_checkpoints (user_id, updated_at DESC);
