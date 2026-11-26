import { sql } from 'drizzle-orm';
import { createPool } from './index.ts';
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
  const pool = createPool();
  const client = await pool.connect();
  let processed = 0;
  let retried = 0;
  let failed = 0;

  try {
    const picked = await client.query(
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
         LIMIT $${uid ? 2 : 1}
       )
       UPDATE wallet_journal_outbox o
          SET status = 'processing', attempts = attempts + 1, updated_at = now()
        WHERE o.id IN (SELECT id FROM picked)
       RETURNING o.id, o.user_id, o.event_key, o.tx_ref, o.payload_json`,
      uid ? [uid, limit] : [limit],
    );

    const claimedRows = picked.rows as Array<{
      id: number;
      user_id: number;
      event_key: string;
      tx_ref: string;
      payload_json: WalletTransaction;
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
                SET status = 'pending',
                    available_at = now(),
                    last_error = 'Paused by Jerry emergency stop',
                    updated_at = now()
              WHERE id = ANY($1::bigint[]) AND status = 'processing'`,
            [remainingIds],
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

        await ensureWalletTransactionJournaled(
          user.rows[0].uid,
          row.payload_json,
        );

        // The journal operation may have completed while stop was engaged.
        // Keep the outbox retryable; journal idempotency makes replay safe.
        if (signal?.aborted) {
          await client.query(
            `UPDATE wallet_journal_outbox
                SET status = 'pending',
                    available_at = now(),
                    last_error = 'Paused by Jerry emergency stop after journal operation',
                    updated_at = now()
              WHERE id = $1 AND status = 'processing'`,
            [row.id],
          );
          const remainingIds = claimedRows.slice(index + 1).map((item) => item.id);
          if (remainingIds.length > 0) {
            await client.query(
              `UPDATE wallet_journal_outbox
                  SET status = 'pending',
                      available_at = now(),
                      last_error = 'Paused by Jerry emergency stop',
                      updated_at = now()
                WHERE id = ANY($1::bigint[]) AND status = 'processing'`,
              [remainingIds],
            );
          }
          break;
        }

        await client.query(
          `UPDATE wallet_journal_outbox
              SET status = 'processed',
                  processed_at = now(),
                  last_error = NULL,
                  updated_at = now()
            WHERE id = $1`,
          [row.id],
        );

        // Count every successfully completed outbox row, including safe no-op
        // duplicate deliveries whose journal effect was already applied.
        // Journal posting counts are measured from the ledger, not this worker metric.
        processed++;
      } catch (error) {
        await client.query(
          `UPDATE wallet_journal_outbox
              SET status = 'pending',
                  last_error = $2,
                  available_at = now() + interval '15 seconds',
                  updated_at = now()
            WHERE id = $1`,
          [
            row.id,
            error instanceof Error ? error.message : String(error),
          ],
        );

        failed++;
        retried++;
      }
    }
  } finally {
    client.release();
  }

  return { processed, retried, failed };
}
