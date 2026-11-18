# Phase 2.32 — Bitcoin Finality & Reorg Safety

## Implemented

1. **Finality gate** — incoming Bitcoin settlements now require 6 confirmations before any BTC balance or USD Profit Reserve credit is created. A merely confirmed transaction is no longer sufficient.
2. **Chain identity capture** — credited settlements store confirmation depth, verified block height, and verified block hash alongside the transaction.
3. **Reorg reconciliation** — authenticated `/api/wallet/reconcile-settlements` re-checks credited on-chain settlements against the current Bitcoin chain. If a previously credited transaction disappears from the confirmed chain or its recorded block identity changes, Jerry marks the settlement `reorged` and reverses the corresponding BTC balance and stored USD valuation atomically.
4. **Fail-closed reconciliation** — if Bitcoin verification is unavailable, no financial state is changed. If the authoritative stored balance/reserve cannot safely absorb a reversal, the system stops and reports manual reconciliation rather than creating a negative balance.
5. **Ledger lifecycle synchronization** — transactional workspace mutation now updates the durable PostgreSQL ledger when an existing transaction changes state, so a reorged settlement cannot remain `confirmed` in the ledger while the workspace says otherwise.
6. **Verification endpoint alignment** — `/api/wallet/verify-tx` now reports a transaction as verified only after the same 6-confirmation policy is satisfied.
7. **Phase 2.31 source defects fixed while continuing the audit** — removed a duplicate `INITIAL_JERRY_STATE` import in `src/db/users.ts` and fixed the settlement route's undefined `response` reference.

## Important boundary

Jerry still does not sign or broadcast Bitcoin transactions. Outgoing transfers remain queued until an independently verified Bitcoin broadcast path is implemented.

## Verification

`tsc --noEmit` reaches the existing environment dependency boundary (`Cannot find type definition file for vite/client`) because project dependencies are not installed in this runtime. Full `bun run verify:release` remains unexecuted for the same environment reason.
