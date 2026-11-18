# Phase 2.28 — Authorization & Tenant-Isolation Remediation

## Implemented

- Replaced authenticated `/api/state` reads/writes that used the process-global JSON state file with per-Firebase-UID Cloud SQL workspace storage.
- `/api/state/reset` now resets only the authenticated user's workspace.
- Authoritative wallet persistence no longer writes the process-global state file.
- Security approvals now carry `owner_uid`; reads, decisions, and one-shot consumption require the authenticated owner UID.
- Approved contacts now carry `owner_uid`; reads and status changes are owner-scoped.
- Audit-chain entries now carry `owner_uid`; audit listing and integrity verification are owner-scoped.
- Security backup export/import is owner-scoped and restore only replaces the current user's security records.
- Added cross-owner regression tests for approvals and approved contacts.

## Security boundary

Firebase authentication identifies the caller. Cloud SQL `users.uid` identifies the workspace owner. SecurityStore `owner_uid` identifies the owner of local approvals, contacts, and audit records. No request parameter or client-provided owner identifier is trusted for these boundaries.

## Verification

Static route/source audit completed. The existing environment still cannot execute the complete release verification command because Bun/dependencies are not provisioned; no full build-green claim is made.
