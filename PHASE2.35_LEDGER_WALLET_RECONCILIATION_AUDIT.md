# Phase 2.35 — Ledger ↔ Wallet-State Reconciliation Audit

## Result
Closed two financial-truth consistency gaps.

1. `recordLedgerTransactionsForUser()` previously treated an existing `(user_id, tx_ref)` as immutable and skipped it. That allowed durable ledger rows to retain stale status, valuation, or Bitcoin verification fields after a transaction changed. It now performs a conflict-safe upsert of the full ledger state, including confirmation depth and verified block evidence.
2. Bitcoin reconciliation previously failed to mark a transaction `reorged` when a transaction was still marked `confirmed` but current chain evidence had simply lost the required finality. It now treats any loss of finality from a previously confirmed transaction as `finalityLost` and transitions it to `reorged`.
3. When finality is lost, the prior verified block height/hash are retained as audit evidence instead of being replaced with an unverified/undefined current value.

## Remaining architectural boundary

The PostgreSQL `ledger_transactions` table does not contain every workspace-only transaction field (for example approval metadata). Therefore the ledger remains the durable financial record while workspace JSON remains the richer application projection. The two are kept synchronized on transactional mutation paths rather than blindly replacing the full workspace transaction objects from the ledger.

## Verification

- 48 tests executed
- 47 passed
- 0 failed
- 1 skipped
- Skipped: PostgreSQL tenant-isolation integration test; no qualified PostgreSQL test database is provisioned in this environment.

The canonical dependency/build/release sequence remains pending until Bun, dependencies, PostgreSQL, and the real Firebase runtime are provisioned.
