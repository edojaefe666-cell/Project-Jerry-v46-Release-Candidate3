# Jerry Phase 2.17 — Security Audit & Success Verification

## Result

The route/security audit was completed against the Phase 2.16 source and the implementation was hardened where the audit found concrete bypasses.

### Fixed
- High-impact approvals are now **single-use** at the server boundary. Consumption is an atomic SQLite update (`approved` + `consumed_at IS NULL`), preventing concurrent/replayed approval reuse.
- Financial commitment approvals are consumed when a revenue-generating task crosses the protected execution boundary.
- Confidential external-share approvals are consumed when the share authorization crosses the protected boundary.
- Security backup audit metadata now reports the actual v2 backup format.
- Daily summary persistence now receives centralized idempotency protection.
- Learned-discovery and task-execution code no longer manufactures confirmed USDC/Base revenue transactions from projected earnings.
- Task execution now records projected revenue separately from realized/settled revenue and stops on API failure instead of creating a local financial-success fallback.
- Wallet transaction verification in the Wallet UI now uses the centralized authenticated/idempotent API client instead of raw `fetch`.
- Node-native test imports were normalized to explicit `.ts` extensions so the tests can run directly under Node's type stripping mode.

## Verification

Direct Node verification (without installing the project's dependency tree) passes:

- 27 tests
- 27 passed
- 0 failed

This includes:
- Jerry engine behavior
- autonomous-task approval gates
- wallet policy normalization
- security approval single-use behavior
- audit-chain integrity behavior

TypeScript project verification reaches the compiler but is currently blocked only by the missing installed dependency/type environment (`vite/client`), because the archive contains no `node_modules` and dependency provisioning previously timed out.

## Important remaining audit item

The legacy `/api/state` and `/api/cloudsql/workspace` endpoints still accept whole-workspace snapshots. The newer UI has many ordinary mutations that persist through these generic endpoints, so making those endpoints universally approval-gated would break normal workspace operation. The next migration should split sensitive financial/security mutations into dedicated protected commands and leave ordinary workspace persistence as a non-financial state channel.

That is now an identified architecture migration, not an untracked security gap.
