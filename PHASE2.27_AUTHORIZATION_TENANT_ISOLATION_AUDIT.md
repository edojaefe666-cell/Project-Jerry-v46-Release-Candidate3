# Phase 2.27 — Authorization & Tenant Isolation Audit

## Findings

1. **Critical — shared filesystem workspace state**
   `/api/state` and authoritative wallet persistence previously used the process-global `data/jerry-state.json`, despite Firebase authentication being per user. One authenticated user could therefore read or mutate another user's workspace through the state endpoints.

2. **High — shared security records**
   Approvals, approved external contacts, and the hash-chained audit log were stored in a shared SQLite database without owner scoping. Approval IDs and contact IDs could therefore be used across authenticated users.

3. **High — approval actor binding**
   `consumeApproval` and approval decisions now require the current Firebase UID to own the approval. This prevents one authenticated user from consuming or deciding another user's approval.

## Remediation

- `/api/state` now reads/writes the authenticated user's Cloud SQL workspace.
- `/api/state/reset` resets only the authenticated user's workspace.
- Authoritative wallet persistence no longer writes the process-global state file.
- Security approvals and approved contacts carry `owner_uid` and are queried with that owner boundary.
- Audit chains are maintained and verified per owner UID.
- Security backup export/import is owner-scoped and restore no longer deletes another user's security records.
- Added regression coverage for cross-owner approval/contact access.

## Verification status

Static source audit and regression-test source updates completed. Full `bun run verify:release` remains pending because the current environment lacks Bun and the dependency tree has not been provisioned successfully.
