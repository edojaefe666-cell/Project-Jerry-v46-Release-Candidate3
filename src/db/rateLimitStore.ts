import type { Pool } from 'pg';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createPool } from './index.ts';

type Queryable = Pick<Pool, 'query'>;
const pool: Pool = createPool();
let schemaReady = false;

async function ensureSchema(client: Queryable = pool): Promise<void> {
  if (schemaReady) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS jerry_owner_rate_limits (
      owner_uid text NOT NULL,
      bucket_key text NOT NULL,
      window_started_at timestamptz NOT NULL,
      request_count integer NOT NULL CHECK (request_count >= 0),
      PRIMARY KEY(owner_uid,bucket_key)
    );
    CREATE INDEX IF NOT EXISTS jerry_owner_rate_limits_window
      ON jerry_owner_rate_limits(window_started_at);
  `);
  if (client === pool) schemaReady = true;
}

export interface SharedRateLimitResult {
  allowed: boolean;
  count: number;
  resetAt: number;
}

export async function consumeSharedOwnerRateLimit(input: {
  ownerUid: string;
  bucketKey: string;
  limit: number;
  windowMs: number;
}, queryable: Queryable = pool): Promise<SharedRateLimitResult> {
  const ownerUid = input.ownerUid.trim();
  const bucketKey = input.bucketKey.trim();
  if (!ownerUid || !/^[a-z0-9._-]{1,80}$/i.test(bucketKey) ||
      !Number.isSafeInteger(input.limit) || input.limit < 1 ||
      !Number.isSafeInteger(input.windowMs) || input.windowMs < 1) {
    throw new Error('Invalid shared rate-limit identity or configuration.');
  }
  await ensureSchema(queryable);
  const result = await queryable.query(
    `INSERT INTO jerry_owner_rate_limits(owner_uid,bucket_key,window_started_at,request_count)
     VALUES($1,$2,now(),1)
     ON CONFLICT(owner_uid,bucket_key) DO UPDATE SET
       window_started_at=CASE
         WHEN jerry_owner_rate_limits.window_started_at <= now() - ($4 * interval '1 millisecond')
         THEN now() ELSE jerry_owner_rate_limits.window_started_at END,
       request_count=CASE
         WHEN jerry_owner_rate_limits.window_started_at <= now() - ($4 * interval '1 millisecond')
         THEN 1 ELSE jerry_owner_rate_limits.request_count + 1 END
     RETURNING request_count AS count, window_started_at AS "windowStartedAt",
       (request_count <= $3) AS allowed`,
    [ownerUid,bucketKey,input.limit,input.windowMs],
  );
  const row = result.rows[0] as {count:number;windowStartedAt:Date|string;allowed:boolean}|undefined;
  if (!row) throw new Error('Shared rate-limit storage returned no decision.');
  return {
    allowed: row.allowed === true,
    count: Number(row.count),
    resetAt: new Date(row.windowStartedAt).getTime() + input.windowMs,
  };
}

export function createSharedOwnerRateLimiter(
  bucketKey: string, limit: number, windowMs: number,
  consume: typeof consumeSharedOwnerRateLimit = consumeSharedOwnerRateLimit,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ownerUid = (req as Request & {user?:{uid?:string}}).user?.uid?.trim();
    if (!ownerUid) {
      res.status(401).json({error:'Authenticated owner identity is required.'});
      return;
    }
    try {
      const decision = await consume({ownerUid,bucketKey,limit,windowMs});
      const remaining = Math.max(0,limit-decision.count);
      res.setHeader('RateLimit-Limit',String(limit));
      res.setHeader('RateLimit-Remaining',String(remaining));
      res.setHeader('RateLimit-Reset',String(Math.ceil(decision.resetAt/1000)));
      if (!decision.allowed) {
        res.setHeader('Retry-After',String(Math.max(1,Math.ceil((decision.resetAt-Date.now())/1000))));
        res.status(429).json({error:'Jerry shared request limit reached. Please retry after the indicated interval.'});
        return;
      }
      next();
    } catch {
      res.status(503).json({error:'Jerry shared rate-limit storage is unavailable. This operation is blocked.'});
    }
  };
}
