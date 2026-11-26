import { btcToSatoshis } from './btcUnits.ts';

export type LegacyWalletTransactionRow = {
  txType: string;
  amount: number;
  fee: number;
  status: string;
  isVerifiedOnChain: boolean;
};

/** Convert PostgreSQL snake_case rows into the domain shape used by reconciliation math. */
export function mapLegacyWalletTransactionRows(rows: Array<{
  tx_type: string;
  amount: number | string;
  fee: number | string | null;
  status: string;
  is_verified_on_chain: boolean | null;
}>): LegacyWalletTransactionRow[] {
  return rows.map((row) => {
    const amount = Number(row.amount);
    const fee = Number(row.fee ?? 0);
    if (!Number.isFinite(amount) || !Number.isFinite(fee) || amount < 0 || fee < 0) {
      throw new Error('Legacy wallet transaction contains an invalid BTC amount or fee.');
    }
    return {
      txType: row.tx_type,
      amount,
      fee,
      status: row.status,
      isVerifiedOnChain: row.is_verified_on_chain === true,
    };
  });
}

export function calculateLegacyWalletSatoshis(rows: LegacyWalletTransactionRow[]): string {
  return rows.reduce((sum, row) => {
    if (row.status !== 'confirmed' || !row.isVerifiedOnChain) return sum;
    const amount = BigInt(btcToSatoshis(row.amount));
    const fee = BigInt(btcToSatoshis(row.fee ?? 0));
    if (row.txType === 'outgoing') return sum - amount - fee;
    if (row.txType === 'incoming' || row.txType === 'business_revenue') return sum + amount;
    return sum;
  }, 0n).toString();
}
