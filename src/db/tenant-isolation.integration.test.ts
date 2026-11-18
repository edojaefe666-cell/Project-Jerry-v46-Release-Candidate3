import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { INITIAL_JERRY_STATE } from '../lib/seedData.ts';
import type { ApprovalRequest, DailySummaryReport, JerryState, WalletTransaction } from '../lib/types';

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
      chartSeries: [], taskBreakdown: [],
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
