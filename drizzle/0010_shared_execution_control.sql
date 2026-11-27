-- Shared owner-controlled execution latch for multi-instance deployments.
-- First boot is stopped: no instance may infer permission from a missing row.
CREATE TABLE IF NOT EXISTS jerry_execution_control (
  id smallint PRIMARY KEY CHECK (id = 1),
  stopped boolean NOT NULL DEFAULT true,
  epoch bigint NOT NULL DEFAULT 1,
  reason text NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO jerry_execution_control (id, stopped, epoch, reason, updated_by)
VALUES (1, true, 1, 'Shared execution control initialized in stopped state', 'system')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS jerry_execution_control_audit (
  id bigserial PRIMARY KEY,
  epoch bigint NOT NULL,
  stopped boolean NOT NULL,
  actor_uid text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jerry_execution_control_audit_created_idx
  ON jerry_execution_control_audit (created_at DESC, id DESC);
