import type { WalletTransaction } from './types.ts';

export type SettlementApprovalDecision = 'approved' | 'rejected';

/**
 * An owner approval alone never creates wallet credit. A pending BTC settlement
 * becomes journal-eligible only when its immutable on-chain evidence is complete.
 */
export function resolveSettlementApprovalStatus(
  transaction: WalletTransaction,
  decision: SettlementApprovalDecision,
): WalletTransaction['status'] {
  if (decision === 'rejected') return 'rejected';
  if (transaction.status !== 'pending_approval') return transaction.status;

  const hasFinalityEvidence =
    transaction.type === 'business_revenue' &&
    transaction.asset === 'BTC' &&
    transaction.network === 'Bitcoin Mainnet' &&
    transaction.settlementMode === 'on_chain' &&
    transaction.isVerifiedOnChain === true &&
    Number.isInteger(transaction.confirmationDepth) &&
    (transaction.confirmationDepth ?? 0) >= 6 &&
    Number.isInteger(transaction.verifiedBlockHeight) &&
    (transaction.verifiedBlockHeight ?? 0) > 0 &&
    typeof transaction.verifiedBlockHash === 'string' &&
    /^[0-9a-f]{64}$/i.test(transaction.verifiedBlockHash) &&
    typeof transaction.txHash === 'string' &&
    /^[0-9a-f]{64}$/i.test(transaction.txHash);

  return hasFinalityEvidence ? 'confirmed' : 'pending_approval';
}
