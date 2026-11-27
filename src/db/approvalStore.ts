import { randomUUID, createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { createPool } from './index.ts';

export type SharedHighImpactAction =
  | 'outgoing_payment' | 'bitcoin_transfer' | 'purchase' | 'subscription'
  | 'contract' | 'financial_commitment' | 'confidential_external_share' | 'high_impact_change';

export interface SharedApproval {
  id: string;
  action: SharedHighImpactAction;
  summary: string;
  amountUsd?: number;
  scope?: Record<string, unknown>;
  scopeHash?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  consumedAt?: string;
  reservationId?: string;
  reservedAt?: string;
  ownerUid: string;
}

const pool: Pool = createPool();
const TTL_MS = 15 * 60 * 1000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}
function scopeHash(scope?: Record<string, unknown>): string | undefined {
  return scope ? sha256(JSON.stringify(canonicalize(scope))) : undefined;
}
function validate(action: SharedHighImpactAction, amountUsd: number | undefined, scope?: Record<string, unknown>): void {
  const financial: SharedHighImpactAction[] = ['outgoing_payment','bitcoin_transfer','purchase','subscription','contract','financial_commitment'];
  if (!financial.includes(action)) return;
  if (!scope || Array.isArray(scope) || typeof scope !== 'object' || Object.keys(scope).length === 0) {
    throw new Error('Financial approval requires an explicit, immutable action scope.');
  }
  if (action === 'bitcoin_transfer') {
    const amount = Number(scope.amount);
    const fee = Number(scope.fee);
    const destination = String(scope.destination ?? '');
    if (scope.asset !== 'BTC' || scope.network !== 'Bitcoin Mainnet' ||
      !/^(bc1|[13])[a-km-zA-HJ-NP-Z1-9]{25,90}$/.test(destination) ||
      !Number.isFinite(amount) || amount <= 0 || amount > 21_000_000 ||
      !Number.isFinite(fee) || fee < 0 || fee > amount ||
      Math.abs(amount * 1e8 - Math.round(amount * 1e8)) > 1e-6 ||
      Math.abs(fee * 1e8 - Math.round(fee * 1e8)) > 1e-6) {
      throw new Error('Bitcoin transfer approval must bind exact BTC amount, fee, network and destination.');
    }
    return;
  }
  const recipient = String(scope.recipient ?? scope.destination ?? '').trim();
  const purpose = String(scope.purpose ?? '').trim();
  if (amountUsd === undefined || !Number.isFinite(amountUsd) || amountUsd <= 0 ||
    !recipient || recipient.length > 254 || purpose.length < 5 || purpose.length > 1000) {
    throw new Error('Financial approval requires a positive USD limit, exact recipient and clear purpose.');
  }
}
function mapRow(row: Record<string, any> | undefined): SharedApproval | null {
  if (!row) return null;
  return {
    id: String(row.id), action: row.action as SharedHighImpactAction, summary: String(row.summary),
    ...(row.amount_usd === null ? {} : { amountUsd: Number(row.amount_usd) }),
    ...(row.scope_json === null ? {} : { scope: row.scope_json as Record<string, unknown> }),
    ...(row.scope_hash === null ? {} : { scopeHash: String(row.scope_hash) }),
    status: row.status, createdAt: new Date(row.created_at).toISOString(),
    ...(row.decided_at ? { decidedAt: new Date(row.decided_at).toISOString() } : {}),
    ...(row.decided_by ? { decidedBy: String(row.decided_by) } : {}),
    ...(row.consumed_at ? { consumedAt: new Date(row.consumed_at).toISOString() } : {}),
    ...(row.reservation_id ? { reservationId: String(row.reservation_id) } : {}),
    ...(row.reserved_at ? { reservedAt: new Date(row.reserved_at).toISOString() } : {}),
    ownerUid: String(row.owner_uid),
  };
}

async function ensureSchema(client: Pool | PoolClient = pool): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS jerry_security_approvals (
      id text PRIMARY KEY,
      owner_uid text NOT NULL,
      action text NOT NULL,
      summary text NOT NULL,
      amount_usd double precision,
      scope_json jsonb,
      scope_hash text,
      status text NOT NULL CHECK (status IN ('pending','approved','rejected')),
      created_at timestamptz NOT NULL,
      decided_at timestamptz,
      decided_by text,
      consumed_at timestamptz,
      reservation_id text,
      reserved_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS jerry_security_approvals_owner_status_created
      ON jerry_security_approvals(owner_uid,status,created_at DESC);
    CREATE TABLE IF NOT EXISTS jerry_security_approval_audit (
      seq bigserial PRIMARY KEY,
      owner_uid text NOT NULL,
      actor_uid text NOT NULL,
      event text NOT NULL,
      details jsonb NOT NULL,
      created_at timestamptz NOT NULL,
      previous_hash text NOT NULL,
      entry_hash text NOT NULL UNIQUE
    );
    CREATE INDEX IF NOT EXISTS jerry_security_approval_audit_owner_seq
      ON jerry_security_approval_audit(owner_uid,seq);
    CREATE TABLE IF NOT EXISTS jerry_security_approved_contacts (
      id text PRIMARY KEY, owner_uid text NOT NULL, name text NOT NULL, email text NOT NULL,
      purpose text NOT NULL, status text NOT NULL CHECK(status IN ('active','revoked')),
      created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
    );
    CREATE INDEX IF NOT EXISTS jerry_security_contacts_owner_created
      ON jerry_security_approved_contacts(owner_uid,created_at DESC);
    CREATE TABLE IF NOT EXISTS jerry_security_audit (
      seq bigserial PRIMARY KEY, owner_uid text NOT NULL, actor_uid text NOT NULL, event text NOT NULL,
      details jsonb NOT NULL, created_at timestamptz NOT NULL, previous_hash text NOT NULL,
      entry_hash text NOT NULL UNIQUE
    );
    CREATE INDEX IF NOT EXISTS jerry_security_audit_owner_seq ON jerry_security_audit(owner_uid,seq);
  `);
}

async function audit(client: PoolClient, ownerUid: string, actorUid: string, event: string, details: unknown): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`jerry-approval-audit:${ownerUid}`]);
  const previous = await client.query(
    'SELECT entry_hash FROM jerry_security_approval_audit WHERE owner_uid=$1 ORDER BY seq DESC LIMIT 1', [ownerUid]);
  const previousHash = String(previous.rows[0]?.entry_hash ?? 'GENESIS');
  const createdAt = new Date();
  const canonicalDetails = canonicalize(details);
  const entryHash = sha256([ownerUid, actorUid, event, JSON.stringify(canonicalDetails), createdAt.toISOString(), previousHash].join('|'));
  await client.query(
    'INSERT INTO jerry_security_approval_audit(owner_uid,actor_uid,event,details,created_at,previous_hash,entry_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [ownerUid, actorUid, event, JSON.stringify(canonicalDetails), createdAt, previousHash, entryHash]);
}
async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original failure */ }
    throw error;
  } finally { client.release(); }
}

export async function createSharedApproval(input: {
  action: SharedHighImpactAction; summary: string; amountUsd?: number;
  scope?: Record<string, unknown>; ownerUid: string;
}): Promise<SharedApproval> {
  const ownerUid = input.ownerUid.trim();
  const summary = input.summary.trim();
  if (!ownerUid || !summary || summary.length > 1000) throw new Error('Owner and bounded approval summary are required.');
  validate(input.action, input.amountUsd, input.scope);
  const id = randomUUID();
  return transaction(async (client) => {
    const result = await client.query(
      `INSERT INTO jerry_security_approvals(id,owner_uid,action,summary,amount_usd,scope_json,scope_hash,status,created_at)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,'pending',now()) RETURNING *`,
      [id, ownerUid, input.action, summary, input.amountUsd ?? null,
        input.scope ? JSON.stringify(canonicalize(input.scope)) : null, scopeHash(input.scope) ?? null]);
    await audit(client, ownerUid, ownerUid, 'approval.created', { id, action: input.action, amountUsd: input.amountUsd });
    return mapRow(result.rows[0])!;
  });
}

export async function listSharedApprovals(ownerUid: string, status?: SharedApproval['status']): Promise<SharedApproval[]> {
  await ensureSchema();
  const result = status
    ? await pool.query('SELECT * FROM jerry_security_approvals WHERE owner_uid=$1 AND status=$2 ORDER BY created_at DESC', [ownerUid,status])
    : await pool.query('SELECT * FROM jerry_security_approvals WHERE owner_uid=$1 ORDER BY created_at DESC', [ownerUid]);
  return result.rows.map((row) => mapRow(row)!);
}

export async function getSharedApproval(id: string, ownerUid: string): Promise<SharedApproval | null> {
  await ensureSchema();
  const result = await pool.query('SELECT * FROM jerry_security_approvals WHERE id=$1 AND owner_uid=$2', [id,ownerUid]);
  return mapRow(result.rows[0]);
}

export async function decideSharedApproval(id: string, decision: 'approved'|'rejected', actorUid: string): Promise<SharedApproval | null> {
  return transaction(async (client) => {
    const cutoff = new Date(Date.now() - TTL_MS);
    const result = await client.query(
      `UPDATE jerry_security_approvals SET status=$1,decided_at=now(),decided_by=$2
       WHERE id=$3 AND owner_uid=$2 AND status='pending' AND created_at >= $4 RETURNING *`,
      [decision,actorUid,id,cutoff]);
    if (!result.rows[0]) return null;
    await audit(client, actorUid, actorUid, 'approval.decided', { id, decision, decidedAt: result.rows[0].decided_at });
    return mapRow(result.rows[0]);
  });
}

export async function reserveSharedApproval(
  id: string, action: SharedHighImpactAction, ownerUid: string, reservationId: string,
  expectedScope?: Record<string, unknown>,
): Promise<SharedApproval | null> {
  return transaction(async (client) => {
    const control = await client.query('SELECT stopped FROM jerry_execution_control WHERE id=1');
    if (control.rows[0]?.stopped !== false) throw new Error('Shared emergency stop is active or unavailable.');
    const cutoff = new Date(Date.now() - TTL_MS);
    const result = await client.query(
      `UPDATE jerry_security_approvals SET reservation_id=$1,reserved_at=now()
       WHERE id=$2 AND owner_uid=$3 AND action=$4 AND status='approved' AND consumed_at IS NULL
       AND (created_at >= $5 OR reservation_id=$1)
       AND ($6::text IS NULL OR scope_hash=$6)
       AND (reservation_id IS NULL OR reservation_id=$1)
       RETURNING *`,
      [reservationId,id,ownerUid,action,cutoff,scopeHash(expectedScope) ?? null]);
    if (!result.rows[0]) return null;
    await audit(client, ownerUid, ownerUid, 'approval.reserved', { id, action, reservationId });
    return mapRow(result.rows[0]);
  });
}

export async function finalizeSharedApprovalReservation(id: string, ownerUid: string, reservationId: string): Promise<SharedApproval | null> {
  return transaction(async (client) => {
    const result = await client.query(
      `UPDATE jerry_security_approvals SET consumed_at=now(),reservation_id=NULL,reserved_at=NULL
       WHERE id=$1 AND owner_uid=$2 AND status='approved' AND consumed_at IS NULL AND reservation_id=$3 RETURNING *`,
      [id,ownerUid,reservationId]);
    if (!result.rows[0]) return null;
    await audit(client, ownerUid, ownerUid, 'approval.consumed', { id, reservationId, consumedAt: result.rows[0].consumed_at });
    return mapRow(result.rows[0]);
  });
}

export async function releaseSharedApprovalReservation(id: string, ownerUid: string, reservationId: string): Promise<boolean> {
  return transaction(async (client) => {
    const result = await client.query(
      `UPDATE jerry_security_approvals SET reservation_id=NULL,reserved_at=NULL
       WHERE id=$1 AND owner_uid=$2 AND consumed_at IS NULL AND reservation_id=$3 RETURNING id`,
      [id,ownerUid,reservationId]);
    if (!result.rows[0]) return false;
    await audit(client, ownerUid, ownerUid, 'approval.reservation_released', { id, reservationId });
    return true;
  });
}

export async function consumeSharedApproval(
  id: string, action: SharedHighImpactAction, ownerUid: string, expectedScope?: Record<string, unknown>,
): Promise<SharedApproval | null> {
  return transaction(async (client) => {
    const cutoff = new Date(Date.now() - TTL_MS);
    const result = await client.query(
      `UPDATE jerry_security_approvals SET consumed_at=now()
       WHERE id=$1 AND owner_uid=$2 AND action=$3 AND status='approved' AND consumed_at IS NULL
       AND reservation_id IS NULL AND created_at >= $4 AND ($5::text IS NULL OR scope_hash=$5)
       RETURNING *`,
      [id,ownerUid,action,cutoff,scopeHash(expectedScope) ?? null]);
    if (!result.rows[0]) return null;
    await audit(client, ownerUid, ownerUid, 'approval.consumed', { id, action, consumedAt: result.rows[0].consumed_at });
    return mapRow(result.rows[0]);
  });
}


export interface SharedSecuritySnapshot {
  version: 1;
  approvals: Array<Record<string, unknown>>;
  contacts: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
}

export async function exportSharedSecuritySnapshot(ownerUid: string): Promise<SharedSecuritySnapshot> {
  await ensureSchema();
  const [approvals, contacts, auditRows] = await Promise.all([
    pool.query(`SELECT id,action,summary,amount_usd AS "amountUsd",scope_json AS "scopeJson",scope_hash AS "scopeHash",
      status,created_at AS "createdAt",decided_at AS "decidedAt",decided_by AS "decidedBy",
      consumed_at AS "consumedAt" FROM jerry_security_approvals WHERE owner_uid=$1 ORDER BY created_at`, [ownerUid]),
    pool.query(`SELECT id,name,email,purpose,status,created_at AS "createdAt",updated_at AS "updatedAt"
      FROM jerry_security_approved_contacts WHERE owner_uid=$1 ORDER BY created_at`, [ownerUid]),
    pool.query(`SELECT seq,actor_uid AS "actorUid",event,details,created_at AS "createdAt",
      previous_hash AS "previousHash",entry_hash AS "entryHash"
      FROM jerry_security_audit WHERE owner_uid=$1 ORDER BY seq`, [ownerUid]),
  ]);
  return { version: 1, approvals: approvals.rows, contacts: contacts.rows, audit: auditRows.rows };
}

/**
 * Restores contact and audit history under the same transaction as consuming
 * the exact restore approval. Historical approvals are imported as inert:
 * pending approvals become rejected and every imported approved approval is
 * marked consumed, preventing backup restore from reviving spending authority.
 */
export async function restoreSharedSecuritySnapshot(
  snapshot: SharedSecuritySnapshot, ownerUid: string, approvalId: string,
): Promise<void> {
  await transaction(async (client) => {
    const expectedScope = scopeHash({ operation: 'security_backup_restore' });
    const consumed = await client.query(
      `UPDATE jerry_security_approvals SET consumed_at=now()
       WHERE id=$1 AND owner_uid=$2 AND action='high_impact_change' AND status='approved'
       AND consumed_at IS NULL AND reservation_id IS NULL AND created_at >= $3 AND scope_hash=$4
       RETURNING id`,
      [approvalId, ownerUid, new Date(Date.now()-TTL_MS), expectedScope]);
    if (consumed.rowCount !== 1) throw new Error('A fresh approved high-impact restore authorization is required.');
    await audit(client, ownerUid, ownerUid, 'approval.consumed', { id: approvalId, operation: 'security_backup_restore' });

    await client.query('DELETE FROM jerry_security_approved_contacts WHERE owner_uid=$1', [ownerUid]);
    await client.query('DELETE FROM jerry_security_audit WHERE owner_uid=$1', [ownerUid]);
    for (const contact of snapshot.contacts) {
      await client.query(
        `INSERT INTO jerry_security_approved_contacts(id,owner_uid,name,email,purpose,status,created_at,updated_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [String(contact.id),ownerUid,String(contact.name),String(contact.email),String(contact.purpose),
          contact.status === 'active' ? 'active' : 'revoked',contact.createdAt,contact.updatedAt]);
    }
    for (const entry of snapshot.audit) {
      await appendSharedSecurityAudit(client, ownerUid, String(entry.actorUid ?? 'system'),
        String(entry.event), entry.details ?? {}, new Date(String(entry.createdAt)),
        String(entry.previousHash ?? ''), String(entry.entryHash ?? ''));
    }
    for (const item of snapshot.approvals) {
      const originalStatus = item.status;
      const importedStatus = originalStatus === 'pending' ? 'rejected'
        : originalStatus === 'approved' || originalStatus === 'rejected' ? originalStatus : 'rejected';
      const consumedAt = importedStatus === 'approved' ? (item.consumedAt ? new Date(String(item.consumedAt)) : new Date()) : null;
      await client.query(
        `INSERT INTO jerry_security_approvals(id,owner_uid,action,summary,amount_usd,scope_json,scope_hash,status,
          created_at,decided_at,decided_by,consumed_at,reservation_id,reserved_at)
         VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,NULL,NULL)
         ON CONFLICT(id) DO NOTHING`,
        [String(item.id),ownerUid,String(item.action),String(item.summary),item.amountUsd ?? null,
          item.scopeJson ? JSON.stringify(item.scopeJson) : item.scope ? JSON.stringify(item.scope) : null,
          String(item.scopeHash ?? ''),importedStatus,item.createdAt,item.decidedAt ?? null,
          item.decidedBy ?? null,consumedAt]);
    }
    await appendSharedSecurityAudit(client, ownerUid, ownerUid, 'security.backup.restored',
      { approvalId, approvalCount: snapshot.approvals.length, contactCount: snapshot.contacts.length },
      new Date(), undefined, undefined);
  });
}

export interface SharedSecurityAuditEntry {
  seq: number; actorUid: string; event: string; details: unknown; createdAt: string;
  previousHash: string; entryHash: string;
}
async function appendSharedSecurityAudit(
  client: PoolClient, ownerUid: string, actorUid: string, event: string, details: unknown,
  createdAt = new Date(), suppliedPrevious?: string, suppliedHash?: string,
): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`jerry-security-audit:${ownerUid}`]);
  const previous = await client.query('SELECT entry_hash FROM jerry_security_audit WHERE owner_uid=$1 ORDER BY seq DESC LIMIT 1',[ownerUid]);
  const previousHash = suppliedPrevious ?? String(previous.rows[0]?.entry_hash ?? 'GENESIS');
  const canonicalDetails = canonicalize(details);
  const entryHash = suppliedHash ?? sha256(`${previousHash}\n${createdAt.toISOString()}\n${actorUid}\n${event}\n${JSON.stringify(canonicalDetails)}`);
  await client.query(
    `INSERT INTO jerry_security_audit(owner_uid,actor_uid,event,details,created_at,previous_hash,entry_hash)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [ownerUid,actorUid,event,JSON.stringify(canonicalDetails),createdAt,previousHash,entryHash]);
}
export async function listSharedSecurityAudit(ownerUid: string, limit = 100): Promise<SharedSecurityAuditEntry[]> {
  await ensureSchema();
  const safeLimit = Math.min(500,Math.max(1,Math.floor(limit)));
  const result = await pool.query(
    `SELECT seq,actor_uid AS "actorUid",event,details,created_at AS "createdAt",
      previous_hash AS "previousHash",entry_hash AS "entryHash"
     FROM jerry_security_audit WHERE owner_uid=$1 ORDER BY seq DESC LIMIT $2`,[ownerUid,safeLimit]);
  return result.rows;
}
export async function verifySharedSecurityAudit(ownerUid: string): Promise<{valid:boolean;count:number}> {
  await ensureSchema();
  const result = await pool.query(
    'SELECT actor_uid AS "actorUid",event,details,created_at AS "createdAt",previous_hash AS "previousHash",entry_hash AS "entryHash" FROM jerry_security_audit WHERE owner_uid=$1 ORDER BY seq',[ownerUid]);
  let previous = 'GENESIS';
  for (const row of result.rows) {
    const expected = sha256(`${previous}\n${new Date(row.createdAt).toISOString()}\n${row.actorUid}\n${row.event}\n${JSON.stringify(canonicalize(row.details))}`);
    if (row.previousHash !== previous || row.entryHash !== expected) return {valid:false,count:result.rows.length};
    previous = row.entryHash;
  }
  return {valid:true,count:result.rows.length};
}
export async function auditSharedSecurityEvent(ownerUid: string, event: string, details: unknown): Promise<void> {
  await transaction(async client => appendSharedSecurityAudit(client,ownerUid,ownerUid,event,details));
}
