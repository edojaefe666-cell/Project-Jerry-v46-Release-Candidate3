# Phase 2.42 — Balance Integrity and Incoming Settlement Verification

## Issue found
The incoming settlement endpoint previously accepted a user-supplied BTC amount and a confirmed transaction hash without checking the transaction's outputs. A confirmed transaction paying an unrelated address (or paying less BTC) could therefore be submitted with an inflated amount and reach the approval lifecycle.

## Patch
- Incoming settlement now requires a valid Bitcoin transaction hash; hash-less settlement records are rejected.
- It loads configured Bitcoin Mainnet receiving addresses from the authenticated user's workspace.
- It retrieves the full transaction from Blockstream and checks the returned transaction ID against the submitted hash.
- It sums only outputs paid to the workspace's configured receiving addresses and requires the exact submitted satoshi amount.
- It still requires six confirmations and a block height/hash before creating the pending settlement and approval.
- The idempotent database mutation rechecks that at least one verified receiving address is still configured, preventing a stale-address race between chain lookup and commit.
- Added pure validation tests for exact payment, unrelated destination, amount inflation, hash substitution, missing receiving addresses, and invalid output values.

## Verification
- Focused Node test run: 39 passed, 0 failed, 0 skipped.
- This included wallet policy, portfolio/revenue reconciliation, existing ledger persistence/reorg regression tests, and the new settlement evidence tests.
- Real Blockstream network calls and PostgreSQL transaction/failure-injection tests were not run in this environment. The project still needs the Bun/dependency/PostgreSQL release environment for full verification.

## Remaining integrity boundary
- Outgoing transfer approval is consumed in the local SQLite security store from inside a PostgreSQL transaction callback. PostgreSQL rollback cannot roll back that separate SQLite side effect; a process/database failure in that window can consume approval without persisting the transfer. This needs a durable cross-store reservation/commit protocol or consolidation of the authorization record into the same transactional database before production financial use.
- The current ledger stores one transaction row per wallet event rather than balanced debit/credit journal entries. This is adequate for the present wallet projection but is not yet a complete double-entry accounting ledger.
