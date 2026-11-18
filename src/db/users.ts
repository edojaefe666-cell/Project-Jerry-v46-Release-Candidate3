import { eq, desc, sql } from 'drizzle-orm';
import { db } from './index.ts';
import { enqueueWalletJournalEvent } from './walletJournalOutbox.ts';
import { dailySummaryReports, idempotencyKeys, ledgerTransactions, taskExecutions, users, workspaces } from './schema.ts';
import type { DailySummaryReport, JerryState, WalletTransaction } from '../lib/types.ts';
import crypto from 'node:crypto';

export async function getOrCreateUser(uid: string, email: string) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Database operation failed. Please try again later.', { cause: error });
  }
}

export async function getWorkspaceForUser(uid: string, email: string): Promise<JerryState | null> {
  try {
    const user = await getOrCreateUser(uid, email);
    const rows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, user.id))
      .limit(1);

    if (rows.length === 0) return null;
    return rows[0].stateJson as JerryState;
  } catch (error) {
    console.error('Database query failed in getWorkspaceForUser:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function saveWorkspaceForUser(
  uid: string,
  email: string,
  state: JerryState
): Promise<void> {
  try {
    const user = await getOrCreateUser(uid, email);
    await db
      .insert(workspaces)
      .values({
        userId: user.id,
        stateJson: state,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: workspaces.userId,
        set: {
          stateJson: state,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error('Database write failed in saveWorkspaceForUser:', error);
    throw new Error('Database update failed. Please try again later.', { cause: error });
  }
}

export async function recordLedgerTransactionsForUser(
  uid: string,
  email: string,
  txs: WalletTransaction[]
): Promise<void> {
  if (txs.length === 0) return;
  try {
    const user = await getOrCreateUser(uid, email);
    const existing = await db
      .select({ txRef: ledgerTransactions.txRef })
      .from(ledgerTransactions)
      .where(eq(ledgerTransactions.userId, user.id));
    const seen = new Set(existing.map((r) => r.txRef));
    const toInsert = txs.filter((tx) => !seen.has(tx.id));
    if (toInsert.length === 0) return;

    await db.insert(ledgerTransactions).values(
      toInsert.map((tx) => ({
        userId: user.id,
        txRef: tx.id,
        timestamp: tx.timestamp,
        txType: tx.type,
        asset: tx.asset,
        network: tx.network,
        amount: tx.amount,
        usdValue: tx.usdValue ?? null,
        usdValuationAt: tx.usdValuationAt ?? null,
        usdValuationSource: tx.usdValuationSource ?? null,
        fee: tx.fee,
        counterparty: tx.counterparty,
        status: tx.status,
        note: tx.note,
        txHash: tx.txHash ?? null,
        isVerifiedOnChain: Boolean(tx.isVerifiedOnChain),
        confirmationDepth: tx.confirmationDepth ?? null,
        verifiedBlockHeight: tx.verifiedBlockHeight ?? null,
        verifiedBlockHash: tx.verifiedBlockHash ?? null,
      }))
    ).onConflictDoUpdate({
      target: [ledgerTransactions.userId, ledgerTransactions.txRef],
      set: {
        timestamp: sql`excluded.timestamp`,
        txType: sql`excluded.tx_type`,
        asset: sql`excluded.asset`,
        network: sql`excluded.network`,
        amount: sql`excluded.amount`,
        usdValue: sql`excluded.usd_value`,
        usdValuationAt: sql`excluded.usd_valuation_at`,
        usdValuationSource: sql`excluded.usd_valuation_source`,
        fee: sql`excluded.fee`,
        counterparty: sql`excluded.counterparty`,
        status: sql`excluded.status`,
        note: sql`excluded.note`,
        txHash: sql`excluded.tx_hash`,
        isVerifiedOnChain: sql`excluded.is_verified_on_chain`,
        confirmationDepth: sql`excluded.confirmation_depth`,
        verifiedBlockHeight: sql`excluded.verified_block_height`,
        verifiedBlockHash: sql`excluded.verified_block_hash`,
      },
    });
  } catch (error) {
    console.error('Database ledger sync failed:', error);
    throw new Error('Ledger persistence failed. Please try again later.', { cause: error });
  }
}


export async function updateWorkspaceForUserAtomic(
  uid: string,
  email: string,
  updater: (state: JerryState) => JerryState | Promise<JerryState>,
): Promise<JerryState> {
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${uid}))`);
      const userRows = await tx
        .insert(users)
        .values({ uid, email })
        .onConflictDoUpdate({ target: users.uid, set: { email } })
        .returning();
      const user = userRows[0];
      const rows = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.userId, user.id))
        .limit(1);
      const current = rows[0]?.stateJson as JerryState | undefined;
      if (!current) {
        throw new Error('Workspace does not exist; initialize it through the normal workspace bootstrap path.');
      }
      const next = await updater(current);
      await tx
        .insert(workspaces)
        .values({ userId: user.id, stateJson: next, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: workspaces.userId,
          set: { stateJson: next, updatedAt: new Date() },
        });

      for (const txRow of next.transactions ?? []) {
        await tx.insert(ledgerTransactions).values({
          userId: user.id,
          txRef: txRow.id,
          timestamp: txRow.timestamp,
          txType: txRow.type,
          asset: txRow.asset,
          network: txRow.network,
          amount: txRow.amount,
          usdValue: txRow.usdValue ?? null,
          usdValuationAt: txRow.usdValuationAt ?? null,
          usdValuationSource: txRow.usdValuationSource ?? null,
          fee: txRow.fee,
          counterparty: txRow.counterparty,
          status: txRow.status,
          note: txRow.note,
          txHash: txRow.txHash ?? null,
          isVerifiedOnChain: Boolean(txRow.isVerifiedOnChain),
          confirmationDepth: txRow.confirmationDepth ?? null,
          verifiedBlockHeight: txRow.verifiedBlockHeight ?? null,
          verifiedBlockHash: txRow.verifiedBlockHash ?? null,
        }).onConflictDoUpdate({
          target: [ledgerTransactions.userId, ledgerTransactions.txRef],
          set: {
            timestamp: txRow.timestamp,
            txType: txRow.type,
            asset: txRow.asset,
            network: txRow.network,
            amount: txRow.amount,
            usdValue: txRow.usdValue ?? null,
            usdValuationAt: txRow.usdValuationAt ?? null,
            usdValuationSource: txRow.usdValuationSource ?? null,
            fee: txRow.fee,
            counterparty: txRow.counterparty,
            status: txRow.status,
            note: txRow.note,
            txHash: txRow.txHash ?? null,
            isVerifiedOnChain: Boolean(txRow.isVerifiedOnChain),
            confirmationDepth: txRow.confirmationDepth ?? null,
            verifiedBlockHeight: txRow.verifiedBlockHeight ?? null,
            verifiedBlockHash: txRow.verifiedBlockHash ?? null,
          },
        });
      }
      return next;
    });
  } catch (error) {
    console.error('Atomic workspace update failed:', error);
    throw new Error('Workspace update failed. Please try again later.', { cause: error });
  }
}

export async function saveDailySummaryForUser(
  uid: string,
  email: string,
  report: DailySummaryReport
): Promise<void> {
  try {
    const user = await getOrCreateUser(uid, email);
    await db.insert(dailySummaryReports).values({
      userId: user.id,
      reportDate: report.reportDate,
      headline: report.headline,
      summaryText: report.summaryText,
      dailyProfitUsd: report.metrics.todayProfitUsd,
      activeTasksCount: report.metrics.activeTasksCount,
      insightsCount: report.metrics.newRevenueInsightsCount,
      chartDataJson: report.chartSeries,
    });
  } catch (error) {
    console.error('Database summary write failed:', error);
    throw new Error('Summary persistence failed. Please try again later.', { cause: error });
  }
}

export async function getRecentDailySummariesForUser(uid: string) {
  try {
    return await db
      .select({
        id: dailySummaryReports.id,
        reportDate: dailySummaryReports.reportDate,
        headline: dailySummaryReports.headline,
        summaryText: dailySummaryReports.summaryText,
        dailyProfitUsd: dailySummaryReports.dailyProfitUsd,
        activeTasksCount: dailySummaryReports.activeTasksCount,
        insightsCount: dailySummaryReports.insightsCount,
        chartDataJson: dailySummaryReports.chartDataJson,
        createdAt: dailySummaryReports.createdAt,
      })
      .from(dailySummaryReports)
      .innerJoin(users, eq(dailySummaryReports.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(dailySummaryReports.createdAt))
      .limit(10);
  } catch (error) {
    console.error('Database summary query failed:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}


export async function runIdempotentWorkspaceCommand<T extends object>(
  uid: string,
  email: string,
  key: string,
  command: string,
  updater: (state: JerryState) => { state: JerryState; response: T } | Promise<{ state: JerryState; response: T }>,
): Promise<{ replayed: boolean; response: T }> {
  if (!key || key.length > 200) throw new Error('A valid idempotency key is required.');
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${uid}))`);
    const userRows = await tx.insert(users).values({ uid, email })
      .onConflictDoUpdate({ target: users.uid, set: { email } }).returning();
    const user = userRows[0];
    const existing = await tx.select({ responseJson: idempotencyKeys.responseJson, command: idempotencyKeys.command })
      .from(idempotencyKeys)
      .where(sql`${idempotencyKeys.userId} = ${user.id} AND ${idempotencyKeys.key} = ${key}`)
      .limit(1);
    if (existing[0]) {
      if (existing[0].command !== command) throw new Error('Idempotency key is already bound to another command.');
      return { replayed: true, response: existing[0].responseJson as T };
    }

    const rows = await tx.select().from(workspaces).where(eq(workspaces.userId, user.id)).limit(1);
    const current = rows[0]?.stateJson as JerryState | undefined;
    if (!current) throw new Error('Workspace does not exist; initialize it through the normal workspace bootstrap path.');
    const { state, response } = await updater(current);

    await tx.insert(workspaces).values({ userId: user.id, stateJson: state, updatedAt: new Date() })
      .onConflictDoUpdate({ target: workspaces.userId, set: { stateJson: state, updatedAt: new Date() } });
    for (const txRow of state.transactions ?? []) {
      await tx.insert(ledgerTransactions).values({
        userId: user.id, txRef: txRow.id, timestamp: txRow.timestamp, txType: txRow.type,
        asset: txRow.asset, network: txRow.network, amount: txRow.amount,
        usdValue: txRow.usdValue ?? null, usdValuationAt: txRow.usdValuationAt ?? null,
        usdValuationSource: txRow.usdValuationSource ?? null, fee: txRow.fee,
        counterparty: txRow.counterparty, status: txRow.status, note: txRow.note,
        txHash: txRow.txHash ?? null, isVerifiedOnChain: Boolean(txRow.isVerifiedOnChain),
        confirmationDepth: txRow.confirmationDepth ?? null,
        verifiedBlockHeight: txRow.verifiedBlockHeight ?? null,
        verifiedBlockHash: txRow.verifiedBlockHash ?? null,
      }).onConflictDoUpdate({
        target: [ledgerTransactions.userId, ledgerTransactions.txRef],
        set: {
          timestamp: txRow.timestamp, txType: txRow.type, asset: txRow.asset, network: txRow.network,
          amount: txRow.amount, usdValue: txRow.usdValue ?? null, usdValuationAt: txRow.usdValuationAt ?? null,
          usdValuationSource: txRow.usdValuationSource ?? null, fee: txRow.fee, counterparty: txRow.counterparty,
          status: txRow.status, note: txRow.note, txHash: txRow.txHash ?? null,
          isVerifiedOnChain: Boolean(txRow.isVerifiedOnChain), confirmationDepth: txRow.confirmationDepth ?? null,
          verifiedBlockHeight: txRow.verifiedBlockHeight ?? null, verifiedBlockHash: txRow.verifiedBlockHash ?? null,
        },
      });
    }
    for (const txRow of state.transactions ?? []) {
      if (txRow.asset === 'BTC' && txRow.network === 'Bitcoin Mainnet' &&
          ((txRow.status === 'confirmed' && txRow.isVerifiedOnChain) || txRow.status === 'reorged')) {
        await enqueueWalletJournalEvent(tx, user.id, txRow);
      }
    }
    await tx.insert(idempotencyKeys).values({ userId: user.id, key, command, responseJson: response });
    return { replayed: false, response };
  });
}


export async function startTaskExecution(
  uid: string,
  email: string,
  taskId: string,
  idempotencyKey: string,
  approvalId?: string,
): Promise<{ replayed: boolean; executionId: string; status: string; result?: unknown; state: JerryState }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${uid}))`);
    const userRows = await tx.insert(users).values({ uid, email })
      .onConflictDoUpdate({ target: users.uid, set: { email } }).returning();
    const user = userRows[0];
    const existing = await tx.select().from(taskExecutions)
      .where(sql`${taskExecutions.userId} = ${user.id} AND ${taskExecutions.taskId} = ${taskId} AND ${taskExecutions.idempotencyKey} = ${idempotencyKey}`)
      .limit(1);
    const workspaceRows = await tx.select().from(workspaces).where(eq(workspaces.userId, user.id)).limit(1);
    const current = workspaceRows[0]?.stateJson as JerryState | undefined;
    if (!current) throw new Error('Workspace does not exist.');
    if (existing[0]) {
      return { replayed: true, executionId: existing[0].executionId, status: existing[0].status, result: existing[0].resultJson, state: current };
    }
    const task = current.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error('Task not found.');
    if (task.status === 'completed') throw new Error('Task is already completed.');

    // Re-check authorization inside the same per-user transaction/lock that
    // creates the durable execution. This closes the race where an approval
    // could be revoked after the HTTP handler's earlier read but before start.
    const taskRevenue = Math.max(0, Number(task.expectedRevenueUsd ?? task.projectedRevenueUsd ?? 0) || 0);
    const mustHaveApproval = task.requiresApproval || taskRevenue > 0 || task.financialImpactUsd > 0 || task.category === 'financial';
    if (mustHaveApproval) {
      const approval = (current.approvals ?? []).find((item) =>
        item.id === approvalId && item.subjectId === taskId && item.kind === 'autonomous_task'
      );
      if (!approval || approval.decision !== 'approved') {
        throw new Error('A currently approved task authorization is required to start execution.');
      }
    }

    const executionId = `exec-${crypto.randomUUID()}`;
    const now = new Date();
    const next: JerryState = {
      ...current,
      tasks: current.tasks.map((item) => item.id === taskId ? {
        ...item,
        status: 'running',
        attempts: item.attempts + 1,
        lastCheckpoint: `Execution ${executionId} started under durable idempotency control.`,
        updatedAt: now.toISOString(),
      } : item),
    };
    await tx.insert(taskExecutions).values({
      userId: user.id,
      executionId,
      taskId,
      idempotencyKey,
      status: 'running',
      checkpoint: `Execution ${executionId} started under durable idempotency control.`,
      startedAt: now,
      updatedAt: now,
    });
    await tx.insert(workspaces).values({ userId: user.id, stateJson: next, updatedAt: now })
      .onConflictDoUpdate({ target: workspaces.userId, set: { stateJson: next, updatedAt: now } });
    return { replayed: false, executionId, status: 'running', state: next };
  });
}

export async function completeTaskExecution(
  uid: string,
  email: string,
  executionId: string,
  result: { deliverableOutput: string; projectedRevenueUsd: number },
): Promise<JerryState> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${uid}))`);
    const userRows = await tx.insert(users).values({ uid, email })
      .onConflictDoUpdate({ target: users.uid, set: { email } }).returning();
    const user = userRows[0];
    const executionRows = await tx.select().from(taskExecutions)
      .where(sql`${taskExecutions.userId} = ${user.id} AND ${taskExecutions.executionId} = ${executionId}`).limit(1);
    const execution = executionRows[0];
    if (!execution) throw new Error('Task execution record not found.');
    if (execution.status === 'completed') {
      const rows = await tx.select().from(workspaces).where(eq(workspaces.userId, user.id)).limit(1);
      return rows[0]?.stateJson as JerryState;
    }
    const rows = await tx.select().from(workspaces).where(eq(workspaces.userId, user.id)).limit(1);
    const current = rows[0]?.stateJson as JerryState | undefined;
    if (!current) throw new Error('Workspace does not exist.');
    const now = new Date();
    const next: JerryState = {
      ...current,
      tasks: current.tasks.map((item) => item.id === execution.taskId ? {
        ...item,
        status: 'completed',
        projectedRevenueUsd: Math.max(0, Math.round(result.projectedRevenueUsd * 100) / 100),
        realizedRevenueUsd: undefined,
        deliverableOutput: result.deliverableOutput,
        lastCheckpoint: `Execution ${executionId} completed. Revenue remains projected until independent settlement evidence exists.`,
        updatedAt: now.toISOString(),
      } : item),
    };
    await tx.update(taskExecutions).set({
      status: 'completed',
      checkpoint: `Execution ${executionId} completed.`,
      resultJson: result,
      completedAt: now,
      updatedAt: now,
    }).where(eq(taskExecutions.id, execution.id));
    await tx.insert(workspaces).values({ userId: user.id, stateJson: next, updatedAt: now })
      .onConflictDoUpdate({ target: workspaces.userId, set: { stateJson: next, updatedAt: now } });
    return next;
  });
}

export async function recoverStaleTaskExecutions(
  uid: string,
  email: string,
  staleAfterMs = 10 * 60 * 1000,
): Promise<{ recoveredCount: number; state: JerryState }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${uid}))`);
    const userRows = await tx.insert(users).values({ uid, email })
      .onConflictDoUpdate({ target: users.uid, set: { email } }).returning();
    const user = userRows[0];
    const workspaceRows = await tx.select().from(workspaces).where(eq(workspaces.userId, user.id)).limit(1);
    const current = workspaceRows[0]?.stateJson as JerryState | undefined;
    if (!current) throw new Error('Workspace does not exist.');
    const cutoff = new Date(Date.now() - staleAfterMs);
    const stale = await tx.select().from(taskExecutions).where(sql`${taskExecutions.userId} = ${user.id} AND ${taskExecutions.status} = 'running' AND ${taskExecutions.updatedAt} < ${cutoff}`);
    if (stale.length === 0) return { recoveredCount: 0, state: current };
    const staleIds = new Set(stale.map((item) => item.taskId));
    const now = new Date();
    const next: JerryState = {
      ...current,
      tasks: current.tasks.map((task) => staleIds.has(task.id) && task.status === 'running' ? {
        ...task,
        status: 'interrupted',
        lastCheckpoint: `Execution interrupted after durable heartbeat timeout; external side effect must be reconciled before retry.`,
        updatedAt: now.toISOString(),
      } : task),
    };
    for (const execution of stale) {
      await tx.update(taskExecutions).set({
        status: 'interrupted',
        checkpoint: 'Execution heartbeat expired; reconcile external operation before retry.',
        updatedAt: now,
      }).where(eq(taskExecutions.id, execution.id));
    }
    await tx.insert(workspaces).values({ userId: user.id, stateJson: next, updatedAt: now })
      .onConflictDoUpdate({ target: workspaces.userId, set: { stateJson: next, updatedAt: now } });
    return { recoveredCount: stale.length, state: next };
  });
}
