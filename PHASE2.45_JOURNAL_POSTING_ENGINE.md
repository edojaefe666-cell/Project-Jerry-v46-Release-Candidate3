# Phase 2.45 — Transactional Double-Entry Posting Engine

## Implemented

- Added `src/db/journal.ts` with tenant-scoped journal posting, canonical payload hashing, per-user idempotency serialization, immutable posting, reversal creation, and posted account-balance queries.
- Account creation, entry creation, line insertion, and the draft-to-posted transition run in one PostgreSQL transaction. A failed line insert or deferred database balance constraint rolls back the complete posting.
- Idempotency keys are bound to a SHA-256 digest of the normalized posting request. Reusing a key for different content is rejected; a matching retry returns the original posted entry.
- Reversals lock and read the original posted entry, swap debit/credit lines, and create a new linked entry. Original posted records are not modified.
- Amounts remain integer atomic units and are checked against PostgreSQL BIGINT capacity.
- Hardened the line-insert trigger to lock the parent entry while checking draft status, preventing a line insert racing with the seal operation. It also verifies that the line asset matches its tenant-owned account asset.
- Added a tracked SQL migration runner. `db:test:push` now provisions Drizzle schema and then applies SQL migrations 0001–0005 in order. This closes a serious gap: the previous CI provisioning command did not apply the handwritten 0004 journal migration.
- Added a dedicated PostgreSQL journal integration gate to CI.

## Verification performed in this environment

- Full available regression suite: 75 tests; 73 passed, 0 failed, 2 skipped.
- The two skipped tests are PostgreSQL integration tests because this environment has no configured disposable PostgreSQL service.
- Journal unit/schema/contract tests: 11 passed, 0 failed, 1 PostgreSQL integration test skipped.
- Node TypeScript syntax checks for the posting service, migration runner, and integration test passed.

## Outstanding

- Run the PostgreSQL journal integration test in CI or another disposable PostgreSQL 16 environment. It covers posting, identical retry, mismatched idempotency replay, unbalanced rejection, tenant isolation, reversal, and zeroed post-reversal account balances.
- Run frozen Bun install, TypeScript check, and production build in CI. Bun and PostgreSQL are not installed in this execution environment.
- The journal posting service is a foundation and is not yet wired as the authoritative posting path for all existing wallet settlement and transfer commands. That is the next integration gate; do not treat legacy wallet balance projections as reconciled merely because journal tables exist.

## Commands

```bash
bun run db:test:push
JERRY_JOURNAL_TEST_DATABASE=1 NODE_ENV=test SQL_HOST=127.0.0.1 SQL_USER=jerry_test SQL_PASSWORD=jerry_test SQL_DB_NAME=jerry_tenant_test node --import tsx --test src/db/journal.integration.test.ts
bun run verify:release
```

For a production deployment, run the existing schema provisioning process followed by `bun run db:migrate` using the deployment's migration-capable database credentials before enabling journal-dependent features.
