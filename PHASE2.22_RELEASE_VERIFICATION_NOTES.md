# Phase 2.22 — Release Verification Preparation

## Completed
- Re-checked the Phase 2.21 source against the release verification path.
- Removed the remaining stale EVM browser-provider code from `WalletDashboard.tsx`; the component now treats external wallets as Bitcoin-compatible only.
- Added a canonical `verify:release` script: frozen Bun install is followed by TypeScript check, Vite production build, and the Node test suite.
- Added GitHub Actions CI using Bun and `bun install --frozen-lockfile`, matching the repository's existing `bun.lock`.
- Added `RELEASE_VERIFICATION.md` documenting the reproducible verification command and release gate.

## Environment limitation
The current execution environment has Node/npm but no Bun binary and cannot resolve the Bun download host. An npm dependency install also timed out. Therefore a local green Vite/TypeScript/test result is not claimed here.

## Release gate
A Jerry release candidate is not considered verified until:

1. `bun install --frozen-lockfile` succeeds.
2. `bun run lint` succeeds.
3. `bun run build` succeeds.
4. `bun test` succeeds.
5. The resulting build is inspected for unsupported crypto/payment strings and protected-route regressions.

The source and lockfile are preserved without dependency upgrades or lockfile replacement.
