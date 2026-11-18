# Phase 2.36 — Client State Resurrection Audit

Status: CLOSED at application level.

## Findings

Jerry's generic `/api/state` and `/api/cloudsql/workspace` persistence paths now merge incoming client state against the freshly re-read authoritative server state while holding the per-user PostgreSQL transaction advisory lock. Financial/security fields are therefore server-owned and cannot be resurrected from an older browser snapshot.

Protected fields:
- walletAssets
- externalWallets
- transactions
- profitReserveUsd
- approvals
- selfUpgrades
- lastWalletSyncAt

Wallet synchronization also uses the same atomic workspace mutation path. No non-test code directly writes the workspace JSON outside the guarded persistence layer.

The client load effects use an active-request guard, preventing an unmounted/stale response from applying state after the request lifecycle has ended.

## Regression coverage

Added `src/lib/clientStateResurrectionRegression.test.ts` covering:
1. Protected financial/security fields cannot be overwritten by generic workspace writes.
2. Financial workspace writes use the per-user transaction advisory lock.
3. Client state loading ignores stale/unmounted responses.
4. Generic `/api/state` PUT cannot bypass the protected merge.

## Remaining environment gate

Real PostgreSQL tenant-isolation execution remains pending because this audit environment does not provide the required PostgreSQL test database. Application-level regression tests are passing; this does not constitute release readiness.
