# Jerry Phase 2.12 — Source Reconciliation & Wallet Truth Hardening

## Basis
This build uses `jerry-—-ai-business-&-productivity-partner.zip` as the UI/application base and the Product Engineering Foundation's wallet policy as the safety reference.

## Implemented
- Added `src/lib/walletPolicy.ts` with the canonical USD + native Bitcoin Mainnet policy.
- Added wallet-policy regression tests in `src/lib/walletPolicy.test.ts`.
- Normalized persisted/local/cloud-loaded wallet state so unsupported EVM/USDT/USDC wallet assets and transaction records cannot become financial truth.
- Restricted `/api/wallet/sync-onchain` to Bitcoin Mainnet balance verification.
- Replaced EVM transaction receipt verification with Bitcoin transaction-status verification through the public Bitcoin API.
- Prevented incoming settlement recording unless a confirmed Bitcoin transaction ID is supplied and independently verified.
- Updated the wallet UI's settlement and payment-request language from EVM/Base/USDC to Bitcoin-only terminology.
- Added the missing `test` npm script.

## Important remaining work
This is a targeted reconciliation, not a claim that every security capability from the Product Engineering Foundation has been merged into the AI Studio application.

Still requiring a dedicated integration pass:
- approval-gate persistence/API integration for all high-impact actions;
- CSRF/session controls for non-Firebase authenticated routes where applicable;
- audit-chain and encrypted backup/recovery modules;
- approved-contact and Android bridge modules;
- complete browser/device integration testing;
- full dependency installation and TypeScript/Vite build verification.

## Verification status
- Structural brace/parenthesis checks pass for modified TypeScript files.
- Full `tsc --noEmit` could not complete because the archive has no installed `node_modules`; dependency installation timed out in the execution environment. Therefore a green full-project type/build result is **not claimed**.
