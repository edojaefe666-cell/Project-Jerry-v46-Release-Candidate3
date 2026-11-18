/** Convert BTC to integer satoshis without using floating-point multiplication. */
export function btcToSatoshis(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 21_000_000) {
    throw new Error('Wallet journal received an invalid BTC amount.');
  }
  const scaled = value * 100_000_000;
  if (!Number.isSafeInteger(Math.round(scaled)) || Math.abs(scaled - Math.round(scaled)) > 1e-6) {
    throw new Error('Wallet journal BTC amounts must have at most eight decimal places.');
  }
  const fixed = value.toFixed(8);
  const [whole, fraction] = fixed.split('.');
  return (BigInt(whole) * 100_000_000n + BigInt(fraction)).toString();
}


export function buildWalletJournalLines(
  type: 'incoming' | 'outgoing' | 'business_revenue',
  amount: string,
  fee: string,
): Array<{ accountCode: string; asset: 'BTC'; debitUnits: string; creditUnits: string }> {
  if (!/^[1-9][0-9]*$/.test(amount) || !/^(0|[1-9][0-9]*)$/.test(fee)) {
    throw new Error('Wallet journal lines require positive integer satoshi amounts.');
  }
  if (type === 'outgoing') {
    return [
      { accountCode: 'asset:btc:transfer-clearing', asset: 'BTC', debitUnits: amount, creditUnits: '0' },
      { accountCode: 'asset:btc:wallet', asset: 'BTC', debitUnits: '0', creditUnits: amount },
      ...(BigInt(fee) > 0n ? [
        { accountCode: 'expense:btc:network-fee', asset: 'BTC' as const, debitUnits: fee, creditUnits: '0' },
        { accountCode: 'asset:btc:wallet', asset: 'BTC' as const, debitUnits: '0', creditUnits: fee },
      ] : []),
    ];
  }
  return [
    { accountCode: 'asset:btc:wallet', asset: 'BTC', debitUnits: amount, creditUnits: '0' },
    { accountCode: 'income:btc:settlement', asset: 'BTC', debitUnits: '0', creditUnits: amount },
  ];
}
