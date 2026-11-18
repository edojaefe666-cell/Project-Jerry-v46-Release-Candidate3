# Phase 2.23 — BTC/USD Settlement Valuation Boundary

## Implemented

- Confirmed Bitcoin settlements now capture a fresh server-side BTC/USD spot valuation at the moment the settlement is accepted.
- The settlement transaction stores `usdValue`, `usdValuationAt`, and `usdValuationSource`.
- Profit Reserve credit uses that server-side valuation rather than a stale client/UI `usdPrice`.
- The credited BTC wallet asset is refreshed to the same valuation and source.
- Settlement fails closed when a usable BTC/USD quote is unavailable; no Profit Reserve or wallet credit is written in that case.
- Added a regression test proving verified BTC transactions can carry an authoritative USD valuation without changing the BTC-only financial policy.

## Verification boundary

The source-level change was inspected directly. Full `bun run verify:release` remains pending because the execution environment does not currently provide Bun and dependency installation previously timed out.

## Next financial-truth target

Use the stored `usdValue` on verified BTC settlement records when generating historical revenue/profit reports, rather than re-valuing historical BTC amounts at the current market price.
