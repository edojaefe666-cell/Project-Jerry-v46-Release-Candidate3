# Phase 2.29 — Approval Lifecycle Audit

## Findings

- High-impact approvals were owner-scoped and single-use, but had no freshness boundary.
- A generic `financial_commitment` approval could authorize a larger revenue value than the owner explicitly entered in the Approval Center because the execution boundary did not compare the requested USD value with `amountUsd`.
- The wallet confirmation UI said `Approve & Sign Transaction` although the current implementation does not perform Bitcoin signing or broadcast.

## Remediation

- Added a 15-minute approval TTL. Expired approvals cannot be decided or consumed.
- `financial_commitment` approvals now require a positive USD authorization limit.
- `/api/jerry/execute-task` rejects a requested USD value above the approved limit with `APPROVAL_SCOPE_EXCEEDED`.
- Invalid approval USD amounts are rejected at creation.
- Wallet UI wording now says `Authorize Bitcoin Transfer`, avoiding a false claim that the application signs a transaction.

## Remaining limitation

`bitcoin_transfer` approvals still use a human-readable summary rather than a cryptographically bound transfer scope (destination/amount/fee). The next approval-hardening pass should bind an approval to the exact transfer intent before a Bitcoin transaction can be recorded.

## Verification status

Static source audit completed. Full Bun lint/build/test execution remains pending because the current environment does not have Bun and dependency installation has previously timed out.

## Phase 2.30 — Exact approval intent binding

- Bitcoin transfer approvals now persist a canonical scope hash.
- Scope includes BTC asset, Bitcoin Mainnet network, destination, amount, and fee.
- Execution consumes the approval only when the submitted transfer exactly matches the approved scope.
- Approval expiry is enforced atomically during consumption, so an expired approval is not burned.
- Backup/restore preserves approval scope metadata.
- Added regression tests for scope mismatch and expired-approval non-consumption.
- The Security Center now collects exact Bitcoin transfer scope when creating a `bitcoin_transfer` approval.

Full `bun run verify:release` remains pending until the dependency/runtime environment is provisioned.
