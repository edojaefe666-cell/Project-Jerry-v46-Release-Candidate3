# Phase 2.44 — Double-entry journal foundation

## Implemented

- Added `drizzle/0004_double_entry_journal.sql` with tenant-scoped journal accounts, entries and lines.
- Monetary postings use PostgreSQL `bigint` integer atomic units (e.g. satoshis), not floating-point values.
- Enforced per-user idempotency keys, same-tenant foreign keys, unique reversal linkage, and one-sided positive debit/credit line constraints.
- Journal entries are assembled as drafts and sealed once as posted. A deferred database constraint trigger checks at commit that each posted entry has at least two lines and balances independently for every asset.
- Posted entries cannot be edited/deleted; journal lines cannot be updated/deleted or appended after posting. Corrections are represented as reversal entries.
- Added pure posting validation and reversal-line helpers with tests; included both test files in the main test command.

## Verification

Executed with Node's built-in test runner: 73 tests total, 72 passed, 0 failed, 1 skipped (the existing PostgreSQL tenant integration test because no disposable PostgreSQL database is available).
The seven new journal unit/schema-contract tests passed.

## Not yet complete / release blockers

- The migration has not been applied to a live PostgreSQL instance in this environment.
- No live database test has yet exercised deferred trigger behavior, concurrent idempotent posting, tenant isolation, or database-enforced immutability.
- Existing wallet settlement/transfer commands are not yet posting through this journal. The existing `ledger_transactions` table remains the current application-facing transaction projection.
- The journal API/service layer, opening-balance migration, account mapping, wallet-to-journal reconciliation, and production cutover are still required before this is authoritative accounting.

This phase is a tested schema and validation foundation, not a claim that Jerry now runs all financial operations through a production double-entry ledger.
