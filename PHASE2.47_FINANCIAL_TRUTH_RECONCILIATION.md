# Phase 2.47 — Authoritative Wallet ↔ Journal Reconciliation

## Implemented
- Added tenant-scoped financial-truth reconciliation between the durable BTC ledger and the posted double-entry wallet account.
- Added an idempotent historical journal backfill for confirmed, independently verified BTC transactions.
- Added a read-only `/api/wallet/financial-truth` report exposing legacy wallet satoshis, journal wallet satoshis, delta, unjournaled confirmed transactions, and unreversed reorged transactions.
- Added `/api/wallet/financial-truth/backfill`; production is fail-closed unless `JERRY_ALLOW_FINANCIAL_BACKFILL=1` is explicitly enabled.
- Historical backfill uses the same wallet journal posting engine and idempotency keys as live reconciliation.
- Reorged/unverified/pending records are never treated as spendable wallet balance during reconciliation.

## Verification
- Added regression coverage for legacy wallet-balance calculation and tenant/production safety contracts.
- Live PostgreSQL reconciliation/backfill remains dependent on a disposable PostgreSQL database.
