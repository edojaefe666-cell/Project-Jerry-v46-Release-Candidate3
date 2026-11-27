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
