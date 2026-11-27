import { randomUUID } from 'node:crypto';
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
      reserved_tokens bigint NOT NULL DEFAULT 0 CHECK (reserved_tokens >= 0),
      actual_tokens bigint NOT NULL DEFAULT 0 CHECK (actual_tokens >= 0),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(owner_uid, usage_day)
    );
    CREATE TABLE IF NOT EXISTS jerry_provider_token_reservations (
      reservation_id text PRIMARY KEY,
      owner_uid text NOT NULL,
      usage_day date NOT NULL,
      daily_limit_tokens integer NOT NULL CHECK (daily_limit_tokens > 0),
      reserved_tokens bigint NOT NULL CHECK (reserved_tokens > 0),
      status text NOT NULL CHECK (status IN ('reserved','settled')),
      created_at timestamptz NOT NULL DEFAULT now(),
      settled_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS jerry_provider_token_reservations_owner_day
      ON jerry_provider_token_reservations(owner_uid, usage_day);
  `);
  if (client === pool) schemaReady = true;
}

export interface ProviderUsageReservation {
  reservationId: string;
  ownerUid: string;
  day: string;
  reservedTokens: number;
  dailyLimitTokens: number;
}

/** Reserve a conservative upper bound and create a unique single-settlement ledger row. */
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
  const reservationId = randomUUID();
  const result = await queryable.query(
    `WITH budget AS (
       INSERT INTO jerry_provider_daily_usage(owner_uid,usage_day,daily_limit_tokens,reserved_tokens,actual_tokens)
       VALUES($1,(now() AT TIME ZONE 'UTC')::date,$2,$3,0)
       ON CONFLICT(owner_uid,usage_day) DO UPDATE SET
         reserved_tokens=jerry_provider_daily_usage.reserved_tokens + EXCLUDED.reserved_tokens,
         updated_at=now()
       WHERE jerry_provider_daily_usage.daily_limit_tokens=EXCLUDED.daily_limit_tokens
         AND jerry_provider_daily_usage.reserved_tokens + jerry_provider_daily_usage.actual_tokens
             + EXCLUDED.reserved_tokens <= jerry_provider_daily_usage.daily_limit_tokens
       RETURNING usage_day
     ), recorded AS (
       INSERT INTO jerry_provider_token_reservations
         (reservation_id,owner_uid,usage_day,daily_limit_tokens,reserved_tokens,status)
       SELECT $4,$1,usage_day,$2,$3,'reserved' FROM budget
       RETURNING reservation_id,usage_day
     )
     SELECT reservation_id,usage_day::text AS day FROM recorded`,
    [ownerUid,input.dailyLimitTokens,input.reserveTokens,reservationId],
  );
  const row = result.rows[0] as {reservation_id:string;day:string}|undefined;
  if (!row) throw new Error('Jerry daily provider token ceiling reached or its configured limit changed during the UTC day. Provider execution is blocked.');
  return {reservationId:row.reservation_id,ownerUid,day:row.day,reservedTokens:input.reserveTokens,dailyLimitTokens:input.dailyLimitTokens};
}

/** Reconcile a successful response once. Failed/ambiguous calls retain the reservation. */
export async function settleProviderTokens(
  reservation: ProviderUsageReservation,
  actualTokens: number,
  queryable: Queryable = pool,
): Promise<void> {
  if (!Number.isSafeInteger(actualTokens) || actualTokens < 0 || actualTokens > reservation.reservedTokens) return;
  await ensureSchema(queryable);
  const result = await queryable.query(
    `WITH claimed AS (
       UPDATE jerry_provider_token_reservations
       SET status='settled',settled_at=now()
       WHERE reservation_id=$1 AND owner_uid=$2 AND usage_day=$3::date
         AND daily_limit_tokens=$4 AND reserved_tokens=$5 AND status='reserved'
       RETURNING owner_uid,usage_day,daily_limit_tokens,reserved_tokens
     )
     UPDATE jerry_provider_daily_usage AS daily
     SET reserved_tokens=daily.reserved_tokens-claimed.reserved_tokens,
         actual_tokens=daily.actual_tokens+$6,
         updated_at=now()
     FROM claimed
     WHERE daily.owner_uid=claimed.owner_uid AND daily.usage_day=claimed.usage_day
       AND daily.daily_limit_tokens=claimed.daily_limit_tokens
       AND daily.reserved_tokens >= claimed.reserved_tokens
     RETURNING daily.owner_uid`,
    [reservation.reservationId,reservation.ownerUid,reservation.day,reservation.dailyLimitTokens,reservation.reservedTokens,actualTokens],
  );
  if (result.rowCount !== 1) throw new Error('Provider token settlement was already applied or its reservation could not be verified; budget remains fail-closed.');
}


export async function getProviderUsageAudit(ownerUid: string, days = 30): Promise<{
  daily: Array<{ day: string; dailyLimitTokens: number; reservedTokens: number; actualTokens: number }>;
  reservations: Array<{ reservationId: string; day: string; reservedTokens: number; status: 'reserved' | 'settled'; createdAt: string; settledAt: string | null }>;
}> {
  if (!ownerUid.trim() || !Number.isSafeInteger(days) || days < 1 || days > 90) {
    throw new Error('Provider usage audit scope is invalid.');
  }
  await ensureSchema();
  const [dailyResult, reservationResult] = await Promise.all([
    pool.query(
      `SELECT usage_day::text AS day, daily_limit_tokens, reserved_tokens, actual_tokens
       FROM jerry_provider_daily_usage
       WHERE owner_uid=$1 AND usage_day >= (now() AT TIME ZONE 'UTC')::date - $2::integer
       ORDER BY usage_day DESC LIMIT 90`,
      [ownerUid, days],
    ),
    pool.query(
      `SELECT reservation_id, usage_day::text AS day, reserved_tokens, status,
              created_at, settled_at
       FROM jerry_provider_token_reservations
       WHERE owner_uid=$1
       ORDER BY created_at DESC LIMIT 100`,
      [ownerUid],
    ),
  ]);
  return {
    daily: dailyResult.rows.map((row: any) => ({
      day: row.day, dailyLimitTokens: Number(row.daily_limit_tokens),
      reservedTokens: Number(row.reserved_tokens), actualTokens: Number(row.actual_tokens),
    })),
    reservations: reservationResult.rows.map((row: any) => ({
      reservationId: row.reservation_id, day: row.day, reservedTokens: Number(row.reserved_tokens),
      status: row.status, createdAt: new Date(row.created_at).toISOString(),
      settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null,
    })),
  };
}
