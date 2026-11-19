import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type HighImpactAction =
  | 'outgoing_payment'
  | 'bitcoin_transfer'
  | 'purchase'
  | 'subscription'
  | 'contract'
  | 'financial_commitment'
  | 'confidential_external_share'
  | 'high_impact_change';

export interface ApprovedContact {
  id: string;
  name: string;
  email: string;
  purpose: string;
  status: 'active' | 'revoked';
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  seq: number;
  actorUid?: string;
  event: string;
  details: unknown;
  createdAt: string;
  previousHash: string;
  entryHash: string;
}

export interface ApprovalRequest {
  id: string;
  action: HighImpactAction;
  summary: string;
  amountUsd?: number;
  scope?: Record<string, unknown>;
  scopeHash?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  decidedAt?: string;
  consumedAt?: string;
  reservationId?: string;
  reservedAt?: string;
  ownerUid?: string;
  decidedBy?: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function now(): string {
  return new Date().toISOString();
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonicalize(v)]));
  }
  return value;
}

function hashScope(scope?: Record<string, unknown>): string | undefined {
  return scope ? sha256(JSON.stringify(canonicalize(scope))) : undefined;
}

const APPROVAL_TTL_MS = 15 * 60 * 1000;
function isApprovalExpired(createdAt: string): boolean {
  const created = Date.parse(createdAt);
  return !Number.isFinite(created) || Date.now() - created > APPROVAL_TTL_MS;
}

export class SecurityStore {
  private readonly db: DatabaseSync;

  constructor(filename = path.resolve(process.cwd(), 'data', 'jerry-security.sqlite')) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    try { fs.chmodSync(filename, 0o600); } catch { /* platform dependent */ }
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        summary TEXT NOT NULL,
        amount_usd REAL,
        scope_json TEXT,
        scope_hash TEXT,
        status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
        created_at TEXT NOT NULL,
        decided_at TEXT,
        owner_uid TEXT,
        decided_by TEXT
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_uid TEXT,
        event TEXT NOT NULL,
        details TEXT NOT NULL,
        created_at TEXT NOT NULL,
        owner_uid TEXT,
        previous_hash TEXT NOT NULL,
        entry_hash TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS approved_contacts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        purpose TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active','revoked')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        owner_uid TEXT
      );
      CREATE TABLE IF NOT EXISTS idempotency (
        idempotency_key TEXT PRIMARY KEY,
        actor_uid TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        response_json TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS approvals_owner_status_created ON approvals(owner_uid, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS contacts_owner_status_created ON approved_contacts(owner_uid, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS audit_owner_created ON audit_log(owner_uid, created_at DESC);
    `);
    try { this.db.exec('ALTER TABLE approvals ADD COLUMN scope_json TEXT'); } catch { /* already migrated */ }
    try { this.db.exec('ALTER TABLE approvals ADD COLUMN scope_hash TEXT'); } catch { /* already migrated */ }
    try { this.db.exec('ALTER TABLE approvals ADD COLUMN consumed_at TEXT'); } catch { /* already migrated */ }
    try { this.db.exec('ALTER TABLE approvals ADD COLUMN reservation_id TEXT'); } catch { /* already migrated */ }
    try { this.db.exec('ALTER TABLE approvals ADD COLUMN reserved_at TEXT'); } catch { /* already migrated */ }
    try { this.db.exec('ALTER TABLE approvals ADD COLUMN owner_uid TEXT'); } catch { /* already migrated */ }
    try { this.db.exec('ALTER TABLE approved_contacts ADD COLUMN owner_uid TEXT'); } catch { /* already migrated */ }
    try { this.db.exec('ALTER TABLE audit_log ADD COLUMN owner_uid TEXT'); } catch { /* already migrated */ }
  }

  createApproval(input: { action: HighImpactAction; summary: string; amountUsd?: number; scope?: Record<string, unknown>; ownerUid: string }): ApprovalRequest {
    const approval: ApprovalRequest = {
      id: randomBytes(16).toString('hex'),
      action: input.action,
      summary: input.summary.trim().slice(0, 1000),
      amountUsd: input.amountUsd,
      scope: input.scope,
      scopeHash: hashScope(input.scope),
      status: 'pending',
      createdAt: now(),
    };
    this.db.prepare('INSERT INTO approvals(id,action,summary,amount_usd,scope_json,scope_hash,status,created_at,owner_uid) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(approval.id, approval.action, approval.summary, approval.amountUsd ?? null, input.scope ? JSON.stringify(canonicalize(input.scope)) : null, approval.scopeHash ?? null, approval.status, approval.createdAt, input.ownerUid);
    approval.ownerUid = input.ownerUid;
    this.audit(input.ownerUid, 'approval.created', { id: approval.id, action: approval.action, amountUsd: approval.amountUsd });
    return approval;
  }

  decideApproval(id: string, decision: 'approved' | 'rejected', actorUid: string): ApprovalRequest | null {
    const existing = this.getApproval(id, actorUid);
    if (!existing || existing.status !== 'pending' || isApprovalExpired(existing.createdAt)) return null;
    const decidedAt = now();
    this.db.prepare("UPDATE approvals SET status=?, decided_at=?, decided_by=? WHERE id=? AND owner_uid=? AND status='pending'")
      .run(decision, decidedAt, actorUid, id, actorUid);
    this.audit(actorUid, 'approval.decided', { id, decision, actorUid });
    return this.getApproval(id, actorUid);
  }

  reserveApproval(
    id: string,
    action: HighImpactAction,
    actorUid: string,
    reservationId: string,
    expectedScope?: Record<string, unknown>,
  ): ApprovalRequest | null {
    if (!/^[a-f0-9]{64}$/.test(reservationId)) return null;
    const reservedAt = now();
    const expectedHash = hashScope(expectedScope);
    const cutoff = new Date(Date.now() - APPROVAL_TTL_MS).toISOString();
    const leaseCutoff = new Date(Date.now() - APPROVAL_TTL_MS).toISOString();
    const result = this.db.prepare(
      "UPDATE approvals SET reservation_id=?, reserved_at=? WHERE id=? AND owner_uid=? AND action=? AND status='approved' AND consumed_at IS NULL AND created_at>=? AND (? IS NULL OR scope_hash=?) AND (reservation_id IS NULL OR reserved_at IS NULL OR reserved_at<? OR reservation_id=?)"
    ).run(reservationId, reservedAt, id, actorUid, action, cutoff, expectedHash ?? null, expectedHash ?? null, leaseCutoff, reservationId);
    if (Number(result.changes ?? 0) !== 1) return null;
    const reserved = this.getApproval(id, actorUid);
    if (reserved) this.audit(actorUid, 'approval.reserved', { id, action, reservationId, reservedAt });
    return reserved;
  }

  finalizeApprovalReservation(id: string, actorUid: string, reservationId: string): ApprovalRequest | null {
    const consumedAt = now();
    const result = this.db.prepare(
      "UPDATE approvals SET consumed_at=?, reservation_id=NULL, reserved_at=NULL WHERE id=? AND owner_uid=? AND status='approved' AND consumed_at IS NULL AND reservation_id=?"
    ).run(consumedAt, id, actorUid, reservationId);
    if (Number(result.changes ?? 0) !== 1) {
      const existing = this.getApproval(id, actorUid);
      return existing?.consumedAt ? existing : null;
    }
    this.audit(actorUid, 'approval.consumed', { id, action: 'bitcoin_transfer', consumedAt, reservationId });
    return this.getApproval(id, actorUid);
  }

  releaseApprovalReservation(id: string, actorUid: string, reservationId: string): boolean {
    const result = this.db.prepare(
      "UPDATE approvals SET reservation_id=NULL, reserved_at=NULL WHERE id=? AND owner_uid=? AND consumed_at IS NULL AND reservation_id=?"
    ).run(id, actorUid, reservationId);
    if (Number(result.changes ?? 0) === 1) this.audit(actorUid, 'approval.reservation_released', { id, reservationId });
    return Number(result.changes ?? 0) === 1;
  }

  consumeApproval(id: string, action: HighImpactAction, actorUid: string, expectedScope?: Record<string, unknown>): ApprovalRequest | null {
    const consumedAt = now();
    const expectedHash = hashScope(expectedScope);
    const cutoff = new Date(Date.now() - APPROVAL_TTL_MS).toISOString();
    const result = this.db.prepare(
      "UPDATE approvals SET consumed_at=? WHERE id=? AND owner_uid=? AND action=? AND status='approved' AND consumed_at IS NULL AND reservation_id IS NULL AND created_at>=? AND (? IS NULL OR scope_hash=?)"
    ).run(consumedAt, id, actorUid, action, cutoff, expectedHash ?? null, expectedHash ?? null);
    if (Number(result.changes ?? 0) !== 1) return null;
    const consumed = this.getApproval(id, actorUid);
    if (!consumed) return null;
    this.audit(actorUid, 'approval.consumed', { id, action, consumedAt });
    return consumed;
  }

  getApproval(id: string, ownerUid: string): ApprovalRequest | null {
    const row = this.db.prepare('SELECT id,action,summary,amount_usd AS amountUsd,scope_json AS scopeJson,scope_hash AS scopeHash,status,created_at AS createdAt,decided_at AS decidedAt,decided_by AS decidedBy,consumed_at AS consumedAt,owner_uid AS ownerUid FROM approvals WHERE id=? AND owner_uid=?')
      .get(id, ownerUid) as { id: string; action: HighImpactAction; summary: string; amountUsd?: number; scopeJson?: string; scopeHash?: string; status: 'pending' | 'approved' | 'rejected'; createdAt: string; decidedAt?: string; decidedBy?: string; consumedAt?: string; ownerUid?: string } | undefined;
    if (!row) return null;
    return { ...row, scope: row.scopeJson ? JSON.parse(row.scopeJson) : undefined, scopeHash: row.scopeHash } as ApprovalRequest;
  }

  listApprovals(ownerUid: string, status?: ApprovalRequest['status']): ApprovalRequest[] {
    const query = status
      ? 'SELECT id,action,summary,amount_usd AS amountUsd,scope_json AS scopeJson,scope_hash AS scopeHash,status,created_at AS createdAt,decided_at AS decidedAt,decided_by AS decidedBy,consumed_at AS consumedAt,owner_uid AS ownerUid FROM approvals WHERE owner_uid=? AND status=? ORDER BY created_at DESC'
      : 'SELECT id,action,summary,amount_usd AS amountUsd,scope_json AS scopeJson,scope_hash AS scopeHash,status,created_at AS createdAt,decided_at AS decidedAt,decided_by AS decidedBy,consumed_at AS consumedAt,owner_uid AS ownerUid FROM approvals WHERE owner_uid=? ORDER BY created_at DESC';
    const rows = (status ? this.db.prepare(query).all(ownerUid, status) : this.db.prepare(query).all(ownerUid)) as Array<any>;
    return rows.map((row) => ({ ...row, scope: row.scopeJson ? JSON.parse(row.scopeJson) : undefined, scopeHash: row.scopeHash })) as ApprovalRequest[];
  }

  audit(actorUid: string | undefined, event: string, details: unknown): void {
    const ownerUid = actorUid ?? 'system';
    const previous = this.db.prepare('SELECT entry_hash FROM audit_log WHERE owner_uid=? ORDER BY seq DESC LIMIT 1').get(ownerUid) as { entry_hash: string } | undefined;
    const previousHash = previous?.entry_hash ?? 'GENESIS';
    const createdAt = now();
    const json = JSON.stringify(details ?? {});
    const entryHash = sha256(`${previousHash}\n${createdAt}\n${actorUid ?? 'system'}\n${event}\n${json}`);
    this.db.prepare('INSERT INTO audit_log(actor_uid,event,details,created_at,owner_uid,previous_hash,entry_hash) VALUES(?,?,?,?,?,?,?)')
      .run(actorUid ?? null, event, json, createdAt, ownerUid, previousHash, entryHash);
  }

  verifyAuditChain(ownerUid: string): { ok: boolean; entries: number; error?: string } {
    const rows = this.db.prepare('SELECT actor_uid,event,details,created_at,previous_hash,entry_hash FROM audit_log WHERE owner_uid=? ORDER BY seq').all(ownerUid) as Array<{actor_uid:string|null;event:string;details:string;created_at:string;previous_hash:string;entry_hash:string}>;
    let previous = 'GENESIS';
    for (const row of rows) {
      const expected = sha256(`${previous}\n${row.created_at}\n${row.actor_uid ?? 'system'}\n${row.event}\n${row.details}`);
      if (row.previous_hash !== previous || row.entry_hash !== expected) return { ok: false, entries: rows.length, error: `Audit chain mismatch at event ${row.event}` };
      previous = row.entry_hash;
    }
    return { ok: true, entries: rows.length };
  }

  getIdempotent(actorUid: string, key: string, requestHash: string): { statusCode: number; response: unknown } | { conflict: true } | null {
    const row = this.db.prepare('SELECT request_hash,response_json,status_code FROM idempotency WHERE idempotency_key=? AND actor_uid=?')
      .get(key, actorUid) as { request_hash:string; response_json:string; status_code:number } | undefined;
    if (!row) return null;
    if (row.request_hash !== requestHash) return { conflict: true };
    return { statusCode: row.status_code, response: JSON.parse(row.response_json) };
  }

  saveIdempotent(actorUid: string, key: string, requestHash: string, statusCode: number, response: unknown): void {
    this.db.prepare('INSERT OR REPLACE INTO idempotency(idempotency_key,actor_uid,request_hash,response_json,status_code,created_at) VALUES(?,?,?,?,?,?)')
      .run(key, actorUid, requestHash, JSON.stringify(response), statusCode, now());
  }


  listAudit(limit = 100, ownerUid?: string): AuditEntry[] {
    const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
    const rows = ownerUid
      ? this.db.prepare('SELECT seq,actor_uid AS actorUid,event,details,created_at AS createdAt,previous_hash AS previousHash,entry_hash AS entryHash FROM audit_log WHERE owner_uid=? ORDER BY seq DESC LIMIT ?').all(ownerUid, safeLimit) as Array<any>
      : this.db.prepare('SELECT seq,actor_uid AS actorUid,event,details,created_at AS createdAt,previous_hash AS previousHash,entry_hash AS entryHash FROM audit_log ORDER BY seq DESC LIMIT ?').all(safeLimit) as Array<any>;
    return rows.map((row) => ({ ...row, details: JSON.parse(row.details) }));
  }

  createContact(input: { name: string; email: string; purpose: string; ownerUid: string }): ApprovedContact {
    const contact: ApprovedContact = {
      id: randomBytes(12).toString('hex'),
      name: input.name.trim().slice(0, 120),
      email: input.email.trim().slice(0, 254).toLowerCase(),
      purpose: input.purpose.trim().slice(0, 500),
      status: 'active',
      createdAt: now(),
      updatedAt: now(),
    };
    this.db.prepare('INSERT INTO approved_contacts(id,name,email,purpose,status,created_at,updated_at,owner_uid) VALUES(?,?,?,?,?,?,?,?)').run(contact.id, contact.name, contact.email, contact.purpose, contact.status, contact.createdAt, contact.updatedAt, input.ownerUid);
    this.audit(input.ownerUid, 'approved_contact.created', { id: contact.id, email: contact.email });
    return contact;
  }

  listContacts(ownerUid: string): ApprovedContact[] {
    return this.db.prepare('SELECT id,name,email,purpose,status,created_at AS createdAt,updated_at AS updatedAt,owner_uid AS ownerUid FROM approved_contacts WHERE owner_uid=? ORDER BY created_at DESC').all(ownerUid) as unknown as ApprovedContact[];
  }

  setContactStatus(id: string, status: 'active' | 'revoked', actorUid: string): ApprovedContact | null {
    const existing = this.db.prepare('SELECT id,name,email,purpose,status,created_at AS createdAt,updated_at AS updatedAt FROM approved_contacts WHERE id=? AND owner_uid=?').get(id, actorUid) as ApprovedContact | undefined;
    if (!existing) return null;
    const updatedAt = now();
    this.db.prepare('UPDATE approved_contacts SET status=?,updated_at=? WHERE id=? AND owner_uid=?').run(status, updatedAt, id, actorUid);
    this.audit(actorUid, 'approved_contact.status_changed', { id, status });
    return this.db.prepare('SELECT id,name,email,purpose,status,created_at AS createdAt,updated_at AS updatedAt FROM approved_contacts WHERE id=? AND owner_uid=?').get(id, actorUid) as unknown as ApprovedContact;
  }

  getContact(id: string, ownerUid: string): ApprovedContact | null {
    return (this.db.prepare('SELECT id,name,email,purpose,status,created_at AS createdAt,updated_at AS updatedAt FROM approved_contacts WHERE id=? AND owner_uid=?').get(id, ownerUid) as ApprovedContact | undefined) ?? null;
  }

  exportSnapshot(ownerUid: string) {
    return {
      version: 1,
      approvals: this.db.prepare('SELECT id,action,summary,amount_usd AS amountUsd,scope_json AS scopeJson,scope_hash AS scopeHash,status,created_at AS createdAt,decided_at AS decidedAt,decided_by AS decidedBy,consumed_at AS consumedAt FROM approvals WHERE owner_uid=? ORDER BY created_at').all(ownerUid),
      contacts: this.db.prepare('SELECT id,name,email,purpose,status,created_at AS createdAt,updated_at AS updatedAt FROM approved_contacts WHERE owner_uid=? ORDER BY created_at').all(ownerUid),
      audit: this.db.prepare('SELECT seq,actor_uid AS actorUid,event,details,created_at AS createdAt,previous_hash AS previousHash,entry_hash AS entryHash FROM audit_log WHERE owner_uid=? ORDER BY seq').all(ownerUid),
    };
  }

  validateSnapshot(snapshot: any): void {
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.approvals) || !Array.isArray(snapshot.contacts) || !Array.isArray(snapshot.audit)) throw new Error('Unsupported Jerry security backup.');
    const verify = (rows: any[]) => {
      let previous = 'GENESIS';
      for (const row of rows) {
        const details = typeof row.details === 'string' ? row.details : JSON.stringify(row.details ?? {});
        const expected = sha256(`${previous}\n${row.createdAt}\n${row.actorUid ?? 'system'}\n${row.event}\n${details}`);
        if (row.previousHash !== previous || row.entryHash !== expected) throw new Error(`Security backup audit chain is invalid at event ${row.event}.`);
        previous = row.entryHash;
      }
    };
    verify(snapshot.audit);
  }

  importSnapshot(snapshot: any, actorUid: string): void {
    this.validateSnapshot(snapshot);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM approvals WHERE owner_uid=?').run(actorUid);
      this.db.prepare('DELETE FROM approved_contacts WHERE owner_uid=?').run(actorUid);
      this.db.prepare('DELETE FROM audit_log WHERE owner_uid=?').run(actorUid);
      this.db.prepare('DELETE FROM idempotency WHERE actor_uid=?').run(actorUid);
      const approvalStmt = this.db.prepare('INSERT INTO approvals(id,action,summary,amount_usd,scope_json,scope_hash,status,created_at,decided_at,decided_by,consumed_at,owner_uid) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
      for (const a of snapshot.approvals) approvalStmt.run(a.id,a.action,a.summary,a.amountUsd ?? null,a.scopeJson ?? (a.scope ? JSON.stringify(canonicalize(a.scope)) : null),a.scopeHash ?? hashScope(a.scope),a.status,a.createdAt,a.decidedAt ?? null,a.decidedBy ?? null,a.consumedAt ?? null, actorUid);
      const contactStmt = this.db.prepare('INSERT INTO approved_contacts(id,name,email,purpose,status,created_at,updated_at,owner_uid) VALUES(?,?,?,?,?,?,?,?)');
      for (const c of snapshot.contacts) contactStmt.run(c.id,c.name,c.email,c.purpose,c.status,c.createdAt,c.updatedAt,actorUid);
      const auditStmt = this.db.prepare('INSERT INTO audit_log(actor_uid,event,details,created_at,owner_uid,previous_hash,entry_hash) VALUES(?,?,?,?,?,?,?)');
      for (const a of snapshot.audit) auditStmt.run(a.actorUid ?? null,a.event,typeof a.details === 'string' ? a.details : JSON.stringify(a.details ?? {}),a.createdAt,actorUid,a.previousHash,a.entryHash);
      this.db.prepare("INSERT INTO sqlite_sequence(name,seq) SELECT 'audit_log',COALESCE(MAX(seq),0) WHERE EXISTS (SELECT 1 FROM sqlite_sequence WHERE name='audit_log')").run();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.audit(actorUid, 'security.backup.restored', { approvalCount: snapshot.approvals.length, contactCount: snapshot.contacts.length });
  }

  close(): void { this.db.close(); }
}
