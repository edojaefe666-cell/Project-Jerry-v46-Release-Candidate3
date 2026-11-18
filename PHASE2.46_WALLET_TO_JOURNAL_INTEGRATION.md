# Phase 2.46 — Wallet-to-Journal Integration

## Implemented

- Added `src/db/walletJournal.ts` to map finalized Bitcoin wallet transactions into the double-entry journal.
- Confirmed incoming BTC settlements debit `asset:btc:wallet` and credit `income:btc:settlement`.
- Confirmed outgoing BTC transfers debit `asset:btc:transfer-clearing` and credit `asset:btc:wallet`; network fees are separately debited to `expense:btc:network-fee` and credited to the BTC wallet.
- BTC amounts are converted to integer satoshis; floating-point values are not sent to the journal.
- Journal posting uses a deterministic transaction-scoped idempotency key. A retry repairs a crash after the wallet/legacy-ledger commit but before journal posting.
- A transaction marked `reorged` triggers an immutable journal reversal if its confirmed posting exists.
- The Bitcoin reconciliation endpoint now attempts journal posting/reversal after the durable workspace reconciliation. If journal posting fails, the endpoint returns an error; retrying reconciliation retries the journal operation safely.

## Important consistency boundary

Wallet workspace state and journal posting still commit in separate PostgreSQL transactions. Idempotency makes the second operation retryable, but there remains a temporary repairable inconsistency window after a process crash. This is not claimed to be atomic. A transactional outbox or a single shared PostgreSQL transaction across workspace, legacy ledger, idempotency and journal writes is required to eliminate that window.

The current integration journals a wallet transaction only once it is `confirmed` and independently verified on Bitcoin Mainnet. Pending, rejected and unverified transactions are not posted as settled balances.

## Verification

- Added tests for exact BTC-to-satoshi conversion and invalid values.
- Runtime PostgreSQL integration and live Blockstream reconciliation remain unverified in this environment.
