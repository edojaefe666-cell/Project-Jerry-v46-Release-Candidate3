import { btcToSatoshis } from './btcUnits.ts';

export function calculateLegacyWalletSatoshis(rows: Array<{ txType: string; amount: number; fee: number; status: string; isVerifiedOnChain: boolean }>): string {
  return rows.reduce((sum, row) => {
    if (row.status !== 'confirmed' || !row.isVerifiedOnChain) return sum;
    const amount = BigInt(btcToSatoshis(row.amount));
    const fee = BigInt(btcToSatoshis(row.fee ?? 0));
    if (row.txType === 'outgoing') return sum - amount - fee;
    if (row.txType === 'incoming' || row.txType === 'business_revenue') return sum + amount;
    return sum;
  }, 0n).toString();
}
