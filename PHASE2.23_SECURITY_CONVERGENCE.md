# Project Jerry Phase 2.23 — Financial Truth & Wallet Convergence

## Implemented

- Bitcoin settlement recording now verifies the **full confirmed transaction**, not just confirmation status.
- Incoming settlement credits are accepted only when the confirmed transaction pays Jerry's configured Bitcoin receiving address for the **exact submitted BTC amount**.
- Settlement recording now fails closed when no Bitcoin receiving address is configured.
- Outgoing Bitcoin transfer validation now checks amount/fee/balance before consuming the one-shot `bitcoin_transfer` approval.
- Removed the stale EVM-looking external-wallet account label.
- Removed stale EIP-681 wording from the Bitcoin wallet UI.
- Removed the misleading "self-custody signing" capability claim from the wallet header; the current UI provides address linking and public-chain verification, not transaction signing/broadcasting.
- Local transfer validation now rejects unsupported asset/network combinations instead of relying on type casts or UI filtering.

## Verification status

- Source-level searches were run against the modified canonical source for stale EVM/USDC/USDT wallet terms.
- Full TypeScript/build/test verification remains pending because this runtime does not have Bun and dependency installation has previously timed out.
- No claim of a green production build is made until the CI environment executes `bun install --frozen-lockfile`, `bun run lint`, `bun run build`, and `bun test`.

## Remaining high-value audit item

Profit-goal calculations currently consume `WalletTransaction.amount` as if it were USD. Since canonical crypto financial truth is BTC while Profit Reserve is USD, settlement records should carry an authoritative USD-at-settlement value (or equivalent valuation record) and profit-goal calculations should use that USD value rather than raw BTC units.
