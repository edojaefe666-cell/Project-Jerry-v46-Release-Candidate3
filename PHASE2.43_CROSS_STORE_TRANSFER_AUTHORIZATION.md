# Phase 2.43 — Cross-store transfer authorization recovery

## Finding

Outgoing BTC transfer submission previously consumed an approval in SQLite from inside a PostgreSQL workspace/idempotency transaction. SQLite cannot participate in the PostgreSQL transaction. If PostgreSQL rolled back after SQLite consumption, the approval was permanently burned without a durable transfer record.

## Change

The transfer path now uses a recoverable reservation protocol:

1. Derive a stable SHA-256 reservation ID from the authenticated UID, approval ID, idempotency key, and canonical command.
2. Reserve the exact-scope, approved, unexpired SQLite approval without consuming it.
3. Commit the pending transfer, workspace state, ledger row, and idempotency response together in PostgreSQL.
4. Only after PostgreSQL commits, finalize the matching SQLite reservation as consumed.
5. If PostgreSQL fails, release the reservation. If the process crashes after PostgreSQL commits but before SQLite finalization, retrying the same idempotency key returns the committed result and retries finalization.
6. A generic approval-consumption call cannot consume an approval while it is reserved.

Reservations are leased for the approval TTL (15 minutes). A stale reservation can be reclaimed only while the approval itself remains unexpired. Reservation identifiers are not included in API approval projections.

## Verification

- SecurityStore tests: 8 passed, 0 failed.
- Full available regression suite: 65 passed, 0 failed, 1 skipped (PostgreSQL tenant integration requires a disposable PostgreSQL instance).
- Node syntax checks passed for `server.ts`, `securityStore.ts`, and `securityStore.test.ts`.
- Not yet verified: live PostgreSQL failure injection, crash/restart recovery against a running service, Bun frozen-lockfile install, TypeScript project check, production build.

## Remaining accounting work

This patch closes the approval-consumption ordering gap, but SQLite and PostgreSQL are still separate stores. It is a recoverable saga, not a distributed ACID transaction. A future migration of approvals into PostgreSQL would remove the cross-store boundary entirely.

Double-entry accounting is not implemented by this patch. The existing `ledger_transactions` table remains a transaction journal, not a balanced debit/credit general ledger.
