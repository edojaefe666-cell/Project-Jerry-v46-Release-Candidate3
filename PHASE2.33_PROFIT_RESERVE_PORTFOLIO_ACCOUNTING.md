# Phase 2.33 — Profit Reserve / Portfolio Accounting Boundary

## Result

Closed an accounting-boundary defect in `calculateUnifiedPortfolio()`.

`profitReserveUsd` is a server-owned saved-profit bucket and is not represented as a
`WalletAsset`. The previous calculation therefore treated the reserve as though it
were already included in wallet balances, subtracting it from `totalBalanceUsd` to
manufacture `investedPrincipalUsd`.

That caused reserve capital to disappear from total owned capital and could produce
incorrect principal semantics when the reserve exceeded wallet balances.

## Correct model

- `investedPrincipalUsd` = USD value of authoritative wallet assets.
- `savedProfitReserveUsd` = separate server-owned reserve bucket.
- `totalBalanceUsd` = invested principal + saved profit reserve.
- Reserve is never counted twice and never subtracted from wallet assets.
- Reserve-only state has zero invested principal and a positive total owned-capital value.

This preserves the product's stated invariant that saved profit is separate from
investment principal.

## Regression coverage

Added tests proving:

1. Adding the reserve does not reduce invested principal.
2. Total owned capital increases exactly by the reserve amount.
3. Reserve-only capital cannot manufacture negative or phantom invested principal.

## Validation

Executed the regression suite directly with Node type stripping:

- 44 tests
- 43 passed
- 0 failed
- 1 skipped

The skipped test is the PostgreSQL tenant-isolation integration test because a
qualified PostgreSQL test database is not available in this environment.

## Release boundary

This fixes application-level accounting semantics. It does not make the release
ready by itself. The dependency-provisioned TypeScript/build/release sequence and
real PostgreSQL/Firebase environment checks remain required before release sign-off.
