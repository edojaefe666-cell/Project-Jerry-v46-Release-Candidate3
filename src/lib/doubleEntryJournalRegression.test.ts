import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const migration = fs.readFileSync(path.join(root, 'drizzle/0004_double_entry_journal.sql'), 'utf8');

test('double-entry schema is tenant-scoped and idempotent', () => {
  assert.match(migration, /UNIQUE \(user_id, idempotency_key\)/);
  assert.match(migration, /UNIQUE \(user_id, account_code, asset\)/);
  assert.match(migration, /FOREIGN KEY \(user_id, journal_entry_id\)/);
  assert.match(migration, /FOREIGN KEY \(user_id, account_id\)/);
});

test('database seals entries once and forbids later line mutation', () => {
  assert.match(migration, /OLD\.status <> 'draft' OR NEW\.status <> 'posted'/);
  assert.match(migration, /Journal lines can only be added to a draft entry/);
  assert.match(migration, /Journal lines are immutable/);
  assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /sum\(debit_units\) <> sum\(credit_units\)/);
});

test('reversal linkage is unique and cannot cross tenant boundaries', () => {
  assert.match(migration, /FOREIGN KEY \(user_id, reversal_of\)/);
  assert.match(migration, /UNIQUE \(reversal_of\)/);
});
