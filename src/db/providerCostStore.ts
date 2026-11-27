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
  `);
  if (client === pool) schemaReady = true;
}

export interface ProviderCostReservation {
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

export function estimateProviderCostMicroUsd(
  inputTokens: number,
  outputTokens: number,
  pricing: ProviderModelPricing,
): number {
  const total = BigInt(costMicroUsd(inputTokens, pricing.inputMicroUsdPerMillionTokens)) +
    BigInt(costMicroUsd(outputTokens, pricing.outputMicroUsdPerMillionTokens));
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Provider cost estimate exceeds the supported accounting range.');
  return Number(total);
}

/** Reserve the maximum configured cost before each provider attempt. */
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
  const result = await queryable.query(
    `INSERT INTO jerry_provider_daily_cost(owner_uid,usage_day,daily_limit_micro_usd,reserved_micro_usd,actual_micro_usd)
     VALUES($1,(now() AT TIME ZONE 'UTC')::date,$2,$3,0)
     ON CONFLICT(owner_uid,usage_day) DO UPDATE SET
       reserved_micro_usd=jerry_provider_daily_cost.reserved_micro_usd + EXCLUDED.reserved_micro_usd,
       updated_at=now()
     WHERE jerry_provider_daily_cost.daily_limit_micro_usd=EXCLUDED.daily_limit_micro_usd
       AND jerry_provider_daily_cost.reserved_micro_usd + jerry_provider_daily_cost.actual_micro_usd
           + EXCLUDED.reserved_micro_usd <= jerry_provider_daily_cost.daily_limit_micro_usd
     RETURNING usage_day::text AS day`,
    [ownerUid,input.dailyLimitMicroUsd,input.reserveMicroUsd],
  );
  const row = result.rows[0] as {day:string}|undefined;
  if (!row) throw new Error('Jerry daily provider USD cost ceiling reached or its configured limit changed during the UTC day. Provider execution is blocked.');
  return {ownerUid,day:row.day,reservedMicroUsd:input.reserveMicroUsd,dailyLimitMicroUsd:input.dailyLimitMicroUsd};
}

/** Replace a successful attempt's reservation with provider-reported actual cost. */
export async function settleProviderCost(
  reservation: ProviderCostReservation,
  actualMicroUsd: number,
  queryable: Queryable = pool,
): Promise<void> {
  if (!Number.isSafeInteger(actualMicroUsd) || actualMicroUsd < 0 || actualMicroUsd > reservation.reservedMicroUsd) return;
  await ensureSchema(queryable);
  const result = await queryable.query(
    `UPDATE jerry_provider_daily_cost
       SET reserved_micro_usd=GREATEST(0,reserved_micro_usd-$4),
           actual_micro_usd=actual_micro_usd+$5,
           updated_at=now()
     WHERE owner_uid=$1 AND usage_day=$2::date AND daily_limit_micro_usd=$3
       AND reserved_micro_usd >= $4`,
    [reservation.ownerUid,reservation.day,reservation.dailyLimitMicroUsd,reservation.reservedMicroUsd,actualMicroUsd],
  );
  if (result.rowCount !== 1) throw new Error('Provider USD cost reconciliation failed; reservation remains charged.');
}
