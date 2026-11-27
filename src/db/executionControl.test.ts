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


test('withSharedExecutionLease releases the database lease when protected work rejects', async () => {
  const calls: string[] = [];
  const client = {
    query: async (query: string) => {
      calls.push(query);
      if (query.includes('SELECT stopped')) {
        return { rows: [{ stopped: false, epoch: '12', reason: 'ready', updated_by: 'owner', updated_at: new Date().toISOString() }] };
      }
      return { rows: [] };
    },
    release: () => { calls.push('RELEASE'); },
  };
  const { withSharedExecutionLease } = await import('./executionControl.ts');
  await assert.rejects(
    withSharedExecutionLease(async (lease) => {
      assert.equal(lease.epoch, 12);
      throw new Error('protected operation failed');
    }, async () => client as unknown as PoolClient),
    /protected operation failed/,
  );
  assert.equal(calls.filter((query) => query === 'COMMIT').length, 1);
  assert.equal(calls.filter((query) => query === 'RELEASE').length, 1);
});

test('withSharedExecutionLease does not run work when database admission fails', async () => {
  let workStarted = false;
  const { withSharedExecutionLease } = await import('./executionControl.ts');
  await assert.rejects(
    withSharedExecutionLease(async () => {
      workStarted = true;
      return 'must not execute';
    }, async () => { throw new Error('control database unavailable'); }),
    /control database unavailable/,
  );
  assert.equal(workStarted, false);
});



test('PostgreSQL concurrent identical stop requests produce one state transition', {
  skip: process.env.JERRY_JOURNAL_TEST_DATABASE !== '1'
    ? 'Set JERRY_JOURNAL_TEST_DATABASE=1 for a disposable PostgreSQL database.'
    : false,
}, async () => {
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(process.env.SQL_HOST && process.env.SQL_USER && /test|tenant/i.test(process.env.SQL_DB_NAME ?? ''),
    'Execution-control integration requires a disposable PostgreSQL database name containing test/tenant.');
  const { createPool } = await import('./index.ts');
  const pool = createPool();
  const { readSharedExecutionControl, updateSharedExecutionControl } = await import('./executionControl.ts');
  const actorUid = 'concurrent-stop-integration';
  const reason = 'concurrent identical owner stop integration';
  try {
    await pool.query(
      "UPDATE jerry_execution_control SET stopped=false, epoch=epoch+1, reason='concurrent stop fixture enabled', updated_by='test-fixture', updated_at=now() WHERE id=1",
    );
    const before = await readSharedExecutionControl();
    const auditBefore = await pool.query(
      'SELECT count(*)::int AS count FROM jerry_execution_control_audit WHERE epoch > $1',
      [before.epoch],
    );
    const results = await Promise.all([
      updateSharedExecutionControl({ stopped: true, actorUid, reason }),
      updateSharedExecutionControl({ stopped: true, actorUid, reason }),
    ]);
    const after = await readSharedExecutionControl();
    const auditAfter = await pool.query(
      'SELECT count(*)::int AS count FROM jerry_execution_control_audit WHERE epoch > $1',
      [before.epoch],
    );
    assert.equal(after.stopped, true);
    assert.equal(after.epoch, before.epoch + 1, 'Identical concurrent stop requests must share one committed epoch transition.');
    assert.deepEqual(results.map((item) => item.epoch), [after.epoch, after.epoch]);
    assert.equal(Number(auditAfter.rows[0].count) - Number(auditBefore.rows[0].count), 1,
      'Exactly one audit event must represent the concurrent stop transition.');
  } finally {
    await pool.query(
      "UPDATE jerry_execution_control SET stopped=false, epoch=epoch+1, reason='concurrent stop integration cleanup', updated_by='test-fixture', updated_at=now() WHERE id=1",
    );
    await pool.end();
  }
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


test('PostgreSQL emergency stop denies leases from an independent application instance', {
  skip: process.env.JERRY_JOURNAL_TEST_DATABASE !== '1'
    ? 'Set JERRY_JOURNAL_TEST_DATABASE=1 for a disposable PostgreSQL database.'
    : false,
}, async () => {
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(process.env.SQL_HOST && process.env.SQL_USER && /test|tenant/i.test(process.env.SQL_DB_NAME ?? ''),
    'Execution-control integration requires a disposable PostgreSQL database name containing test/tenant.');
  const { createPool } = await import('./index.ts');
  const instanceBPool = createPool();
  const { acquireSharedExecutionLease, updateSharedExecutionControl } = await import('./executionControl.ts');
  try {
    await updateSharedExecutionControl({
      stopped: false,
      actorUid: 'integration-owner',
      reason: 'independent instance lease fixture enabled',
    });
    await updateSharedExecutionControl({
      stopped: true,
      actorUid: 'integration-owner',
      reason: 'independent instance lease fixture stopped',
    });

    await assert.rejects(
      acquireSharedExecutionLease(() => instanceBPool.connect()),
      /emergency stop is engaged/i,
      'A second application instance must observe the durable stop before admitting work.',
    );
  } finally {
    await updateSharedExecutionControl({
      stopped: false,
      actorUid: 'integration-owner',
      reason: 'independent instance lease fixture cleanup',
    });
    await instanceBPool.end();
  }
});

test('PostgreSQL stop committed after claim but before lease acquisition blocks the side effect', {
  skip: process.env.JERRY_JOURNAL_TEST_DATABASE !== '1'
    ? 'Set JERRY_JOURNAL_TEST_DATABASE=1 for a disposable PostgreSQL database.'
    : false,
}, async () => {
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(process.env.SQL_HOST && process.env.SQL_USER && /test|tenant/i.test(process.env.SQL_DB_NAME ?? ''),
    'Execution-control integration requires a disposable PostgreSQL database name containing test/tenant.');

  const { createPool } = await import('./index.ts');
  const { withSharedExecutionLease, updateSharedExecutionControl } = await import('./executionControl.ts');
  const instanceBPool = createPool();
  const fixturePool = createPool();
  const actorUid = 'outbox-claim-stop-race-integration';
  const reason = 'outbox claim stop race fixture';
  let prior: { stopped: boolean; reason: string | null; updated_by: string | null } | undefined;

  try {
    const snapshot = await fixturePool.query(
      'SELECT stopped, reason, updated_by FROM jerry_execution_control WHERE id = 1',
    );
    assert.equal(snapshot.rowCount, 1, 'shared execution-control singleton must exist');
    prior = snapshot.rows[0];

    await updateSharedExecutionControl({
      stopped: false,
      actorUid,
      reason: 'outbox claim stop race fixture enabled',
    });

    // Model the queue worker having claimed its durable row. Before it enters
    // the protected ledger section, the owner commits the emergency stop.
    await updateSharedExecutionControl({
      stopped: true,
      actorUid,
      reason,
    });

    let sideEffectStarted = false;
    await assert.rejects(
      withSharedExecutionLease(async () => {
        sideEffectStarted = true;
        return 'must not execute';
      }, async () => instanceBPool.connect()),
      /emergency stop is engaged/i,
    );
    assert.equal(sideEffectStarted, false,
      'A claimed queue item must not begin its protected side effect after stop commits.');
  } finally {
    try {
      // Restore only if this fixture still owns the shared control row.
      // Keep epoch monotonic and preserve a concurrent owner transition.
      if (prior) {
        await fixturePool.query(
          `UPDATE jerry_execution_control
              SET stopped = $1, epoch = epoch + 1, reason = $2,
                  updated_by = $3, updated_at = now()
            WHERE id = 1 AND updated_by = $4 AND reason = $5`,
          [prior.stopped, prior.reason, prior.updated_by, actorUid, reason],
        );
      }
    } finally {
      await Promise.all([instanceBPool.end(), fixturePool.end()]);
    }
  }
});


test('PostgreSQL stop then resume advances epoch and invalidates an earlier instance admission', {
  skip: process.env.JERRY_JOURNAL_TEST_DATABASE !== '1'
    ? 'Set JERRY_JOURNAL_TEST_DATABASE=1 for a disposable PostgreSQL database.'
    : false,
}, async () => {
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(process.env.SQL_HOST && process.env.SQL_USER && /test|tenant/i.test(process.env.SQL_DB_NAME ?? ''),
    'Execution-control integration requires a disposable PostgreSQL database name containing test/tenant.');
  const { createPool } = await import('./index.ts');
  const instanceAPool = createPool();
  const instanceBPool = createPool();
  const {
    acquireSharedExecutionLease,
    readSharedExecutionControl,
    updateSharedExecutionControl,
  } = await import('./executionControl.ts');
  const actorUid = 'cross-instance-epoch-integration';
  let fixtureOwnsRow = false;
  let prior: { stopped: boolean; reason: string | null; updated_by: string | null } | undefined;

  try {
    const snapshot = await instanceAPool.query(
      'SELECT stopped, reason, updated_by FROM jerry_execution_control WHERE id = 1',
    );
    assert.equal(snapshot.rowCount, 1, 'shared execution-control singleton must exist');
    prior = snapshot.rows[0];

    await updateSharedExecutionControl({
      stopped: false,
      actorUid,
      reason: 'cross-instance epoch fixture enabled',
    });
    fixtureOwnsRow = true;

    // Instance A admits work and records the epoch attached to that work.
    const admitted = await acquireSharedExecutionLease(() => instanceAPool.connect());
    const admissionEpoch = admitted.epoch;
    await admitted.release();

    await updateSharedExecutionControl({
      stopped: true,
      actorUid,
      reason: 'cross-instance epoch fixture owner stop',
    });
    await updateSharedExecutionControl({
      stopped: false,
      actorUid,
      reason: 'cross-instance epoch fixture owner resume',
    });

    // Instance B sees the durable post-recovery epoch. The old provider result
    // from A must fail the same epoch equality check used by response delivery.
    const current = await acquireSharedExecutionLease(() => instanceBPool.connect());
    try {
      assert.ok(current.epoch > admissionEpoch,
        'Stop/resume must advance the shared epoch beyond the original admission.');
      assert.notEqual(current.epoch, admissionEpoch,
        'An old execution must never become current again after owner recovery.');
      assert.equal((await readSharedExecutionControl()).stopped, false);
    } finally {
      await current.release();
    }
  } finally {
    try {
      if (fixtureOwnsRow && prior) {
        await instanceAPool.query(
          `UPDATE jerry_execution_control
              SET stopped = $1, epoch = epoch + 1, reason = $2,
                  updated_by = $3, updated_at = now()
            WHERE id = 1 AND updated_by = $4 AND reason IN ($5, $6)`,
          [prior.stopped, prior.reason, prior.updated_by, actorUid,
            'cross-instance epoch fixture owner stop', 'cross-instance epoch fixture owner resume'],
        );
      }
    } finally {
      await Promise.all([instanceAPool.end(), instanceBPool.end()]);
    }
  }
});


test('a restarted application instance inherits the durable owner emergency stop', {
  skip: process.env.JERRY_JOURNAL_TEST_DATABASE !== '1'
    ? 'Set JERRY_JOURNAL_TEST_DATABASE=1 for a disposable PostgreSQL database.'
    : false,
}, async () => {
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(process.env.SQL_HOST && process.env.SQL_USER && /test|tenant/i.test(process.env.SQL_DB_NAME ?? ''),
    'Execution-control integration requires a disposable PostgreSQL database name containing test/tenant.');

  const { createPool } = await import('./index.ts');
  const firstInstancePool = createPool();
  const { readSharedExecutionControl, updateSharedExecutionControl } = await import('./executionControl.ts');
  const actorUid = 'restart-stop-integration';
  let ownsFixture = false;
  let prior: { stopped: boolean; reason: string | null; updated_by: string | null } | undefined;
  let restartedInstancePool: ReturnType<typeof createPool> | undefined;

  try {
    const snapshot = await firstInstancePool.query(
      'SELECT stopped, reason, updated_by FROM jerry_execution_control WHERE id = 1',
    );
    assert.equal(snapshot.rowCount, 1, 'shared execution-control singleton must exist');
    prior = snapshot.rows[0];

    await updateSharedExecutionControl({
      stopped: true,
      actorUid,
      reason: 'restart integration owner emergency stop',
    });
    ownsFixture = true;
    assert.equal((await readSharedExecutionControl()).stopped, true);

    // Simulate process death: discard the original pool and create a fresh
    // application pool with no in-memory execution registry or prior state.
    await firstInstancePool.end();
    restartedInstancePool = createPool();

    const { acquireSharedExecutionLease } = await import('./executionControl.ts');
    await assert.rejects(
      acquireSharedExecutionLease(() => restartedInstancePool!.connect()),
      /emergency stop is engaged/i,
      'A newly started instance must read the durable stop before admitting work.',
    );
  } finally {
    try {
      if (ownsFixture && prior) {
        const cleanupPool = restartedInstancePool ?? firstInstancePool;
        await cleanupPool.query(
          `UPDATE jerry_execution_control
              SET stopped = $1, epoch = epoch + 1, reason = $2,
                  updated_by = $3, updated_at = now()
            WHERE id = 1 AND stopped = true AND updated_by = $4
              AND reason = $5`,
          [prior.stopped, prior.reason, prior.updated_by, actorUid, 'restart integration owner emergency stop'],
        );
      }
    } finally {
      await Promise.all([
        firstInstancePool.end().catch(() => undefined),
        restartedInstancePool?.end(),
      ].filter(Boolean));
    }
  }
});


test('shared-control database read failure rolls back admission and never starts protected work', async () => {
  const calls: string[] = [];
  const client = {
    query: async (query: string) => {
      calls.push(query);
      if (query.includes('SELECT stopped')) throw new Error('shared control database unavailable');
      return { rows: [] };
    },
    release: () => { calls.push('RELEASE'); },
  };
  let workStarted = false;
  const { withSharedExecutionLease } = await import('./executionControl.ts');

  await assert.rejects(
    withSharedExecutionLease(async () => {
      workStarted = true;
      return 'must not execute';
    }, async () => client as unknown as PoolClient),
    /shared control database unavailable/,
  );

  assert.equal(workStarted, false, 'Database outage must fail closed before external work starts.');
  assert.ok(calls.includes('BEGIN'));
  assert.ok(calls.includes('ROLLBACK'));
  assert.equal(calls.at(-1), 'RELEASE');
});
