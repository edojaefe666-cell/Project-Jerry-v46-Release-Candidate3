import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { INITIAL_JERRY_STATE } from '../lib/seedData.ts';
import type { ApprovalRequest, DailySummaryReport, JerryState, WalletTransaction } from '../lib/types';
import { createOwnerMemoryRecoveryEnvelopeForUser, getOwnerMemoryRecoveryEnvelopeForUser } from './memoryRecoveryEnvelopeStore.ts';

const databaseOptIn = process.env.JERRY_TENANT_TEST_DATABASE === '1';
const databaseName = process.env.SQL_DB_NAME ?? '';
const databaseConfigured = Boolean(
  process.env.SQL_HOST && process.env.SQL_USER && databaseName && /test|tenant/i.test(databaseName)
);
test('PostgreSQL tenant isolation: workspace, approvals, idempotency, tasks, ledger and summaries', {
  skip: !databaseOptIn
    ? 'Set JERRY_TENANT_TEST_DATABASE=1 to run against an explicitly disposable test database.'
    : false,
}, async () => {
  assert.notEqual(process.env.NODE_ENV, 'production', 'Tenant integration tests must never run in production.');
  assert.ok(databaseConfigured, 'Tenant integration was requested, but SQL_HOST, SQL_USER, or a safe SQL_DB_NAME containing test/tenant is missing.');
  const { createPool } = await import('./index.ts');
  const { saveMemoryEntryForUser, searchMemoryForUser } = await import('./memoryStore.ts');
  const {
    getWorkspaceForUser,
    saveWorkspaceForUser,
    recordLedgerTransactionsForUser,
    runIdempotentWorkspaceCommand,
    startTaskExecution,
    recoverStaleTaskExecutions,
    saveDailySummaryForUser,
    getRecentDailySummariesForUser,
  } = await import('./users.ts');
  const pool = createPool();
  const suffix = randomUUID();
  const userA = { uid: `tenant-test-A-${suffix}`, email: `tenant-a-${suffix}@example.invalid` };
  const userB = { uid: `tenant-test-B-${suffix}`, email: `tenant-b-${suffix}@example.invalid` };
  const taskId = `shared-looking-task-${suffix}`;
  const approvalId = `approval-A-${suffix}`;
  const approvalIdB = `approval-B-${suffix}`;
  const idempotencyKey = `same-key-${suffix}`;

  const task = {
    ...INITIAL_JERRY_STATE.tasks[0],
    id: taskId,
    category: 'research' as const,
    status: 'queued' as const,
    requiresApproval: true,
    financialImpactUsd: 0,
    expectedRevenueUsd: 0,
    projectedRevenueUsd: 0,
    attempts: 0,
  };
  const approval: ApprovalRequest = {
    id: approvalId,
    kind: 'autonomous_task',
    subjectId: taskId,
    title: 'Tenant A task approval',
    reason: 'Integration test authorization',
    requestedAt: new Date().toISOString(),
    decision: 'approved',
  };
  const approvalB: ApprovalRequest = {
    ...approval,
    id: approvalIdB,
    title: 'Tenant B task approval',
  };

  const makeState = (ownerName: string, approvals: ApprovalRequest[] = []): JerryState => ({
    ...structuredClone(INITIAL_JERRY_STATE),
    owner: { ...INITIAL_JERRY_STATE.owner, name: ownerName },
    tasks: [{ ...task }],
    approvals,
    transactions: [],
  });

  try {
    const memoryA = {
      id: `memory-A-${suffix}`, category: 'lesson' as const, title: 'Tenant A private discovery',
      content: 'quartz-lighthouse insight must remain private to tenant A', outcome: 'insight' as const,
      tags: ['tenant-a', 'private'], createdAt: new Date().toISOString(),
    };
    const memoryB = {
      ...memoryA, id: `memory-B-${suffix}`, title: 'Tenant B private discovery',
      content: 'cobalt-orchid insight must remain private to tenant B', tags: ['tenant-b', 'private'],
    };
    await Promise.all([
      saveMemoryEntryForUser(userA.uid, userA.email, memoryA),
      saveMemoryEntryForUser(userB.uid, userB.email, memoryB),
    ]);
    const memoryProfileA = {
      id: `memory-profile-A-${suffix}`, category: 'preference' as const,
      title: 'Tenant A owner preference', content: 'Owner profile preference must be searchable.',
      outcome: 'insight' as const, tags: ['owner-profile'], createdAt: new Date().toISOString(),
    };
    const memoryProjectA = {
      id: `memory-project-A-${suffix}`, category: 'goal' as const,
      title: 'Tenant A project goal', content: 'Mission project goal must be searchable.',
      outcome: 'insight' as const, tags: ['mission-project'], createdAt: new Date().toISOString(),
    };
    await Promise.all([
      saveMemoryEntryForUser(userA.uid, userA.email, memoryProfileA),
      saveMemoryEntryForUser(userA.uid, userA.email, memoryProjectA),
    ]);
    const [memoriesA, memoriesB, queryAFromB, ownerProfileA, projectsA, knowledgeAFromB] = await Promise.all([
      searchMemoryForUser(userA.uid, userA.email, { query: 'quartz-lighthouse' }),
      searchMemoryForUser(userB.uid, userB.email, { query: 'cobalt-orchid' }),
      searchMemoryForUser(userB.uid, userB.email, { query: 'quartz-lighthouse' }),
      searchMemoryForUser(userA.uid, userA.email, { area: 'owner_profile' }),
      searchMemoryForUser(userA.uid, userA.email, { area: 'mission_projects' }),
      searchMemoryForUser(userB.uid, userB.email, { area: 'knowledge_experience' }),
    ]);
    assert.ok(memoriesA.some((entry) => entry.id === memoryA.id));
    assert.ok(memoriesB.some((entry) => entry.id === memoryB.id));
    assert.equal(queryAFromB.some((entry) => entry.id === memoryA.id), false,
      'Memory search must not expose another tenant entry even when its unique content is queried.');
    assert.ok(ownerProfileA.some((entry) => entry.id === memoryProfileA.id));
    assert.equal(ownerProfileA.some((entry) => entry.id === memoryA.id), false);
    assert.ok(projectsA.some((entry) => entry.id === memoryProjectA.id));
    assert.equal(projectsA.some((entry) => entry.id === memoryA.id), false);
    assert.equal(knowledgeAFromB.some((entry) => entry.id === memoryA.id), false,
      'Area-filtered memory search must remain tenant-scoped.');

    const recoveryEnvelope = {
      version: 1 as const,
      algorithm: 'HKDF-SHA256-AES-256-GCM' as const,
      context: { ownerUid: userA.uid, keyVersion: 1 },
      salt: 'A'.repeat(43),
      iv: 'B'.repeat(16),
      ciphertext: 'C'.repeat(64),
    };
    const storedRecovery = await createOwnerMemoryRecoveryEnvelopeForUser(
      userA.uid, userA.email, recoveryEnvelope,
    );
    assert.equal(storedRecovery.context.ownerUid, userA.uid);
    assert.equal(storedRecovery.context.keyVersion, 1);
    assert.equal('recoveryKey' in storedRecovery, false,
      'The owner-held recovery secret must never be returned by persistence.');
    assert.equal('memoryKey' in storedRecovery, false);
    const [storedRecoveryA, recoveryB] = await Promise.all([
      getOwnerMemoryRecoveryEnvelopeForUser(userA.uid, userA.email, 1),
      getOwnerMemoryRecoveryEnvelopeForUser(userB.uid, userB.email, 1),
    ]);
    assert.deepEqual(storedRecoveryA, storedRecovery,
      'The correct owner must retrieve the exact immutable ciphertext envelope.');
    assert.equal(recoveryB, null,
      'A different tenant must not retrieve another owner recovery envelope.');
    await assert.rejects(
      createOwnerMemoryRecoveryEnvelopeForUser(userA.uid, userA.email, recoveryEnvelope),
      (error: unknown) => {
        // Drizzle wraps PostgreSQL errors; inspect the cause rather than relying on
        // the outer "Failed query" message, which omits the unique-violation text.
        let candidate: unknown = error;
        for (let depth = 0; depth < 4 && candidate && typeof candidate === 'object'; depth += 1) {
          const details = candidate as { code?: unknown; constraint?: unknown; cause?: unknown };
          if (details.code === '23505' &&
              details.constraint === 'memory_recovery_envelopes_owner_key_version_unique') return true;
          candidate = details.cause;
        }
        return false;
      },
      'An existing owner/key-version recovery envelope must not be overwritten.',
    );

    await saveWorkspaceForUser(userA.uid, userA.email, makeState('Tenant A', [approval]));
    await saveWorkspaceForUser(userB.uid, userB.email, makeState('Tenant B', [approvalB]));

    const [stateA, stateB] = await Promise.all([
      getWorkspaceForUser(userA.uid, userA.email),
      getWorkspaceForUser(userB.uid, userB.email),
    ]);
    assert.equal(stateA?.owner.name, 'Tenant A');
    assert.equal(stateB?.owner.name, 'Tenant B');
    assert.equal(stateB?.approvals?.some((item) => item.id === approvalId), false,
      'User B must not see User A approval even when the identifier is known.');

    await assert.rejects(
      startTaskExecution(userB.uid, userB.email, taskId, `unauthorized-${suffix}`, approvalId),
      /currently approved task authorization is required/i,
      'User B must not execute User A task using User A approval ID.'
    );

    const revokedState = makeState('Tenant A', [{ ...approval, decision: 'rejected' }]);
    await saveWorkspaceForUser(userA.uid, userA.email, revokedState);
    await assert.rejects(
      startTaskExecution(userA.uid, userA.email, taskId, `revoked-${suffix}`, approvalId),
      /currently approved task authorization is required/i,
      'Task execution persistence must reject an approval that is no longer approved.'
    );
    await saveWorkspaceForUser(userA.uid, userA.email, makeState('Tenant A', [approval]));

    const [executionA, executionB] = await Promise.all([
      startTaskExecution(userA.uid, userA.email, taskId, `exec-${suffix}`, approvalId),
      startTaskExecution(userB.uid, userB.email, taskId, `exec-${suffix}`, approvalIdB),
    ]);
    assert.notEqual(executionA.executionId, executionB.executionId,
      'Execution identities must be tenant-specific even for matching task/key values.');

    const commandA = await runIdempotentWorkspaceCommand(
      userA.uid, userA.email, idempotencyKey, 'tenant-test-command',
      (current) => ({ state: current, response: { owner: 'A', nonce: suffix } }),
    );
    const commandB = await runIdempotentWorkspaceCommand(
      userB.uid, userB.email, idempotencyKey, 'tenant-test-command',
      (current) => ({ state: current, response: { owner: 'B', nonce: suffix } }),
    );
    assert.equal((commandA.response as { owner: string }).owner, 'A');
    assert.equal((commandB.response as { owner: string }).owner, 'B',
      'User B must not replay User A response for the same idempotency key.');

    const txA: WalletTransaction = {
      id: `ledger-A-${suffix}`, timestamp: new Date().toISOString(), type: 'incoming',
      asset: 'BTC', network: 'Bitcoin Mainnet', amount: 0.001, fee: 0,
      counterparty: 'tenant A test', status: 'pending_approval', note: 'isolated test row',
    };
    const txB: WalletTransaction = { ...txA, id: `ledger-B-${suffix}`, counterparty: 'tenant B test' };
    await Promise.all([
      recordLedgerTransactionsForUser(userA.uid, userA.email, [txA]),
      recordLedgerTransactionsForUser(userB.uid, userB.email, [txB]),
    ]);
    const ledgerRows = await pool.query(
      `SELECT u.uid, l.tx_ref FROM ledger_transactions l JOIN users u ON u.id = l.user_id WHERE u.uid = ANY($1::text[])`,
      [[userA.uid, userB.uid]],
    );
    assert.deepEqual(new Set(ledgerRows.rows.map((row: { uid: string; tx_ref: string }) => `${row.uid}:${row.tx_ref}`)),
      new Set([`${userA.uid}:${txA.id}`, `${userB.uid}:${txB.id}`]));

    const summaryFor = (owner: string): DailySummaryReport => ({
      id: `summary-${owner}-${suffix}`, reportDate: '2099-01-01', generatedAt: new Date().toISOString(),
      headline: owner, summaryText: `private ${owner} summary`, notificationTitle: owner,
      notificationRead: false, modelUsed: 'integration-test',
      metrics: { todayProfitUsd: 0, previousDayProfitUsd: 0, activeTasksCount: 0, completedTasksCount: 0, newRevenueInsightsCount: 0, internetAuthorityScore: 0 },
      chartSeries: [], taskBreakdown: [], financialDataStatus: 'unavailable_not_loaded_from_verified_ledger',
    });
    await saveDailySummaryForUser(userA.uid, userA.email, summaryFor('A'));
    await saveDailySummaryForUser(userB.uid, userB.email, summaryFor('B'));
    const [summariesA, summariesB] = await Promise.all([
      getRecentDailySummariesForUser(userA.uid),
      getRecentDailySummariesForUser(userB.uid),
    ]);
    assert.ok(summariesA.some((item) => item.headline === 'A'));
    assert.equal(summariesA.some((item) => item.headline === 'B'), false);
    assert.ok(summariesB.some((item) => item.headline === 'B'));
    assert.equal(summariesB.some((item) => item.headline === 'A'), false);

    await new Promise((resolve) => setTimeout(resolve, 10));
    const recoveryA = await recoverStaleTaskExecutions(userA.uid, userA.email, 0);
    const afterB = await getWorkspaceForUser(userB.uid, userB.email);
    assert.ok(recoveryA.recoveredCount >= 1);
    assert.equal(afterB?.tasks[0].status, 'running',
      'User A recovery must not change User B task state.');
  } finally {
    // Delete only the uniquely named test identities and their dependent rows.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM task_executions WHERE user_id IN (SELECT id FROM users WHERE uid = ANY($1::text[]))', [[userA.uid, userB.uid]]);
      await client.query('DELETE FROM idempotency_keys WHERE user_id IN (SELECT id FROM users WHERE uid = ANY($1::text[]))', [[userA.uid, userB.uid]]);
      await client.query('DELETE FROM ledger_transactions WHERE user_id IN (SELECT id FROM users WHERE uid = ANY($1::text[]))', [[userA.uid, userB.uid]]);
      await client.query('DELETE FROM memory_recovery_envelopes WHERE user_id IN (SELECT id FROM users WHERE uid = ANY($1::text[]))', [[userA.uid, userB.uid]]);
      await client.query('DELETE FROM daily_summary_reports WHERE user_id IN (SELECT id FROM users WHERE uid = ANY($1::text[]))', [[userA.uid, userB.uid]]);
      await client.query('DELETE FROM workspaces WHERE user_id IN (SELECT id FROM users WHERE uid = ANY($1::text[]))', [[userA.uid, userB.uid]]);
      await client.query('DELETE FROM users WHERE uid = ANY($1::text[])', [[userA.uid, userB.uid]]);
      await client.query('COMMIT');
    } catch (cleanupError) {
      await client.query('ROLLBACK');
      throw cleanupError;
    } finally {
      client.release();
    }
  }
});
