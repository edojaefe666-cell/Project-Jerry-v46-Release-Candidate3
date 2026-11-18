# Jerry Phase 2.13 — Progressive Security Integration

## Strategy
Preserve the newer Jerry AI/business application and progressively import proven security capabilities from the Product Engineering Foundation. This checkpoint does not replace the Firebase/Cloud SQL application with the Foundation's standalone owner-session stack.

## Implemented
- Added `src/lib/securityStore.ts`, a Node 22 built-in SQLite security store with:
  - persistent high-impact approval records;
  - one-way approval decisions (`pending` -> `approved`/`rejected`);
  - hash-chained audit events;
  - transactional-style idempotency replay detection for authenticated mutating requests that supply `Idempotency-Key`.
- Added authenticated security endpoints:
  - `GET /api/security/approvals`
  - `POST /api/security/approvals`
  - `POST /api/security/approvals/:id/decision`
  - `GET /api/security/audit/integrity`
- Added authentication to local state mutation endpoints and wallet on-chain verification/synchronization routes.
- Added idempotency handling to `/api/state` and `/api/cloudsql/workspace` writes without breaking callers that do not yet provide a key.
- Added audit events for state changes, Cloud SQL workspace/summary writes, and high-impact Jerry execution/self-program/upgrade requests.
- Added a financial execution gate: `/api/jerry/execute-task` now requires an approved `financial_commitment` approval when `expectedRevenueUsd > 0`.
- Removed the misleading claim that task execution records USDC revenue; execution results now distinguish projected USD amounts from verified blockchain settlement.

## Verification
- `node --check --experimental-strip-types` passed for the modified server and security-store TypeScript files.
- New `securityStore.test.ts`: **2 passed, 0 failed** under Node 22.16.0 using built-in type stripping.
- Existing `walletPolicy.test.ts` could not be run directly with Node's type stripping because its extensionless TypeScript import (`./seedData`) is not resolved by Node's native ESM loader. This is a test-runner/environment limitation, not counted as a passing wallet test.
- Full Vite build/type-check remains pending until project dependencies are installed.

## Still required
- Add a UI approval queue to the newer Jerry interface.
- Require fresh owner re-authentication for especially sensitive approvals.
- Integrate idempotency keys into the frontend API helper for every mutating request.
- Add encrypted backup/restore and recovery verification.
- Complete strict host/proxy deployment policy and dependency audit.
- Add migration/version management for the security SQLite store.
- Complete browser integration tests against Firebase authentication and Cloud SQL.
