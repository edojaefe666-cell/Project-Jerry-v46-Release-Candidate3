# Phase 2.48 — Authoritative Wallet Balance Enforcement

## Implemented

- Posted double-entry journal `asset:btc:wallet` is now the server authority for BTC spendable balance.
- `/api/state` overlays the BTC wallet balance from the journal instead of trusting persisted/client wallet state.
- `/api/wallet/sync-onchain` treats public-address chain balance as evidence only; it may update address/price metadata but cannot overwrite the accounting balance.
- `/api/wallet/commands/submit-transfer` checks the journal BTC balance in satoshis and subtracts pending outgoing reservations before authorizing a transfer.
- Wallet balance arithmetic for authorization remains integer-satoshi based.
- Existing wallet transaction reconciliation/backfill continues to create/reverse journal entries idempotently.

## Verification

Targeted accounting/security regression suite: 14 passed, 0 failed, 0 skipped.

Live PostgreSQL execution remains required before declaring the database-backed authoritative balance gate fully passed.
