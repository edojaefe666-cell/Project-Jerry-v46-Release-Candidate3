import type { WalletTransaction } from '../lib/types.ts';
import { btcToSatoshis, buildWalletJournalLines } from '../lib/btcUnits.ts';
import { createPool } from './index.ts';
import { postJournalEntry, reversePostedJournalEntry } from './journal.ts';


/**
 * Make confirmed wallet transactions visible in the double-entry journal.
 * The journal has its own idempotency key so retries repair a crash between
 * the workspace/legacy-ledger commit and journal commit.
 */
export async function ensureWalletTransactionJournaled(uid: string, transaction: WalletTransaction): Promise<{
  action: 'posted' | 'already-posted' | 'reversed' | 'not-eligible';
  journalEntryId?: string;
}> {
  const baseKey = `wallet-tx:${transaction.id}:confirmed`;
  const client = createPool();

  if (transaction.status === 'reorged') {
    const original = await client.query(
      `SELECT id::text FROM journal_entries WHERE user_id = (SELECT id FROM users WHERE uid = $1)
       AND idempotency_key = $2 AND status = 'posted'`,
      [uid, baseKey],
    );
    if (!original.rowCount) return { action: 'not-eligible' };
    const reversal = await reversePostedJournalEntry({
      uid,
      originalEntryId: original.rows[0].id,
      idempotencyKey: `wallet-tx:${transaction.id}:reorg-reversal`,
      description: `Reverse wallet transaction ${transaction.id} after Bitcoin finality loss`,
    });
    return { action: 'reversed', journalEntryId: reversal.id };
  }

  if (transaction.status !== 'confirmed' || !transaction.isVerifiedOnChain) {
    return { action: 'not-eligible' };
  }

  const amount = btcToSatoshis(transaction.amount);
  const fee = btcToSatoshis(transaction.fee ?? 0);
  if (BigInt(amount) <= 0n) throw new Error('Confirmed wallet journal amount must be positive.');

  const lines = buildWalletJournalLines(transaction.type, amount, fee);

  const entry = await postJournalEntry({
    uid,
    idempotencyKey: baseKey,
    description: `${transaction.type === 'outgoing' ? 'Confirmed outgoing transfer' : 'Confirmed incoming settlement'} ${transaction.id}`,
    lines,
  });
  return { action: entry.replayed ? 'already-posted' : 'posted', journalEntryId: entry.id };
}
