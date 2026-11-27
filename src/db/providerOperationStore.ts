import type { Pool } from 'pg';
import { createPool } from './index.ts';
type Queryable = Pick<Pool, 'query'>;
const pool: Pool = createPool();
let schemaReady = false;
async function ensureSchema(client: Queryable = pool): Promise<void> {
  if (schemaReady) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS jerry_provider_daily_operations (
      owner_uid text NOT NULL,
      usage_day date NOT NULL,
      daily_limit_operations integer NOT NULL CHECK (daily_limit_operations > 0),
      used_operations integer NOT NULL DEFAULT 0 CHECK (used_operations >= 0),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(owner_uid, usage_day)
    );
  `);
  if (client === pool) schemaReady = true;
}
export async function reserveProviderOperation(input: { ownerUid: string; dailyLimitOperations: number }, queryable: Queryable = pool): Promise<{ ownerUid: string; day: string }> {
  const ownerUid = input.ownerUid.trim();
  if (!ownerUid || !Number.isSafeInteger(input.dailyLimitOperations) || input.dailyLimitOperations < 1) throw new Error('Provider daily operation budget is not configured or is invalid.');
  await ensureSchema(queryable);
  const result = await queryable.query(
    `INSERT INTO jerry_provider_daily_operations(owner_uid,usage_day,daily_limit_operations,used_operations)
     VALUES($1,(now() AT TIME ZONE 'UTC')::date,$2,1)
     ON CONFLICT(owner_uid,usage_day) DO UPDATE SET
       used_operations=jerry_provider_daily_operations.used_operations + 1,
       updated_at=now()
     WHERE jerry_provider_daily_operations.daily_limit_operations=EXCLUDED.daily_limit_operations
       AND jerry_provider_daily_operations.used_operations < jerry_provider_daily_operations.daily_limit_operations
     RETURNING usage_day::text AS day`,
    [ownerUid,input.dailyLimitOperations],
  );
  const row = result.rows[0] as { day: string } | undefined;
  if (!row) throw new Error('Jerry daily provider operation ceiling reached or its configured limit changed during the UTC day. External provider execution is blocked.');
  return { ownerUid, day: row.day };
}
export async function reserveConfiguredProviderOperation(ownerUid: string): Promise<void> {
  const dailyLimitOperations = Number(process.env.JERRY_DAILY_PROVIDER_OPERATION_LIMIT);
  if (!Number.isSafeInteger(dailyLimitOperations) || dailyLimitOperations < 1) throw new Error('JERRY_DAILY_PROVIDER_OPERATION_LIMIT must be configured as a positive integer before multimodal or direct SDK provider calls.');
  await reserveProviderOperation({ ownerUid, dailyLimitOperations });
}
