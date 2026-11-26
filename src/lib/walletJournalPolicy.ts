import type { WalletTransaction } from './types.ts';

/** Only independently verified Bitcoin mainnet wallet events enter the double-entry journal. */
export function isEligibleWalletJournalEvent(transaction: WalletTransaction): boolean {
  if (transaction.asset !== 'BTC' || transaction.network !== 'Bitcoin Mainnet') return false;
  return transaction.status === 'reorged' ||
    (transaction.status === 'confirmed' && transaction.isVerifiedOnChain === true);
}

/** Stable identity for one confirmed-chain generation of a transaction. */
export function getWalletJournalIdentity(transaction: WalletTransaction): string {
  const cycle = Number.isSafeInteger(transaction.journalCycle) && (transaction.journalCycle ?? 0) >= 0
    ? transaction.journalCycle ?? 0
    : 0;
  const block = transaction.verifiedBlockHash?.toLowerCase()
    ?? (Number.isSafeInteger(transaction.verifiedBlockHeight) && (transaction.verifiedBlockHeight ?? 0) > 0
      ? `height-${transaction.verifiedBlockHeight}`
      : 'legacy');
  return `cycle-${cycle}:block-${block}`;
}

/** Outbox idempotency distinguishes repeated confirmations after chain reorganisations. */
export function getWalletJournalEventKey(transaction: WalletTransaction): string {
  const event = transaction.status === 'reorged' ? 'reorg' : transaction.status;
  return `wallet-tx:${transaction.id}:${event}:${getWalletJournalIdentity(transaction)}`;
}
