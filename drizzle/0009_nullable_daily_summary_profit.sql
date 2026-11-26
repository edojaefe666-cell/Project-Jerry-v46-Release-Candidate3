-- Financial summaries may legitimately have no verified ledger value.
-- Existing numeric values are preserved; new unverified reports store NULL.
ALTER TABLE daily_summary_reports
  ALTER COLUMN daily_profit_usd DROP NOT NULL;
