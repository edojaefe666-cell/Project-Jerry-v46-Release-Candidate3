import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { createPool } from './index.ts';

type Queryable = Pick<Pool, 'query'>;
const pool: Pool = createPool();
let schemaReady = false;

async function ensureSchema(client: Queryable = pool): Promise<void> {
  if (schemaReady) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS jerry_provider_daily_cost (
      owner_uid text NOT NULL,
      usage_day date NOT NULL,
      daily_limit_micro_usd bigint NOT NULL CHECK (daily_limit_micro_usd > 0),
      reserved_micro_usd bigint NOT NULL DEFAULT 0 CHECK (reserved_micro_usd >= 0),
      actual_micro_usd bigint NOT NULL DEFAULT 0 CHECK (actual_micro_usd >= 0),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(owner_uid, usage_day)
    );
    CREATE TABLE IF NOT EXISTS jerry_provider_cost_reservations (
      reservation_id text PRIMARY KEY,
      owner_uid text NOT NULL,
      usage_day date NOT NULL,
      daily_limit_micro_usd bigint NOT NULL CHECK (daily_limit_micro_usd > 0),
      reserved_micro_usd bigint NOT NULL CHECK (reserved_micro_usd > 0),
      status text NOT NULL CHECK (status IN ('reserved','settled')),
      created_at timestamptz NOT NULL DEFAULT now(),
      settled_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS jerry_provider_cost_reservations_owner_day
      ON jerry_provider_cost_reservations(owner_uid, usage_day);
  `);
  if (client === pool) schemaReady = true;
}

export interface ProviderCostReservation {
  reservationId: string;
  ownerUid: string;
  day: string;
  reservedMicroUsd: number;
  dailyLimitMicroUsd: number;
}

export interface ProviderModelPricing {
  inputMicroUsdPerMillionTokens: number;
  outputMicroUsdPerMillionTokens: number;
}

function costMicroUsd(tokens: number, rate: number): number {
  if (!Number.isSafeInteger(tokens) || tokens < 0 || !Number.isSafeInteger(rate) || rate < 0) {
    throw new Error('Provider pricing or token usage is invalid.');
  }
  const value = (BigInt(tokens) * BigInt(rate) + 999_999n) / 1_000_000n;
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Provider cost exceeds the supported accounting range.');
  return Number(value);
}

export function estimateProviderCostMicroUsd(inputTokens: number, outputTokens: number, pricing: ProviderModelPricing): number {
  const total = BigInt(costMicroUsd(inputTokens, pricing.inputMicroUsdPerMillionTokens)) +
    BigInt(costMicroUsd(outputTokens, pricing.outputMicroUsdPerMillionTokens));
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Provider cost estimate exceeds the supported accounting range.');
  return Number(total);
}

/** Atomically reserve budget and create a unique, single-settlement reservation. */
export async function reserveProviderCost(input: {
  ownerUid: string;
  reserveMicroUsd: number;
  dailyLimitMicroUsd: number;
}, queryable: Queryable = pool): Promise<ProviderCostReservation> {
  const ownerUid = input.ownerUid.trim();
  if (!ownerUid || !Number.isSafeInteger(input.reserveMicroUsd) || input.reserveMicroUsd < 1 ||
      !Number.isSafeInteger(input.dailyLimitMicroUsd) || input.dailyLimitMicroUsd < 1 ||
      input.reserveMicroUsd > input.dailyLimitMicroUsd) {
    throw new Error('Provider USD cost reservation is invalid or exceeds the configured daily ceiling.');
  }
  await ensureSchema(queryable);
  const reservationId = randomUUID();
  const result = await queryable.query(
    `WITH budget AS (
       INSERT INTO jerry_provider_daily_cost(owner_uid,usage_day,daily_limit_micro_usd,reserved_micro_usd,actual_micro_usd)
       VALUES($1,(now() AT TIME ZONE 'UTC')::date,$2,$3,0)
       ON CONFLICT(owner_uid,usage_day) DO UPDATE SET
         reserved_micro_usd=jerry_provider_daily_cost.reserved_micro_usd + EXCLUDED.reserved_micro_usd,
         updated_at=now()
       WHERE jerry_provider_daily_cost.daily_limit_micro_usd=EXCLUDED.daily_limit_micro_usd
         AND jerry_provider_daily_cost.reserved_micro_usd + jerry_provider_daily_cost.actual_micro_usd
             + EXCLUDED.reserved_micro_usd <= jerry_provider_daily_cost.daily_limit_micro_usd
       RETURNING usage_day
     ), recorded AS (
       INSERT INTO jerry_provider_cost_reservations
         (reservation_id,owner_uid,usage_day,daily_limit_micro_usd,reserved_micro_usd,status)
       SELECT $4,$1,usage_day,$2,$3,'reserved' FROM budget
       RETURNING reservation_id,usage_day
     )
     SELECT reservation_id,usage_day::text AS day FROM recorded`,
    [ownerUid,input.dailyLimitMicroUsd,input.reserveMicroUsd,reservationId],
  );
  const row = result.rows[0] as {reservation_id:string;day:string}|undefined;
  if (!row) throw new Error('Jerry daily provider USD cost ceiling reached or its configured limit changed during the UTC day. Provider execution is blocked.');
  return {reservationId:row.reservation_id,ownerUid,day:row.day,reservedMicroUsd:input.reserveMicroUsd,dailyLimitMicroUsd:input.dailyLimitMicroUsd};
}

/** Settle once only; duplicate, stale, or over-reservation settlements cannot release budget. */
export async function settleProviderCost(
  reservation: ProviderCostReservation,
  actualMicroUsd: number,
  queryable: Queryable = pool,
): Promise<void> {
  if (!Number.isSafeInteger(actualMicroUsd) || actualMicroUsd < 0 || actualMicroUsd > reservation.reservedMicroUsd) return;
  await ensureSchema(queryable);
  const result = await queryable.query(
    `WITH claimed AS (
       UPDATE jerry_provider_cost_reservations
       SET status='settled', settled_at=now()
       WHERE reservation_id=$1 AND owner_uid=$2 AND usage_day=$3::date
         AND daily_limit_micro_usd=$4 AND reserved_micro_usd=$5 AND status='reserved'
       RETURNING owner_uid,usage_day,daily_limit_micro_usd,reserved_micro_usd
     )
     UPDATE jerry_provider_daily_cost AS daily
     SET reserved_micro_usd=daily.reserved_micro_usd-claimed.reserved_micro_usd,
         actual_micro_usd=daily.actual_micro_usd+$6,
         updated_at=now()
     FROM claimed
     WHERE daily.owner_uid=claimed.owner_uid AND daily.usage_day=claimed.usage_day
       AND daily.daily_limit_micro_usd=claimed.daily_limit_micro_usd
       AND daily.reserved_micro_usd >= claimed.reserved_micro_usd
     RETURNING daily.owner_uid`,
    [reservation.reservationId,reservation.ownerUid,reservation.day,reservation.dailyLimitMicroUsd,reservation.reservedMicroUsd,actualMicroUsd],
  );
  if (result.rowCount !== 1) throw new Error('Provider USD cost settlement was already applied or its reservation could not be verified; budget remains fail-closed.');
}


export interface ProviderCostLedgerSnapshot {
  daily: Array<{ day: string; dailyLimitMicroUsd: string; reservedMicroUsd: string; actualMicroUsd: string }>;
  reservations: Array<{ reservationId: string; day: string; reservedMicroUsd: string; status: 'reserved' | 'settled'; createdAt: string; settledAt: string | null }>;
}

/** Read-only owner-scoped audit view; unresolved reservations remain visibly reserved. */
export async function getProviderCostLedgerSnapshot(ownerUid: string, limit = 30, queryable: Queryable = pool): Promise<ProviderCostLedgerSnapshot> {
  const uid = ownerUid.trim();
  if (!uid || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Provider cost ledger query is invalid.');
  await ensureSchema(queryable);
  const [daily, reservations] = await Promise.all([
    queryable.query(
      `SELECT usage_day::text AS day, daily_limit_micro_usd::text AS "dailyLimitMicroUsd",
              reserved_micro_usd::text AS "reservedMicroUsd", actual_micro_usd::text AS "actualMicroUsd"
       FROM jerry_provider_daily_cost WHERE owner_uid=$1
       ORDER BY usage_day DESC LIMIT $2`, [uid, limit]),
    queryable.query(
      `SELECT reservation_id AS "reservationId", usage_day::text AS day,
              reserved_micro_usd::text AS "reservedMicroUsd", status,
              created_at::text AS "createdAt", settled_at::text AS "settledAt"
       FROM jerry_provider_cost_reservations WHERE owner_uid=$1
       ORDER BY created_at DESC, reservation_id DESC LIMIT $2`, [uid, limit]),
  ]);
  return { daily: daily.rows as ProviderCostLedgerSnapshot['daily'], reservations: reservations.rows as ProviderCostLedgerSnapshot['reservations'] };
}


export async function getProviderCostAudit(ownerUid: string, days = 30): Promise<{
  daily: Array<{ day: string; dailyLimitMicroUsd: number; reservedMicroUsd: number; actualMicroUsd: number }>;
  reservations: Array<{ reservationId: string; day: string; reservedMicroUsd: number; status: 'reserved' | 'settled'; createdAt: string; settledAt: string | null }>;
}> {
  if (!ownerUid.trim() || !Number.isSafeInteger(days) || days < 1 || days > 90) {
    throw new Error('Provider cost audit scope is invalid.');
  }
  await ensureSchema();
  const [dailyResult, reservationResult] = await Promise.all([
    pool.query(
      `SELECT usage_day::text AS day, daily_limit_micro_usd, reserved_micro_usd, actual_micro_usd
       FROM jerry_provider_daily_cost
       WHERE owner_uid=$1 AND usage_day >= (now() AT TIME ZONE 'UTC')::date - $2::integer
       ORDER BY usage_day DESC LIMIT 90`,
      [ownerUid, days],
    ),
    pool.query(
      `SELECT reservation_id, usage_day::text AS day, reserved_micro_usd, status,
              created_at, settled_at
       FROM jerry_provider_cost_reservations
       WHERE owner_uid=$1
       ORDER BY created_at DESC LIMIT 100`,
      [ownerUid],
    ),
  ]);
  return {
    daily: dailyResult.rows.map((row: any) => ({
      day: row.day, dailyLimitMicroUsd: Number(row.daily_limit_micro_usd),
      reservedMicroUsd: Number(row.reserved_micro_usd), actualMicroUsd: Number(row.actual_micro_usd),
    })),
    reservations: reservationResult.rows.map((row: any) => ({
      reservationId: row.reservation_id, day: row.day, reservedMicroUsd: Number(row.reserved_micro_usd),
      status: row.status, createdAt: new Date(row.created_at).toISOString(),
      settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null,
    })),
  };
}
