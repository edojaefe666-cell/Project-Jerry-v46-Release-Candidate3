-- Shared, owner-scoped approval authority.
-- Approval state and its hash-linked audit events are committed in the same
-- PostgreSQL transaction so separate app instances cannot reserve or consume
-- the same owner authorization independently.
CREATE TABLE IF NOT EXISTS jerry_security_approvals (
  id text PRIMARY KEY,
  owner_uid text NOT NULL,
  action text NOT NULL,
  summary text NOT NULL,
  amount_usd double precision,
  scope_json jsonb,
  scope_hash text,
  status text NOT NULL CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL,
  decided_at timestamptz,
  decided_by text,
  consumed_at timestamptz,
  reservation_id text,
  reserved_at timestamptz
);

CREATE INDEX IF NOT EXISTS jerry_security_approvals_owner_status_created
  ON jerry_security_approvals(owner_uid,status,created_at DESC);

CREATE TABLE IF NOT EXISTS jerry_security_approval_audit (
  seq bigserial PRIMARY KEY,
  owner_uid text NOT NULL,
  actor_uid text NOT NULL,
  event text NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  previous_hash text NOT NULL,
  entry_hash text NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS jerry_security_approval_audit_owner_seq
  ON jerry_security_approval_audit(owner_uid,seq);

CREATE TABLE IF NOT EXISTS jerry_security_approved_contacts (
  id text PRIMARY KEY,
  owner_uid text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  purpose text NOT NULL,
  status text NOT NULL CHECK(status IN ('active','revoked')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS jerry_security_contacts_owner_created
  ON jerry_security_approved_contacts(owner_uid,created_at DESC);

CREATE TABLE IF NOT EXISTS jerry_security_audit (
  seq bigserial PRIMARY KEY,
  owner_uid text NOT NULL,
  actor_uid text NOT NULL,
  event text NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  previous_hash text NOT NULL,
  entry_hash text NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS jerry_security_audit_owner_seq
  ON jerry_security_audit(owner_uid,seq);

CREATE TABLE IF NOT EXISTS jerry_security_legacy_audit_archive (id bigserial PRIMARY KEY, owner_uid text NOT NULL, source_entry jsonb NOT NULL, archived_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS jerry_security_legacy_audit_owner_id ON jerry_security_legacy_audit_archive(owner_uid,id);
