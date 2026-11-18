# Jerry Phase 2.16 — Server Approval Boundaries

## Scope

This increment makes the remaining identified high-impact mutation paths fail closed at the server boundary when no matching approved action ID is supplied.

### Protected routes

- `POST /api/state/reset` → requires an approved `high_impact_change` action.
- `POST /api/security/restore` → requires an approved `high_impact_change` action in addition to the existing `RESTORE_JERRY` confirmation and encrypted-backup validation.
- `POST /api/jerry/self-program` → requires an approved `high_impact_change` action before Jerry will generate a self-programming proposal.
- `POST /api/jerry/execute-task` → existing `financial_commitment` approval remains required when a positive projected revenue amount is recorded.
- `POST /api/security/external-share/authorize` → existing approved `confidential_external_share` + active approved contact requirements remain enforced.

## UI wiring

- Self-Programming Studio now requires the approved high-impact change ID before submitting a self-programming request.
- Restore UI requires the approved high-impact change ID before restore can be submitted.
- Blueprint Seed Reset requires the approved high-impact change ID before reset can be submitted.
- Security → Approvals remains the place where the owner creates and approves the required action.

## Fail-closed behavior

The server checks the supplied `approvalId` against the requested action and requires `status === approved`. Missing, unknown, mismatched, or pending IDs return HTTP 409 with `APPROVAL_REQUIRED`.

## Verification limitation

The archive does not contain installed dependencies. `npm test` therefore cannot execute because `tsx` is not installed in the current runtime. This pass was inspected statically after editing; full Vite/TypeScript verification remains pending dependency provisioning.
