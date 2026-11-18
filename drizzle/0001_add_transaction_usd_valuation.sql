ALTER TABLE ledger_transactions
  ADD COLUMN IF NOT EXISTS usd_value double precision,
  ADD COLUMN IF NOT EXISTS usd_valuation_at text,
  ADD COLUMN IF NOT EXISTS usd_valuation_source text;
