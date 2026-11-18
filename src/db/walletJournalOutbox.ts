import { sql } from 'drizzle-orm';
import { createPool } from './index.ts';
import { ensureWalletTransactionJournaled } from './walletJournal.ts';
import type { WalletTransaction } from '../lib/types.ts';

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
  const eventKey = `wallet-tx:${transaction.id}:${transaction.status === 'reorged' ? 'reorg' : transaction.status}`;
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

export async function drainWalletJournalOutbox(uid?: string, limit = 50): Promise<{
  processed: number;
  retried: number;
  failed: number;
}> {
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
         WHERE o.status = 'pending' AND o.available_at <= now()
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

    for (const row of picked.rows as Array<{
      id: number;
      user_id: number;
      event_key: string;
      tx_ref: string;
      payload_json: WalletTransaction;
    }>) {
      try {
        const user = await client.query(
          'SELECT uid FROM users WHERE id = $1',
          [row.user_id],
        );

        if (!user.rowCount) {
          throw new Error('Outbox owner no longer exists.');
        }

        const result = await ensureWalletTransactionJournaled(
          user.rows[0].uid,
          row.payload_json,
        );

        await client.query(
          `UPDATE wallet_journal_outbox
              SET status = 'processed',
                  processed_at = now(),
                  last_error = NULL,
                  updated_at = now()
            WHERE id = $1`,
          [row.id],
        );

        processed += result.action === 'not-eligible' ? 0 : 1;
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
