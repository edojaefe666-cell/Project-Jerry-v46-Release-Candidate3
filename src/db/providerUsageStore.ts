import type { Pool } from 'pg';
import { createPool } from './index.ts';

type Queryable = Pick<Pool, 'query'>;
const pool: Pool = createPool();
let schemaReady = false;

async function ensureSchema(client: Queryable = pool): Promise<void> {
  if (schemaReady) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS jerry_provider_daily_usage (
      owner_uid text NOT NULL,
      usage_day date NOT NULL,
      daily_limit_tokens integer NOT NULL CHECK (daily_limit_tokens > 0),
      reserved_tokens integer NOT NULL DEFAULT 0 CHECK (reserved_tokens >= 0),
      actual_tokens integer NOT NULL DEFAULT 0 CHECK (actual_tokens >= 0),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(owner_uid, usage_day)
    );
  `);
  if (client === pool) schemaReady = true;
}

export interface ProviderUsageReservation {
  ownerUid: string;
  day: string;
  reservedTokens: number;
  dailyLimitTokens: number;
}

/**
 * Reserve a conservative upper bound before every external provider attempt.
 * Reservations from failed/ambiguous attempts remain charged for that UTC day;
 * this prevents fallback or network failures from becoming an unmetered path.
 */
export async function reserveProviderTokens(input: {
  ownerUid: string;
  reserveTokens: number;
  dailyLimitTokens: number;
}, queryable: Queryable = pool): Promise<ProviderUsageReservation> {
  const ownerUid = input.ownerUid.trim();
  if (!ownerUid || !Number.isSafeInteger(input.reserveTokens) || input.reserveTokens < 1 ||
      !Number.isSafeInteger(input.dailyLimitTokens) || input.dailyLimitTokens < 1 ||
      input.reserveTokens > input.dailyLimitTokens) {
    throw new Error('Provider usage budget is invalid or the request exceeds the daily token ceiling.');
  }
  await ensureSchema(queryable);
  const result = await queryable.query(
    `INSERT INTO jerry_provider_daily_usage(owner_uid,usage_day,daily_limit_tokens,reserved_tokens,actual_tokens)
     VALUES($1,(now() AT TIME ZONE 'UTC')::date,$2,$3,0)
     ON CONFLICT(owner_uid,usage_day) DO UPDATE SET
       reserved_tokens=jerry_provider_daily_usage.reserved_tokens + EXCLUDED.reserved_tokens,
       updated_at=now()
     WHERE jerry_provider_daily_usage.daily_limit_tokens=EXCLUDED.daily_limit_tokens
       AND jerry_provider_daily_usage.reserved_tokens + jerry_provider_daily_usage.actual_tokens
           + EXCLUDED.reserved_tokens <= jerry_provider_daily_usage.daily_limit_tokens
     RETURNING (usage_day::text) AS day`,
    [ownerUid,input.dailyLimitTokens,input.reserveTokens],
  );
  const row = result.rows[0] as {day:string}|undefined;
  if (!row) {
    throw new Error('Jerry daily provider token ceiling reached or its configured limit changed during the UTC day. Provider execution is blocked.');
  }
  return {ownerUid,day:row.day,reservedTokens:input.reserveTokens,dailyLimitTokens:input.dailyLimitTokens};
}

/** Reconcile a successful provider response using its reported token usage. */
export async function settleProviderTokens(
  reservation: ProviderUsageReservation,
  actualTokens: number,
  queryable: Queryable = pool,
): Promise<void> {
  if (!Number.isSafeInteger(actualTokens) || actualTokens < 0 || actualTokens > reservation.reservedTokens) {
    // Keep the full reservation charged if provider usage is missing or exceeds
    // the conservative bound. Never lower the hard ceiling based on bad metadata.
    return;
  }
  await ensureSchema(queryable);
  const result = await queryable.query(
    `UPDATE jerry_provider_daily_usage
       SET reserved_tokens=GREATEST(0,reserved_tokens-$4),
           actual_tokens=actual_tokens+$5,
           updated_at=now()
     WHERE owner_uid=$1 AND usage_day=$2::date AND daily_limit_tokens=$3
       AND reserved_tokens >= $4`,
    [reservation.ownerUid,reservation.day,reservation.dailyLimitTokens,reservation.reservedTokens,actualTokens],
  );
  if (result.rowCount !== 1) throw new Error('Provider usage reconciliation failed; reservation remains charged.');
}
