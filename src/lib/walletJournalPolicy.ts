import type { WalletTransaction } from './types.ts';

/** Only independently verified Bitcoin mainnet wallet events enter the double-entry journal. */
export function isEligibleWalletJournalEvent(transaction: WalletTransaction): boolean {
  if (transaction.asset !== 'BTC' || transaction.network !== 'Bitcoin Mainnet') return false;
  return transaction.status === 'reorged' ||
    (transaction.status === 'confirmed' && transaction.isVerifiedOnChain === true);
}
