import type { Pool, PoolClient } from 'pg';
import { createPool } from './index.ts';

export interface SharedExecutionControl {
  stopped: boolean;
  epoch: number;
  reason: string;
  updatedBy: string;
  updatedAt: string;
}

type Queryable = Pick<Pool, 'query'>;
const pool: Pool = createPool();

function mapControl(row: Record<string, unknown> | undefined): SharedExecutionControl {
  if (!row || typeof row.stopped !== 'boolean') {
    throw new Error('Shared Jerry execution-control row is missing or invalid; execution must fail closed.');
  }
  const epoch = Number(row.epoch);
  if (!Number.isSafeInteger(epoch) || epoch < 1) {
    throw new Error('Shared Jerry execution-control epoch is invalid; execution must fail closed.');
  }
  return {
    stopped: row.stopped,
    epoch,
    reason: String(row.reason ?? ''),
    updatedBy: String(row.updated_by ?? ''),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export async function readSharedExecutionControl(queryable: Queryable = pool): Promise<SharedExecutionControl> {
  const result = await queryable.query(
    'SELECT stopped, epoch, reason, updated_by, updated_at FROM jerry_execution_control WHERE id=1',
  );
  return mapControl(result.rows[0] as Record<string, unknown> | undefined);
}

export async function updateSharedExecutionControl(input: {
  stopped: boolean;
  actorUid: string;
  reason: string;
}, connect: () => Promise<PoolClient> = () => pool.connect()): Promise<SharedExecutionControl> {
  const actorUid = input.actorUid.trim();
  const reason = input.reason.trim();
  if (!actorUid || reason.length < 5 || reason.length > 1000) {
    throw new Error('A valid owner UID and reason are required for shared execution control.');
  }
  const client = await connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      'SELECT stopped, epoch, reason, updated_by, updated_at FROM jerry_execution_control WHERE id=1 FOR UPDATE',
    );
    const current = mapControl(locked.rows[0] as Record<string, unknown> | undefined);
    if (current.stopped !== input.stopped || current.reason !== reason || current.updatedBy !== actorUid) {
      const updated = await client.query(
        `UPDATE jerry_execution_control
         SET stopped=$1, epoch=epoch+1, reason=$2, updated_by=$3, updated_at=now()
         WHERE id=1
         RETURNING stopped, epoch, reason, updated_by, updated_at`,
        [input.stopped, reason, actorUid],
      );
      const next = mapControl(updated.rows[0] as Record<string, unknown> | undefined);
      await client.query(
        'INSERT INTO jerry_execution_control_audit(epoch, stopped, actor_uid, reason) VALUES($1,$2,$3,$4)',
        [next.epoch, next.stopped, actorUid, reason],
      );
      await client.query('COMMIT');
      return next;
    }
    await client.query('COMMIT');
    return current;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    throw error;
  } finally {
    client.release();
  }
}

export async function isSharedExecutionStopped(): Promise<boolean> {
  return (await readSharedExecutionControl()).stopped;
}

export interface SharedExecutionLease {
  epoch: number;
  release: () => Promise<void>;
}

/**
 * Acquire a database-backed execution lease.
 *
 * The transaction holds FOR SHARE on the singleton control row for the full
 * protected request. Owner stop/resume takes FOR UPDATE on the same row, so
 * stop cannot commit while an admitted request still holds this lease. The
 * caller must release on both response finish and connection close.
 */
export async function acquireSharedExecutionLease(
  connect: () => Promise<PoolClient> = () => pool.connect(),
): Promise<SharedExecutionLease> {
  const client = await connect();
  let released = false;
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT stopped, epoch, reason, updated_by, updated_at FROM jerry_execution_control WHERE id=1 FOR SHARE',
    );
    const control = mapControl(result.rows[0] as Record<string, unknown> | undefined);
    if (control.stopped) {
      throw new Error('Jerry shared emergency stop is engaged.');
    }
    return {
      epoch: control.epoch,
      release: async () => {
        if (released) return;
        released = true;
        try {
          await client.query('COMMIT');
        } catch (error) {
          try { await client.query('ROLLBACK'); } catch { /* preserve commit error */ }
          throw error;
        } finally {
          client.release();
        }
      },
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    client.release();
    throw error;
  }
}
