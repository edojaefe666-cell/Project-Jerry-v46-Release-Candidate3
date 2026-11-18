/** Pure validation for incoming Bitcoin settlement evidence from Blockstream. */
export interface BitcoinOutput {
  scriptpubkey_address?: string;
  value?: number;
}

export interface BitcoinTransactionEvidence {
  txid?: string;
  vout?: BitcoinOutput[];
}

export function validateIncomingBitcoinPayment(input: {
  txHash: string;
  amountBtc: number;
  receivingAddresses: string[];
  transaction: BitcoinTransactionEvidence;
}): { valid: boolean; receivedSatoshis: number; reason?: string } {
  const hash = input.txHash.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash) || input.transaction.txid?.toLowerCase() !== hash) {
    return { valid: false, receivedSatoshis: 0, reason: 'Bitcoin transaction identity does not match the submitted hash.' };
  }
  if (!Number.isFinite(input.amountBtc) || input.amountBtc <= 0 || input.amountBtc > 21_000_000) {
    return { valid: false, receivedSatoshis: 0, reason: 'Invalid Bitcoin settlement amount.' };
  }
  const expectedSatoshis = Math.round(input.amountBtc * 100_000_000);
  if (!Number.isSafeInteger(expectedSatoshis) || Math.abs(input.amountBtc * 100_000_000 - expectedSatoshis) > 1e-6) {
    return { valid: false, receivedSatoshis: 0, reason: 'Settlement amount must be an exact satoshi value.' };
  }
  const addresses = new Set(input.receivingAddresses.filter(Boolean));
  if (addresses.size === 0) return { valid: false, receivedSatoshis: 0, reason: 'No Bitcoin receiving address is configured in this workspace.' };
  let receivedSatoshis = 0;
  for (const output of input.transaction.vout ?? []) {
    if (!output.scriptpubkey_address || !addresses.has(output.scriptpubkey_address)) continue;
    if (!Number.isSafeInteger(output.value) || (output.value ?? -1) < 0) {
      return { valid: false, receivedSatoshis: 0, reason: 'Bitcoin transaction contains an invalid output value.' };
    }
    receivedSatoshis += output.value!;
    if (!Number.isSafeInteger(receivedSatoshis)) {
      return { valid: false, receivedSatoshis: 0, reason: 'Bitcoin output total exceeds safe integer precision.' };
    }
  }
  if (receivedSatoshis !== expectedSatoshis) {
    return { valid: false, receivedSatoshis, reason: `Transaction pays ${receivedSatoshis} satoshis to configured workspace addresses; ${expectedSatoshis} satoshis were submitted.` };
  }
  return { valid: true, receivedSatoshis };
}
