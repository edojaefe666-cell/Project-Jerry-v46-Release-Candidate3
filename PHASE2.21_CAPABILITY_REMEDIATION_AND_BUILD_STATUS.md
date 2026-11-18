# Jerry Phase 2.21 — Capability Remediation & Build Status

## Completed in this pass

### C1 — Server-authoritative financial persistence
- Generic `/api/state` and `/api/cloudsql/workspace` writes now reject changes to `walletAssets`, `transactions`, `profitReserveUsd`, and `externalWallets` with `FINANCIAL_COMMAND_REQUIRED`.
- Added server-authoritative Bitcoin settlement recording at `/api/wallet/record-settlement`.
- Settlement requires a confirmed Bitcoin Mainnet transaction verified through Blockstream before wallet balance or Profit Reserve changes.
- Duplicate Bitcoin transaction IDs are rejected.
- Added server-authoritative outgoing Bitcoin transaction recording at `/api/wallet/transactions`.
- Outgoing transaction authorization requires a consumed `bitcoin_transfer` approval and never marks the transaction as on-chain confirmed.
- Confirmation of an outgoing transaction through the legacy decision endpoint is explicitly blocked until independent on-chain verification.

### C2/C3/C6 — Crypto policy cleanup
- Production wallet types now expose BTC only.
- Seed/demo wallet state contains only BTC/Bitcoin Mainnet.
- Removed EVM/USDC/USDT/Base/Polygon/Ethereum wallet seed records.
- Removed stale Base/USDC settlement copy from primary wallet/business UI surfaces.
- Live market-price contract now returns BTC only.
- Wallet sync persists only server-authoritative BTC balances/prices/addresses.

### C4 — Daily discovery authentication
- `/api/jerry/discover-daily-ways` now requires Firebase authentication.
- Discovery results are explicitly treated as advisory/projected opportunities rather than realized financial truth.

### Client capability restoration
- Restored missing `handleRunDailyProfitAutopilot` and `handleDiscoverDailyWays` implementations in `App.tsx`.
- Daily Profit Autopilot now creates an operational execution record and projected opportunity; it no longer manufactures wallet settlement or Profit Reserve credit.
- Daily discovery uses centralized `apiFetch`, so authentication and automatic idempotency apply.
- Wallet address/balance synchronization now consumes the server-authoritative returned state.
- Outgoing wallet UI requires a `bitcoin_transfer` approval ID before submission.

## Verification

A project-wide TypeScript check still cannot complete because dependencies are not installed in this environment. The available global TypeScript compiler reaches the missing dependency boundary and reports unresolved packages (`react`, `express`, `vite/client`, Firebase, Drizzle, etc.). No dependency versions or lockfiles were changed.

Static source checks confirm:
- no remaining EVM/USDC/USDT/Base/Polygon/Ethereum wallet capability in production seed data or primary UI copy;
- missing App handlers are restored;
- protected financial command routes are present;
- Bitcoin settlement and transfer boundaries are server-authoritative.

## Next step

Provision Bun using the existing `bun.lock` in a network-enabled environment, then run:

1. `bun install --frozen-lockfile`
2. `bun run lint`
3. `bun run build`
4. `bun test`
5. integration/security verification

Only failures reproduced by those commands should drive the next code changes.
