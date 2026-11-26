# Jerry multi-generation reconciliation register

**Status:** active reconciliation; not a release approval  
**Canonical working line:** `v46-verification-progress`  
**Change isolation:** `reconcile/jerry-owner-only-auth`  
**Review:** PR #2 (draft)  
**Rule:** no archive is extracted over another archive; originals remain immutable evidence.

## Source lineages observed

| Source | What inspection established | Treatment |
|---|---|---|
| Dropbox Step 7 Verification v10 | A ZIP with multiple project files; latest of the inspected Step 7 sequence | Preserve as verification evidence; do not assume it supersedes every source branch |
| Dropbox Phase 2.40B | Later financial settlement/reconciliation material, including PostgreSQL/CI integration and migration verification | Integrate only after file-level comparison and tests against canonical v46 |
| Dropbox Phase 2.40A | Preceding Phase 2.40 generation | Retain as predecessor/diff evidence |
| Dropbox Phase 0 v1.1.5 | Early foundation/validation lineage | Preserve foundational requirements and compatible device work |
| Dropbox Replit upload v1.0 | Earlier Android/native bridge and app foundation | Treat as client/device integration source, not a replacement backend |
| GitHub `v46-verification-progress` | React/TypeScript codebase with journal, outbox, reconciliation, goal execution and engineering/browser control-plane modules | Current canonical engineering baseline for code review |
| GitHub `main` and `roadmap/jerry-unified-master-plan` | GitHub compare API reports no common ancestor with `v46-verification-progress` | Keep separate; reconcile by file/content provenance, never force-merge |

## Verified observations and unresolved work

1. The canonical v46 auth middleware previously verified Firebase tokens with revocation checking but did not enforce a sole owner UID.
2. PR #2 adds a testable owner UID policy, production fail-closed behavior when `JERRY_OWNER_UID` is absent, tests, and deployment guidance. It is draft and not merged or deployed.
3. The owner UID must be independently verified and configured in server-side secrets before production. It must not be embedded in Android/client bundles.
4. The server contains financial paths that use `runIdempotentWorkspaceCommand` and other paths that use `updateWorkspaceForUserAtomic`. Confirm journal/outbox coverage for every money-affecting mutation before declaring financial integrity complete.
5. The earlier Android bridge material describes incomplete durable server integration and disabled live call actions. Treat Android release readiness as unverified.
6. A complete test suite, PostgreSQL integration run, Android build, production deployment gate, and final release archive have not yet been verified in this reconciliation.

## Integration rules

- Preserve source archives and record hashes before extraction or transformation.
- Build a manifest of paths, hashes, package versions, migrations, tests, and runtime entry points for every candidate archive.
- Classify each path as identical, additive, divergent, obsolete, or security-sensitive.
- Prefer explicit adapters and migrations over overwriting files.
- Resolve schema and API conflicts with tests and migration compatibility checks.
- Keep Android/native code as a client/device boundary; keep owner authorization, policy, audit, financial ledger and action execution authoritative on the server.
- Never represent mock/demo financial values as real balances or revenue.
- Never treat a queued, simulated, or locally completed task as externally executed without independently verified evidence.
- Financial commitments, transfers, trades, purchases, subscriptions, contracts, external publishing, destructive operations, production releases and security-policy changes require scoped owner approval.
- Preserve an owner-controlled emergency stop independent of the AI and cloud execution path.

## Next engineering gates

1. Produce archive-level file/hash manifests and source-to-source diff reports.
2. Compare Phase 2.40B journal/reconciliation implementations with v46 journal/outbox code; port missing compatible behavior through reviewed commits.
3. Audit every server mutation for journal coverage, idempotency, tenant/owner boundary, approval and audit evidence.
4. Run focused tests, complete unit/regression suite, PostgreSQL migration/integration tests, and CI.
5. Reconcile Android bridge interfaces and permissions against the canonical API; build and test on the supported Android baseline.
6. Verify emergency-stop behavior, restart/recovery, backup/restore and audit integrity.
7. Produce a release candidate only after all gates pass; retain source provenance and a signed/hashed release manifest.

## Financial journal/outbox remediation added on the reconciliation branch

- Centralized the eligibility rule for wallet journal events: only confirmed, independently on-chain-verified BTC on Bitcoin Mainnet, plus reorg events, are eligible.
- Ledger sync now upserts all supplied wallet transaction states and enqueues eligible outbox events in the same database transaction. This fixes the earlier-state gap where an existing pending/unverified record could become confirmed/reorged but be skipped because its transaction reference already existed.
- Atomic workspace updates and idempotent workspace commands also enqueue eligible events inside their existing transaction.
- Outbox draining now validates its batch limit (1–500) and reclaims rows stuck in `processing` for more than five minutes. Journal posting is designed to be idempotent to make retry after worker interruption safe.
- Added eligibility tests and included them in the standard test script.

**Not yet proven:** these changes have not been executed against a live PostgreSQL test database or run through the complete TypeScript/test/build pipeline. The outbox worker's retry and stale-lease behavior still requires integration tests under concurrent workers and simulated crashes. Historical Phase 2.40B parity is not yet established.

## Current result

This register records the inspected lineage and committed remediation decisions. It does not claim that all Dropbox ZIPs have been byte-extracted and compared, that branches have been merged, or that Jerry is release-ready.
