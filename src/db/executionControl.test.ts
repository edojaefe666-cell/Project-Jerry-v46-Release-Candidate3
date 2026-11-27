import test from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { readSharedExecutionControl, updateSharedExecutionControl } from './executionControl.ts';

test('shared execution control fails closed when the singleton row is missing', async () => {
  await assert.rejects(
    readSharedExecutionControl({ query: async () => ({ rows: [] }) } as never),
    /row is missing or invalid/,
  );
});

test('shared execution control rejects an invalid epoch', async () => {
  await assert.rejects(
    readSharedExecutionControl({
      query: async () => ({ rows: [{ stopped: false, epoch: '0', reason: 'x', updated_by: 'owner', updated_at: new Date().toISOString() }] }),
    } as never),
    /epoch is invalid/,
  );
});

test('execution lease holds a shared row lock until release', async () => {
  const calls: string[] = [];
  const client = {
    query: async (query: string) => {
      calls.push(query);
      if (query.includes('SELECT stopped')) {
        return { rows: [{ stopped: false, epoch: '4', reason: 'ready', updated_by: 'owner', updated_at: new Date().toISOString() }] };
      }
      return { rows: [] };
    },
    release: () => { calls.push('RELEASE'); },
  };
  const { acquireSharedExecutionLease } = await import('./executionControl.ts');
  const lease = await acquireSharedExecutionLease(async () => client as unknown as PoolClient);
  assert.equal(lease.epoch, 4);
  assert.ok(calls.includes('BEGIN'));
  assert.ok(calls.some((query) => query.includes('FOR SHARE')));
  assert.equal(calls.includes('COMMIT'), false);
  await lease.release();
  await lease.release();
  assert.equal(calls.filter((query) => query === 'COMMIT').length, 1);
  assert.equal(calls.filter((query) => query === 'RELEASE').length, 1);
});

test('execution lease refuses stopped state and rolls back', async () => {
  const calls: string[] = [];
  const client = {
    query: async (query: string) => {
      calls.push(query);
      if (query.includes('SELECT stopped')) {
        return { rows: [{ stopped: true, epoch: '5', reason: 'owner stop', updated_by: 'owner', updated_at: new Date().toISOString() }] };
      }
      return { rows: [] };
    },
    release: () => { calls.push('RELEASE'); },
  };
  const { acquireSharedExecutionLease } = await import('./executionControl.ts');
  await assert.rejects(
    acquireSharedExecutionLease(async () => client as unknown as PoolClient),
    /emergency stop is engaged/,
  );
  assert.ok(calls.includes('ROLLBACK'));
  assert.equal(calls.at(-1), 'RELEASE');
});

test('owner resume increments the shared epoch and audits in one transaction', async () => {
  const calls: Array<{ query: string; values?: unknown[] }> = [];
  const client = {
    query: async (query: string, values?: unknown[]) => {
      calls.push({ query, values });
      if (query.includes('SELECT stopped')) {
        return { rows: [{ stopped: true, epoch: '7', reason: 'stop', updated_by: 'owner', updated_at: new Date().toISOString() }] };
      }
      if (query.includes('UPDATE jerry_execution_control')) {
        return { rows: [{ stopped: false, epoch: '8', reason: 'owner resume after review', updated_by: 'owner-uid', updated_at: new Date().toISOString() }] };
      }
      return { rows: [] };
    },
    release: () => { calls.push({ query: 'RELEASE' }); },
  };
  const result = await updateSharedExecutionControl({
    stopped: false,
    actorUid: 'owner-uid',
    reason: 'owner resume after review',
  }, async () => client as unknown as PoolClient);

  assert.equal(result.stopped, false);
  assert.equal(result.epoch, 8);
  assert.ok(calls.some((call) => call.query.includes('FOR UPDATE')));
  assert.ok(calls.some((call) => call.query.includes('INSERT INTO jerry_execution_control_audit')));
  assert.equal(calls.at(-2)?.query, 'COMMIT');
  assert.equal(calls.at(-1)?.query, 'RELEASE');
});

test('shared control write rolls back and releases the client on audit failure', async () => {
  const calls: string[] = [];
  const client = {
    query: async (query: string) => {
      calls.push(query);
      if (query.includes('SELECT stopped')) {
        return { rows: [{ stopped: true, epoch: '2', reason: 'stop', updated_by: 'owner', updated_at: new Date().toISOString() }] };
      }
      if (query.includes('UPDATE jerry_execution_control')) {
        return { rows: [{ stopped: false, epoch: '3', reason: 'owner resume', updated_by: 'owner-uid', updated_at: new Date().toISOString() }] };
      }
      if (query.includes('INSERT INTO jerry_execution_control_audit')) throw new Error('audit unavailable');
      return { rows: [] };
    },
    release: () => { calls.push('RELEASE'); },
  };
  await assert.rejects(
    updateSharedExecutionControl({ stopped: false, actorUid: 'owner-uid', reason: 'owner resume' },
      async () => client as unknown as PoolClient),
    /audit unavailable/,
  );
  assert.ok(calls.includes('ROLLBACK'));
  assert.equal(calls.at(-1), 'RELEASE');
});

test('PostgreSQL stop waits for an admitted execution lease to release', {
  skip: process.env.JERRY_JOURNAL_TEST_DATABASE !== '1'
    ? 'Set JERRY_JOURNAL_TEST_DATABASE=1 for a disposable PostgreSQL database.'
    : false,
}, async () => {
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(process.env.SQL_HOST && process.env.SQL_USER && /test|tenant/i.test(process.env.SQL_DB_NAME ?? ''),
    'Execution-control integration requires a disposable PostgreSQL database name containing test/tenant.');
  const { createPool } = await import('./index.ts');
  const pool = createPool();
  const { acquireSharedExecutionLease, readSharedExecutionControl, updateSharedExecutionControl } = await import('./executionControl.ts');
  await pool.query("UPDATE jerry_execution_control SET stopped=false, epoch=epoch+1, reason='integration fixture enabled', updated_by='test-fixture', updated_at=now() WHERE id=1");
  const lease = await acquireSharedExecutionLease();
  let stopFinished = false;
  const stop = updateSharedExecutionControl({
    stopped: true,
    actorUid: 'integration-owner',
    reason: 'integration test stop waits for active lease',
  }).then((value) => { stopFinished = true; return value; });
  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(stopFinished, false, 'Owner stop must not commit while a protected side effect lease is held.');
  } finally {
    await lease.release();
  }
  const stopped = await stop;
  assert.equal(stopped.stopped, true);
  assert.equal((await readSharedExecutionControl()).stopped, true);
  await pool.query("UPDATE jerry_execution_control SET stopped=false, epoch=epoch+1, reason='integration fixture cleanup', updated_by='test-fixture', updated_at=now() WHERE id=1");
});
