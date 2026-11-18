import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { createPool } from './index.ts';
import { reverseJournalLines, validateJournalLines, type JournalLineInput, type NormalizedJournalLine } from '../lib/doubleEntryJournal.ts';

const PG_BIGINT_MAX = 9_223_372_036_854_775_807n;

export type PostJournalInput = {
  uid: string;
  idempotencyKey: string;
  description: string;
  lines: JournalLineInput[];
};

export type PostedJournalEntry = {
  id: string;
  userId: number;
  idempotencyKey: string;
  description: string;
  status: 'posted';
  reversalOf: string | null;
  replayed: boolean;
};

function assertBoundedAmounts(lines: NormalizedJournalLine[]): void {
  for (const line of lines) {
    if (BigInt(line.debitUnits) > PG_BIGINT_MAX || BigInt(line.creditUnits) > PG_BIGINT_MAX) {
      throw new Error('Journal amount exceeds PostgreSQL BIGINT capacity.');
    }
  }
}

export function journalRequestHash(description: string, lines: NormalizedJournalLine[]): string {
  const canonicalLines = [...lines].sort((a, b) =>
    a.asset.localeCompare(b.asset) || a.accountCode.localeCompare(b.accountCode) ||
    a.debitUnits.localeCompare(b.debitUnits) || a.creditUnits.localeCompare(b.creditUnits),
  );
  return createHash('sha256').update(JSON.stringify({ description: description.trim(), lines: canonicalLines })).digest('hex');
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try { await client.query('ROLLBACK'); } catch { /* Preserve the original failure. */ }
}

async function writePostedEntry(
  client: PoolClient,
  args: { userId: number; idempotencyKey: string; description: string; lines: NormalizedJournalLine[]; requestHash: string; reversalOf?: string | null },
): Promise<PostedJournalEntry> {
  const prior = await client.query(
    `SELECT id::text, user_id, idempotency_key, description, status, reversal_of::text, request_hash
       FROM journal_entries WHERE user_id = $1 AND idempotency_key = $2`,
    [args.userId, args.idempotencyKey],
  );
  if (prior.rowCount) {
    const row = prior.rows[0];
    if (row.request_hash !== args.requestHash || (row.reversal_of ?? null) !== (args.reversalOf ?? null)) {
      throw new Error('Journal idempotency key was already used for a different posting.');
    }
    if (row.status !== 'posted') throw new Error('An incomplete journal entry requires operator review.');
    return { id: row.id, userId: row.user_id, idempotencyKey: row.idempotency_key, description: row.description, status: 'posted', reversalOf: row.reversal_of, replayed: true };
  }

  const inserted = await client.query(
    `INSERT INTO journal_entries (user_id, idempotency_key, description, status, reversal_of, request_hash)
     VALUES ($1, $2, $3, 'draft', $4, $5) RETURNING id::text`,
    [args.userId, args.idempotencyKey, args.description.trim(), args.reversalOf ?? null, args.requestHash],
  );
  const entryId = inserted.rows[0].id as string;

  for (const line of args.lines) {
    const account = await client.query(
      `INSERT INTO journal_accounts (user_id, account_code, asset)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, account_code, asset) DO NOTHING
       RETURNING id`,
      [args.userId, line.accountCode, line.asset],
    );
    const accountId = account.rows[0]?.id ?? (await client.query(
      'SELECT id FROM journal_accounts WHERE user_id = $1 AND account_code = $2 AND asset = $3',
      [args.userId, line.accountCode, line.asset],
    )).rows[0]?.id;
    if (!accountId) throw new Error('Unable to resolve tenant-owned journal account.');
    await client.query(
      `INSERT INTO journal_lines (user_id, journal_entry_id, account_id, asset, debit_units, credit_units)
       VALUES ($1, $2, $3, $4, $5::bigint, $6::bigint)`,
      [args.userId, entryId, accountId, line.asset, line.debitUnits, line.creditUnits],
    );
  }

  const posted = await client.query(
    `UPDATE journal_entries SET status = 'posted' WHERE user_id = $1 AND id = $2
     RETURNING id::text, user_id, idempotency_key, description, status, reversal_of::text`,
    [args.userId, entryId],
  );
  const row = posted.rows[0];
  return { id: row.id, userId: row.user_id, idempotencyKey: row.idempotency_key, description: row.description, status: 'posted', reversalOf: row.reversal_of, replayed: false };
}

/** Atomically create accounts, journal lines, and seal a balanced journal entry. */
export async function postJournalEntry(input: PostJournalInput): Promise<PostedJournalEntry> {
  const uid = input.uid?.trim();
  const idempotencyKey = input.idempotencyKey?.trim();
  const description = input.description?.trim();
  if (!uid || uid.length > 256) throw new Error('A valid authenticated user is required to post a journal entry.');
  if (!idempotencyKey || idempotencyKey.length > 200) throw new Error('A valid journal idempotency key is required.');
  if (!description || description.length > 500) throw new Error('A journal description of 1–500 characters is required.');
  const lines = validateJournalLines(input.lines);
  assertBoundedAmounts(lines);
  const requestHash = journalRequestHash(description, lines);
  const client = await createPool().connect();
  try {
    await client.query('BEGIN');
    const user = await client.query('SELECT id FROM users WHERE uid = $1', [uid]);
    if (!user.rowCount) throw new Error('Journal owner does not exist.');
    const userId = Number(user.rows[0].id);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [String(userId), idempotencyKey]);
    const result = await writePostedEntry(client, { userId, idempotencyKey, description, lines, requestHash });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

/** Reverse a posted entry exactly once; original rows remain immutable. */
export async function reversePostedJournalEntry(input: {
  uid: string;
  originalEntryId: string;
  idempotencyKey: string;
  description?: string;
}): Promise<PostedJournalEntry> {
  if (!/^\d+$/.test(input.originalEntryId)) throw new Error('A valid original journal entry ID is required.');
  const client = await createPool().connect();
  try {
    await client.query('BEGIN');
    const user = await client.query('SELECT id FROM users WHERE uid = $1', [input.uid]);
    if (!user.rowCount) throw new Error('Journal owner does not exist.');
    const userId = Number(user.rows[0].id);
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [String(userId), `reverse:${input.originalEntryId}`]);
    const original = await client.query(
      `SELECT id::text, description, status FROM journal_entries WHERE user_id = $1 AND id = $2 FOR UPDATE`,
      [userId, input.originalEntryId],
    );
    if (!original.rowCount || original.rows[0].status !== 'posted') throw new Error('Only an existing posted journal entry owned by this user can be reversed.');
    const sourceLines = await client.query(
      `SELECT a.account_code, l.asset, l.debit_units::text, l.credit_units::text
       FROM journal_lines l JOIN journal_accounts a ON a.user_id = l.user_id AND a.id = l.account_id
       WHERE l.user_id = $1 AND l.journal_entry_id = $2 ORDER BY l.id`,
      [userId, input.originalEntryId],
    );
    const lines = reverseJournalLines(sourceLines.rows.map((row) => ({
      accountCode: row.account_code, asset: row.asset, debitUnits: row.debit_units, creditUnits: row.credit_units,
    })));
    const description = input.description?.trim() || `Reversal of journal entry ${input.originalEntryId}`;
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) throw new Error('A valid reversal idempotency key is required.');
    const requestHash = journalRequestHash(description, lines);
    const result = await writePostedEntry(client, { userId, idempotencyKey, description, lines, requestHash, reversalOf: input.originalEntryId });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

/** Return posted net balances, grouped by tenant, account and asset. */
export async function getJournalAccountBalances(uid: string): Promise<Array<{ accountCode: string; asset: string; debitUnits: string; creditUnits: string; netDebitUnits: string }>> {
  const result = await createPool().query(
    `SELECT a.account_code, a.asset,
       COALESCE(sum(l.debit_units), 0)::text AS debit_units,
       COALESCE(sum(l.credit_units), 0)::text AS credit_units,
       (COALESCE(sum(l.debit_units), 0) - COALESCE(sum(l.credit_units), 0))::text AS net_debit_units
     FROM users u JOIN journal_accounts a ON a.user_id = u.id
     LEFT JOIN journal_lines l ON l.user_id = a.user_id AND l.account_id = a.id
     LEFT JOIN journal_entries e ON e.user_id = l.user_id AND e.id = l.journal_entry_id AND e.status = 'posted'
     WHERE u.uid = $1 AND (l.id IS NULL OR e.id IS NOT NULL)
     GROUP BY a.account_code, a.asset ORDER BY a.asset, a.account_code`,
    [uid],
  );
  return result.rows.map((row) => ({ accountCode: row.account_code, asset: row.asset, debitUnits: row.debit_units, creditUnits: row.credit_units, netDebitUnits: row.net_debit_units }));
}
