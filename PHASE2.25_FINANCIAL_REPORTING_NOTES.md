# Phase 2.25 — Historical USD Reporting Boundary

This phase continues the Phase 2.24 BTC/USD settlement boundary.

## Implemented

- Profit-goal calculations no longer identify settled revenue by `tx-rev-*` ID prefix.
- Confirmed `business_revenue` transactions are included regardless of their ID format.
- BTC settlements use the authoritative `usdValue` captured at settlement time.
- Legacy revenue records without `usdValue` fall back to `amount`, preserving compatibility with historical USD-denominated records.
- Daily, weekly, monthly, and daily-growth calculations all use the same USD valuation rule.
- Cloud SQL ledger persistence now stores `usdValue`, `usdValuationAt`, and `usdValuationSource`.
- Monthly transaction CSV export includes the historical USD valuation metadata.
- Added a PostgreSQL migration for the three new ledger valuation columns.
- Added regression coverage proving a BTC settlement of 0.02 BTC with a captured $900 USD valuation contributes $900—not 0.02—to profit reporting.

## Verification boundary

Full `bun run verify:release` remains pending until Bun and project dependencies can be provisioned in the execution environment. Source-level changes were inspected after modification.

## Next boundary

Audit every remaining financial/reporting consumer for assumptions that `WalletTransaction.amount` is USD. Any such consumer must either use `usdValue` for BTC settlements or explicitly operate in BTC.
