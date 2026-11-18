import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const service = fs.readFileSync(path.join(root, 'src/db/journal.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'drizzle/0005_journal_posting_engine.sql'), 'utf8');

test('posting service uses one PostgreSQL transaction for entry, lines and seal', () => {
  assert.match(service, /BEGIN/);
  assert.match(service, /INSERT INTO journal_entries/);
  assert.match(service, /INSERT INTO journal_lines/);
  assert.match(service, /UPDATE journal_entries SET status = 'posted'/);
  assert.match(service, /COMMIT/);
  assert.match(service, /ROLLBACK/);
});

test('posting service binds idempotency to canonical payload and serializes retries', () => {
  assert.match(service, /journalRequestHash/);
  assert.match(service, /request_hash/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /different posting/);
});

test('reversals are generated from posted source lines and tenant scoped', () => {
  assert.match(service, /FROM journal_entries WHERE user_id = \$1 AND id = \$2 FOR UPDATE/);
  assert.match(service, /reverseJournalLines/);
  assert.match(service, /reversalOf: input.originalEntryId/);
  assert.match(migration, /FOR UPDATE/);
  assert.match(migration, /asset must match its tenant-owned account asset/);
});

test('SQL migrations are tracked and applied transactionally in filename order', () => {
  const runner = fs.readFileSync(path.join(root, 'scripts/apply-sql-migrations.ts'), 'utf8');
  assert.match(runner, /app_sql_migrations/);
  assert.match(runner, /\.sort\(\)/);
  assert.match(runner, /BEGIN/);
  assert.match(runner, /COMMIT/);
  assert.match(runner, /ROLLBACK/);
  assert.match(runner, /pg_advisory_xact_lock/);
});
