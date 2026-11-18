# Phase 2.31 — Transaction-State Integrity Audit

## Findings and remediation

1. **Concurrent settlement race** — fixed. Confirmed BTC settlements now mutate the user's workspace and ledger under a PostgreSQL transaction with a row lock on the user record. Duplicate `txHash` checks occur inside that critical section.
2. **Ledger duplicate race** — fixed. Added a database uniqueness constraint on `(user_id, tx_ref)` and conflict-safe ledger insertion.
3. **Concurrent pending outgoing transfers could exceed available BTC** — fixed. Pending authorized outgoing BTC amounts + fees are treated as reserved when validating a new transfer.
4. **Rejected/duplicate transaction errors were previously generic 500s** — fixed with explicit 404/409 responses.
5. **Wallet state + ledger persistence could previously be split across separate writes** — wallet mutation paths audited here now use the transactional workspace mutation helper so state and ledger insertion commit together.

## Remaining boundary

Bitcoin transfers are still only queued; Jerry does not yet sign/broadcast them. A queued transfer therefore cannot be treated as an on-chain debit until independent Bitcoin verification exists.

## Verification status

Source-level audit completed. Full `bun run verify:release` remains pending because the environment does not have Bun and dependency installation has previously timed out.
