import { createPool } from './index.ts';
import { postJournalEntry, reversePostedJournalEntry, getJournalAccountBalances } from './journal.ts';
import { btcToSatoshis, buildWalletJournalLines } from '../lib/btcUnits.ts';
import { calculateLegacyWalletSatoshis } from '../lib/financialReconciliationMath.ts';
import type { WalletTransaction } from '../lib/types.ts';

export async function getAuthoritativeWalletBtcSatoshis(uid: string): Promise<bigint> {
  const balances = await getJournalAccountBalances(uid);
  const wallet = balances.find((row) => row.accountCode === 'asset:btc:wallet' && row.asset === 'BTC');
  return BigInt(wallet?.netDebitUnits ?? '0');
}

export function parseWalletJournalEntryKey(value: string): { transactionRef: string; event: 'confirmed' | 'reorg-reversal' } | null {
  const match = /^wallet-tx:(.+):(confirmed|reorg-reversal)(?::.+)?$/.exec(value);
  if (!match) return null;
  return { transactionRef: match[1], event: match[2] as 'confirmed' | 'reorg-reversal' };
}

export type FinancialTruthReport = {
  legacyWalletSatoshis: string;
  journalWalletSatoshis: string;
  deltaSatoshis: string;
  eligibleHistoricalTransactions: number;
  journaledTransactions: number;
  unjournaledConfirmedTransactions: string[];
  unreversedReorgedTransactions: string[];
  balanced: boolean;
};

export async function reconcileFinancialTruth(uid: string): Promise<FinancialTruthReport> {
  const pool = createPool();
  const legacy = await pool.query(
    `SELECT lt.tx_ref, lt.tx_type, lt.amount, lt.fee, lt.status, lt.is_verified_on_chain
       FROM ledger_transactions lt JOIN users u ON u.id = lt.user_id
      WHERE u.uid = $1 AND lt.asset = 'BTC' AND lt.network = 'Bitcoin Mainnet'
      ORDER BY lt.id`,
    [uid],
  );
  const journalBalances = await getJournalAccountBalances(uid);
  const walletJournal = journalBalances.find((row) => row.accountCode === 'asset:btc:wallet' && row.asset === 'BTC');
  const journalWalletSatoshis = BigInt(walletJournal?.netDebitUnits ?? '0');
  const legacyWalletSatoshis = BigInt(calculateLegacyWalletSatoshis(legacy.rows));
  const deltaSatoshis = legacyWalletSatoshis - journalWalletSatoshis;

  const confirmedIds = new Set<string>();
  const reorgedIds = new Set<string>();
  for (const row of legacy.rows) {
    if (row.status === 'confirmed' && row.is_verified_on_chain) confirmedIds.add(row.tx_ref);
    if (row.status === 'reorged') reorgedIds.add(row.tx_ref);
  }
  const journaled = await pool.query(
    `SELECT je.id::text, je.idempotency_key, je.reversal_of::text, je.status
       FROM journal_entries je JOIN users u ON u.id = je.user_id
      WHERE u.uid = $1 AND je.idempotency_key LIKE 'wallet-tx:%'`,
    [uid],
  );
  const journaledIds = new Set<string>();
  const reversedIds = new Set<string>();
  for (const row of journaled.rows) {
    const parsed = parseWalletJournalEntryKey(row.idempotency_key);
    if (!parsed) continue;
    if (parsed.event === 'confirmed' && row.status === 'posted') journaledIds.add(parsed.transactionRef);
    if (parsed.event === 'reorg-reversal' && row.status === 'posted') reversedIds.add(parsed.transactionRef);
  }

  return {
    legacyWalletSatoshis: legacyWalletSatoshis.toString(),
    journalWalletSatoshis: journalWalletSatoshis.toString(),
    deltaSatoshis: deltaSatoshis.toString(),
    eligibleHistoricalTransactions: confirmedIds.size,
    journaledTransactions: [...confirmedIds].filter((id) => journaledIds.has(id)).length,
    unjournaledConfirmedTransactions: [...confirmedIds].filter((id) => !journaledIds.has(id)),
    unreversedReorgedTransactions: [...reorgedIds].filter((id) => journaledIds.has(id) && !reversedIds.has(id)),
    balanced: deltaSatoshis === 0n,
  };
}

/** Backfill only independently verified confirmed transactions; reruns are idempotent. */
export async function backfillHistoricalWalletJournal(uid: string): Promise<{ posted: number; replayed: number; reversed: number; skipped: number }> {
  const pool = createPool();
  const result = await pool.query(
    `SELECT lt.tx_ref, lt.timestamp, lt.tx_type, lt.asset, lt.network, lt.amount, lt.fee,
            lt.counterparty, lt.status, lt.note, lt.tx_hash, lt.is_verified_on_chain,
            lt.confirmation_depth, lt.verified_block_height, lt.verified_block_hash
       FROM ledger_transactions lt JOIN users u ON u.id = lt.user_id
      WHERE u.uid = $1 AND lt.asset = 'BTC' AND lt.network = 'Bitcoin Mainnet'
      ORDER BY lt.id`,
    [uid],
  );
  let posted = 0; let replayed = 0; let reversed = 0; let skipped = 0;
  for (const row of result.rows) {
    if (row.status === 'reorged') {
      const original = await pool.query(
        `SELECT id::text FROM journal_entries je JOIN users u ON u.id = je.user_id
          WHERE u.uid = $1 AND je.idempotency_key = $2 AND je.status = 'posted'`,
        [uid, `wallet-tx:${row.tx_ref}:confirmed`],
      );
      if (!original.rowCount) { skipped++; continue; }
      const existingReversal = await pool.query(
        `SELECT 1 FROM journal_entries je JOIN users u ON u.id = je.user_id
          WHERE u.uid = $1 AND je.idempotency_key = $2 AND je.status = 'posted'`,
        [uid, `wallet-tx:${row.tx_ref}:reorg-reversal`],
      );
      if (existingReversal.rowCount) { replayed++; continue; }
      await reversePostedJournalEntry({
        uid,
        originalEntryId: original.rows[0].id,
        idempotencyKey: `wallet-tx:${row.tx_ref}:reorg-reversal`,
        description: `Historical reversal of reorged wallet transaction ${row.tx_ref}`,
      });
      reversed++;
      continue;
    }
    if (row.status !== 'confirmed' || !row.is_verified_on_chain) { skipped++; continue; }
    const tx: WalletTransaction = {
      id: row.tx_ref,
      timestamp: row.timestamp,
      type: row.tx_type,
      asset: 'BTC',
      network: row.network,
      amount: row.amount,
      fee: row.fee,
      counterparty: row.counterparty,
      status: row.status,
      note: row.note,
      txHash: row.tx_hash ?? undefined,
      isVerifiedOnChain: row.is_verified_on_chain,
      confirmationDepth: row.confirmation_depth ?? undefined,
      verifiedBlockHeight: row.verified_block_height ?? undefined,
      verifiedBlockHash: row.verified_block_hash ?? undefined,
    };
    const lines = buildWalletJournalLines(tx.type, btcToSatoshis(tx.amount), btcToSatoshis(tx.fee ?? 0));
    const entry = await postJournalEntry({
      uid,
      idempotencyKey: `wallet-tx:${tx.id}:confirmed`,
      description: `Historical wallet transaction ${tx.id}`,
      lines,
    });
    if (entry.replayed) replayed++; else posted++;
  }
  return { posted, replayed, reversed, skipped };
}
