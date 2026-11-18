export type JournalLineInput = {
  accountCode: string;
  asset: string;
  debitUnits?: string | bigint;
  creditUnits?: string | bigint;
};

export type NormalizedJournalLine = {
  accountCode: string;
  asset: string;
  debitUnits: string;
  creditUnits: string;
};

const INTEGER = /^(0|[1-9][0-9]*)$/;

/** Validate integer atomic-unit postings and enforce per-asset double-entry balance. */
export function validateJournalLines(lines: JournalLineInput[]): NormalizedJournalLine[] {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error('A journal entry requires at least two lines.');
  }
  const totals = new Map<string, { debit: bigint; credit: bigint }>();
  const normalized = lines.map((line) => {
    const accountCode = line.accountCode?.trim();
    const asset = line.asset?.trim().toUpperCase();
    if (!accountCode || accountCode.length > 80) throw new Error('Every journal line requires a valid account code.');
    if (!asset || !/^[A-Z0-9._-]{2,20}$/.test(asset)) throw new Error('Every journal line requires a valid asset code.');
    const debitUnits = String(line.debitUnits ?? '0');
    const creditUnits = String(line.creditUnits ?? '0');
    if (!INTEGER.test(debitUnits) || !INTEGER.test(creditUnits)) {
      throw new Error('Journal amounts must be non-negative integer atomic units.');
    }
    const debit = BigInt(debitUnits);
    const credit = BigInt(creditUnits);
    if ((debit > 0n) === (credit > 0n)) throw new Error('Each journal line must contain exactly one positive debit or credit.');
    const total = totals.get(asset) ?? { debit: 0n, credit: 0n };
    total.debit += debit;
    total.credit += credit;
    totals.set(asset, total);
    return { accountCode, asset, debitUnits, creditUnits };
  });
  for (const [asset, total] of totals) {
    if (total.debit !== total.credit) throw new Error(`Journal entry is unbalanced for ${asset}.`);
  }
  return normalized;
}

export function reverseJournalLines(lines: NormalizedJournalLine[]): NormalizedJournalLine[] {
  return lines.map((line) => ({
    ...line,
    debitUnits: line.creditUnits,
    creditUnits: line.debitUnits,
  }));
}
