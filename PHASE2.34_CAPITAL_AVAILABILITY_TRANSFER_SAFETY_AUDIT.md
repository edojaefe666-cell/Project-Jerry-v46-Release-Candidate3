# Phase 2.34 — Capital Availability & Transfer Safety Audit

## Result
Closed a material transfer authorization and spendable-balance gap.

## Findings fixed

1. `/api/wallet/commands/submit-transfer` previously accepted a transfer without consuming or validating the `approvalId` supplied by the client. The request could therefore be recorded as `pending_approval` even when no matching high-impact Bitcoin approval existed.
2. Approval scope is now exact: asset, network, destination, BTC amount, and fee must match an approved, unexpired `bitcoin_transfer` authorization owned by the authenticated Firebase UID.
3. Pending outgoing transfers now reserve `amount + fee` from spendable BTC. A second transfer cannot consume the same balance while the first transfer remains pending approval.
4. Rejected and reorged outgoing transactions do not remain reserved.
5. The client now actually sends the approval ID to the server.
6. Transfer authorization remains a durable pending transaction; no client-side `confirmed` status is trusted as financial truth.
7. Durable task execution IDs use `crypto.randomUUID()` rather than timestamp/random concatenation.
8. Production port validation now uses `process.env.PORT` with a strict 1–65535 range.

## Regression coverage

- Spendable balance excludes pending outgoing reservations.
- Rejected/reorged outgoing records release the reservation.
- Transfer validation fails when a pending reservation makes the requested transfer unaffordable.
- Existing exact-scope, one-time, expiry, tenant-isolation and financial regression tests remain passing.

## Environment limitation

The PostgreSQL tenant-isolation integration test remains skipped because the current execution environment does not provide the required qualified PostgreSQL test database. The canonical dependency/build/release sequence is therefore not declared passed.
