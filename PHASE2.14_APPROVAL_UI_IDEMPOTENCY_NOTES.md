# Project Jerry Phase 2.14 — Approval UI + Automatic Idempotency

## Implemented

- Added a first-class **Jerry Approval Center** to the main application navigation.
- Approval Center can create high-impact approval requests, filter pending/approved/rejected requests, and approve/reject pending requests.
- Approval decisions remain one-way and are backed by the existing SecurityStore audit trail.
- Added `src/lib/apiClient.ts` as the frontend mutation boundary.
- `apiFetch()` automatically obtains the current Firebase ID token when available and automatically creates an `Idempotency-Key` for non-GET requests unless one is explicitly supplied.
- `apiJson()` provides the common JSON/error-handling wrapper used by the Approval Center.
- Main App API mutations were moved to `apiFetch`, so callers no longer have to remember to add idempotency headers manually.
- Server-side idempotency protection now covers state reset, approval creation, approval decisions, state writes, and Jerry task execution.
- Replayed requests with the same key and request body return the stored response; reuse of a key with a different request is rejected with HTTP 409.

## Verification status

- Source-level changes were inspected after modification.
- Existing security-store tests remain part of the repository.
- Full Vite/TypeScript verification could not be executed in this environment because the archive does not include `node_modules`; the available TypeScript invocation reports the missing `vite/client` type package before project checking can complete.

## Next Foundation imports

1. Encrypted backup/recovery with explicit owner authorization.
2. Approved-contact and external-share controls.
3. Session/device management and credential rotation UI.
4. Audit-log viewer and integrity status in Jerry's Memory/System area.
5. Wire approval IDs directly into every high-impact execution surface so approval is requested at the point of action, not only from the centralized Approval Center.
