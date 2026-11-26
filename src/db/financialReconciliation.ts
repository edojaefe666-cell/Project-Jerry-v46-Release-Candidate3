import { createPool } from './index.ts';
import { postJournalEntry, reversePostedJournalEntry, getJournalAccountBalances } from './journal.ts';
import { btcToSatoshis, buildWalletJournalLines } from '../lib/btcUnits.ts';
import { calculateLegacyWalletSatoshis, mapLegacyWalletTransactionRows } from '../lib/financialReconciliationMath.ts';
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

export type WalletJournalEntryAuditRow = {
  id: string;
  idempotency_key: string;
  reversal_of: string | null;
  status: string;
};

export type WalletJournalEntryAudit = {
  confirmedEntriesByTransaction: Map<string, string[]>;
  reversedOriginalEntryIds: Set<string>;
  duplicateConfirmedGenerations: string[];
  unmatchedReversalEntries: string[];
};

export function auditWalletJournalEntries(rows: WalletJournalEntryAuditRow[]): WalletJournalEntryAudit {
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const audit = auditWalletJournalEntries(journaled.rows as WalletJournalEntryAuditRow[]);
  const confirmedEntriesByTransaction = audit.confirmedEntriesByTransaction;
  const journaledIds = new Set(confirmedEntriesByTransaction.keys());
  const unreversedReorged = [...reorgedIds].filter((txRef) => {
    const postedGenerations = confirmedEntriesByTransaction.get(txRef) ?? [];
    return postedGenerations.some((entryId) => !audit.reversedOriginalEntryIds.has(entryId));
  });
  const ineligibleJournaledTransactions = [...new Set(
    journaled.rows
      .filter((row) => row.status === 'posted')
      .map((row) => parseWalletJournalEntryKey(row.idempotency_key))
      .filter((parsed): parsed is NonNullable<typeof parsed> => parsed?.event === 'confirmed')
      .map((parsed) => parsed.transactionRef)
      .filter((txRef) => {
        const source = legacy.rows.find((row) => row.tx_ref === txRef);
        return !source || !(source.status === 'confirmed' && source.is_verified_on_chain === true);
      })
  )];

  return {
    confirmedEntriesByTransaction,
    reversedOriginalEntryIds,
    duplicateConfirmedGenerations: [...generationCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([generation]) => generation),
    unmatchedReversalEntries,
  };
}

export type FinancialTruthReport = {
  legacyWalletSatoshis: string;
  journalWalletSatoshis: string;
  deltaSatoshis: string;
  eligibleHistoricalTransactions: number;
  journaledTransactions: number;
  unjournaledConfirmedTransactions: string[];
  unreversedReorgedTransactions: string[];
  duplicateConfirmedGenerations: string[];
  unmatchedReversalEntries: string[];
  ineligibleJournaledTransactions: string[];
  integrityClean: boolean;
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
  const legacyWalletSatoshis = BigInt(calculateLegacyWalletSatoshis(mapLegacyWalletTransactionRows(legacy.rows)));
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
  const confirmedEntriesByTransaction = new Map<string, string[]>();
  const reversedOriginalEntryIds = new Set<string>();
  for (const row of journaled.rows) {
    const parsed = parseWalletJournalEntryKey(row.idempotency_key);
    if (!parsed || row.status !== 'posted') continue;
    if (parsed.event === 'confirmed') {
      const entries = confirmedEntriesByTransaction.get(parsed.transactionRef) ?? [];
      entries.push(String(row.id));
      confirmedEntriesByTransaction.set(parsed.transactionRef, entries);
    }
    if (parsed.event === 'reorg-reversal' && row.reversal_of) {
      reversedOriginalEntryIds.add(String(row.reversal_of));
    }
  }
  const journaledIds = new Set(confirmedEntriesByTransaction.keys());
  const unreversedReorged = [...reorgedIds].filter((txRef) => {
    const postedGenerations = confirmedEntriesByTransaction.get(txRef) ?? [];
    return postedGenerations.some((entryId) => !reversedOriginalEntryIds.has(entryId));
  });

  return {
    legacyWalletSatoshis: legacyWalletSatoshis.toString(),
    journalWalletSatoshis: journalWalletSatoshis.toString(),
    deltaSatoshis: deltaSatoshis.toString(),
    eligibleHistoricalTransactions: confirmedIds.size,
    journaledTransactions: [...confirmedIds].filter((id) => journaledIds.has(id)).length,
    unjournaledConfirmedTransactions: [...confirmedIds].filter((id) => !journaledIds.has(id)),
    unreversedReorgedTransactions: unreversedReorged,
    duplicateConfirmedGenerations: audit.duplicateConfirmedGenerations,
    unmatchedReversalEntries: audit.unmatchedReversalEntries,
    ineligibleJournaledTransactions,
    integrityClean: audit.duplicateConfirmedGenerations.length === 0 &&
      audit.unmatchedReversalEntries.length === 0 &&
      ineligibleJournaledTransactions.length === 0 &&
      unreversedReorged.length === 0 &&
      [...confirmedIds].every((id) => journaledIds.has(id)),
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
      const originals = await pool.query(
        `SELECT je.id::text
           FROM journal_entries je JOIN users u ON u.id = je.user_id
          WHERE u.uid = $1 AND je.status = 'posted'
            AND (je.idempotency_key = $2 OR left(je.idempotency_key, length($3)) = $3)
          ORDER BY je.id`,
        [uid, `wallet-tx:${row.tx_ref}:confirmed`, `wallet-tx:${row.tx_ref}:confirmed:`],
      );
      if (!originals.rowCount) { skipped++; continue; }
      for (const original of originals.rows as Array<{ id: string }>) {
        const reversal = await reversePostedJournalEntry({
          uid,
          originalEntryId: original.id,
          idempotencyKey: `wallet-tx:${row.tx_ref}:reorg-reversal:entry-${original.id}`,
          description: `Historical reversal of reorged wallet transaction ${row.tx_ref}`,
        });
        if (reversal.replayed) replayed++; else reversed++;
      }
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
