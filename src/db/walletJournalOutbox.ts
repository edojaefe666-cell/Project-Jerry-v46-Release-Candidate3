import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { createPool } from './index.ts';
import { withSharedExecutionLease } from './executionControl.ts';
import { ensureWalletTransactionJournaled } from './walletJournal.ts';
import type { WalletTransaction } from '../lib/types.ts';
import { getWalletJournalEventKey, isEligibleWalletJournalEvent } from '../lib/walletJournalPolicy.ts';

type PgQueryClient = {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
};

type DrizzleSqlExecutor = {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
};

type WalletJournalDbClient = PgQueryClient | DrizzleSqlExecutor;


export async function enqueueWalletJournalEvent(
  client: WalletJournalDbClient,
  userId: number,
  transaction: WalletTransaction,
): Promise<void> {
  const eventKey = getWalletJournalEventKey(transaction);
  const payload = JSON.stringify(transaction);

  if ('execute' in client) {
    await client.execute(sql`
      INSERT INTO wallet_journal_outbox
        (user_id, event_key, tx_ref, payload_json, status, available_at)
      VALUES (
        ${userId},
        ${eventKey},
        ${transaction.id},
        ${payload}::jsonb,
        'pending',
        now()
      )
      ON CONFLICT (user_id, event_key) DO NOTHING
    `);
    return;
  }

  await client.query(
    `INSERT INTO wallet_journal_outbox
       (user_id, event_key, tx_ref, payload_json, status, available_at)
     VALUES ($1, $2, $3, $4::jsonb, 'pending', now())
     ON CONFLICT (user_id, event_key) DO NOTHING`,
    [userId, eventKey, transaction.id, payload],
  );
}

export async function drainWalletJournalOutbox(uid?: string, limit = 50, signal?: AbortSignal): Promise<{
  processed: number;
  retried: number;
  failed: number;
}> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('Outbox drain limit must be an integer between 1 and 500.');
  }
  const claimToken = randomUUID();
  const pool = createPool();
  const client = await pool.connect();
  let processed = 0;
  let retried = 0;
  let failed = 0;

  try {
    const picked = await withSharedExecutionLease(async () => {
      if (signal?.aborted) throw new Error('Jerry emergency stop interrupted the outbox before claiming work.');
      return client.query(
        `WITH picked AS (
           SELECT o.id FROM wallet_journal_outbox o
           JOIN users u ON u.id = o.user_id
           WHERE (
               (o.status = 'pending' AND o.available_at <= now())
               OR (o.status = 'processing' AND o.updated_at < now() - interval '5 minutes')
             )
             ${uid ? 'AND u.uid = $1' : ''}
           ORDER BY o.id
           FOR UPDATE SKIP LOCKED
           LIMIT ${uid ? 2 : 1}
         )
         UPDATE wallet_journal_outbox o
            SET status = 'processing', claim_token = ${uid ? 3 : 2}, attempts = attempts + 1, updated_at = now()
          WHERE o.id IN (SELECT id FROM picked)
         RETURNING o.id, o.user_id, o.event_key, o.tx_ref, o.payload_json, o.claim_token`,
        uid ? [uid, limit, claimToken] : [limit, claimToken],
      );
    });

    const claimedRows = picked.rows as Array<{
      id: number;
      user_id: number;
      event_key: string;
      tx_ref: string;
      payload_json: WalletTransaction;
      claim_token: string;
    }>;

    for (let index = 0; index < claimedRows.length; index++) {
      const row = claimedRows[index];

      // Claimed rows are durable work, not disposable queue messages. If the
      // owner stops Jerry, return unstarted rows to pending without deleting
      // their payload or audit history.
      if (signal?.aborted) {
        const remainingIds = claimedRows.slice(index).map((item) => item.id);
        if (remainingIds.length > 0) {
          await client.query(
            `UPDATE wallet_journal_outbox
                SET status = 'pending', claim_token = NULL,
                    available_at = now(),
                    last_error = 'Paused by Jerry emergency stop',
                    updated_at = now()
              WHERE id = ANY($1::bigint[]) AND status = 'processing' AND claim_token = $2`,
            [remainingIds, claimToken],
          );
        }
        break;
      }

      try {
        const user = await client.query(
          'SELECT uid FROM users WHERE id = $1',
          [row.user_id],
        );

        if (!user.rowCount) {
          throw new Error('Outbox owner no longer exists.');
        }

        await withSharedExecutionLease(async () => {
          // The PostgreSQL row lock is held through the ledger operation.
          // A committed owner stop therefore serializes after this operation,
          // and later worker attempts cannot enter the side-effect section.
          if (signal?.aborted) {
            throw new Error('Jerry emergency stop interrupted the outbox before ledger posting.');
          }
          await ensureWalletTransactionJournaled(
            user.rows[0].uid,
            row.payload_json,
          );
        });

        // The journal operation may have completed while stop was engaged.
        // Keep the outbox retryable; journal idempotency makes replay safe.
        if (signal?.aborted) {
          await client.query(
            `UPDATE wallet_journal_outbox
                SET status = 'pending', claim_token = NULL,
                    available_at = now(),
                    last_error = 'Paused by Jerry emergency stop after journal operation',
                    updated_at = now()
              WHERE id = $1 AND status = 'processing' AND claim_token = $2`,
            [row.id, claimToken],
          );
          const remainingIds = claimedRows.slice(index + 1).map((item) => item.id);
          if (remainingIds.length > 0) {
            await client.query(
              `UPDATE wallet_journal_outbox
                  SET status = 'pending', claim_token = NULL,
                      available_at = now(),
                      last_error = 'Paused by Jerry emergency stop',
                      updated_at = now()
                WHERE id = ANY($1::bigint[]) AND status = 'processing' AND claim_token = $2`,
              [remainingIds, claimToken],
            );
          }
          break;
        }

        const finalized = await client.query(
          `UPDATE wallet_journal_outbox
              SET status = 'processed', claim_token = NULL,
                  processed_at = now(),
                  last_error = NULL,
                  updated_at = now()
            WHERE id = $1 AND status = 'processing' AND claim_token = $2`,
          [row.id, claimToken],
        );

        // A stale worker may finish its idempotent journal call after a newer
        // worker has reclaimed the row. Only the current claim owner may count
        // or finalize that queue item.
        if (finalized.rowCount === 1) processed++;
      } catch (error) {
        const interrupted = signal?.aborted === true;
        const message = interrupted
          ? 'Paused by Jerry emergency stop'
          : error instanceof Error ? error.message : String(error);

        if (interrupted) {
          // Stop is a batch boundary: return this row and every not-yet-started
          // claim immediately. Do not strand later rows in processing until
          // the five-minute stale-claim timeout.
          const remainingIds = claimedRows.slice(index).map((item) => item.id);
          if (remainingIds.length > 0) {
            await client.query(
              `UPDATE wallet_journal_outbox
                  SET status = 'pending', claim_token = NULL,
                      last_error = $3,
                      available_at = now(),
                      updated_at = now()
                WHERE id = ANY($1::bigint[]) AND status = 'processing' AND claim_token = $2`,
              [remainingIds, claimToken, message],
            );
          }
          break;
        }

        const retry = await client.query(
          `UPDATE wallet_journal_outbox
              SET status = 'pending', claim_token = NULL,
                  last_error = $3,
                  available_at = now() + interval '15 seconds',
                  updated_at = now()
            WHERE id = $1 AND status = 'processing' AND claim_token = $2`,
          [row.id, claimToken, message],
        );

        // Do not report a retry for a stale worker whose claim was replaced.
        if (retry.rowCount === 1) {
          failed++;
          retried++;
        }
      }
    }
  } finally {
    client.release();
  }

  return { processed, retried, failed };
}
