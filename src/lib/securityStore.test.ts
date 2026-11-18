import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { SecurityStore } from './securityStore.ts';


function tempDb(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `jerry-security-${name}-`));
  return path.join(dir, 'security.sqlite');
}

test('approved high-impact action can be consumed exactly once', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'jerry-security-'));
  const store = new SecurityStore(path.join(dir, 'security.sqlite'));
  try {
    const approval = store.createApproval({ action: 'high_impact_change', summary: 'Test protected action', ownerUid: 'owner-1' });
    assert.equal(store.decideApproval(approval.id, 'approved', 'owner-1')?.status, 'approved');
    assert.equal(store.consumeApproval(approval.id, 'high_impact_change', 'owner-1')?.status, 'approved');
    assert.equal(store.consumeApproval(approval.id, 'high_impact_change', 'owner-1'), null);
    assert.equal(store.verifyAuditChain('owner-1').ok, true);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('wrong action cannot consume an approval', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'jerry-security-'));
  const store = new SecurityStore(path.join(dir, 'security.sqlite'));
  try {
    const approval = store.createApproval({ action: 'financial_commitment', summary: 'Financial action', ownerUid: 'owner-1' });
    store.decideApproval(approval.id, 'approved', 'owner-1');
    assert.equal(store.consumeApproval(approval.id, 'high_impact_change', 'owner-1'), null);
    assert.equal(store.consumeApproval(approval.id, 'financial_commitment', 'owner-1')?.id, approval.id);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('security records are isolated by Firebase owner UID', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'jerry-security-'));
  const store = new SecurityStore(path.join(dir, 'security.sqlite'));
  try {
    const a = store.createApproval({ action: 'high_impact_change', summary: 'Owner A action', ownerUid: 'owner-a' });
    const b = store.createApproval({ action: 'high_impact_change', summary: 'Owner B action', ownerUid: 'owner-b' });
    assert.equal(store.listApprovals('owner-a').map(x => x.id).includes(a.id), true);
    assert.equal(store.listApprovals('owner-a').map(x => x.id).includes(b.id), false);
    assert.equal(store.getApproval(b.id, 'owner-a'), null);
    assert.equal(store.decideApproval(b.id, 'approved', 'owner-a'), null);
    assert.equal(store.consumeApproval(b.id, 'high_impact_change', 'owner-a'), null);

    const contact = store.createContact({ name: 'Owner B', email: 'b@example.com', purpose: 'Test', ownerUid: 'owner-b' });
    assert.equal(store.getContact(contact.id, 'owner-a'), null);
    assert.equal(store.listContacts('owner-a').length, 0);
    assert.equal(store.listContacts('owner-b').length, 1);
    assert.equal(store.verifyAuditChain('owner-a').ok, true);
    assert.equal(store.verifyAuditChain('owner-b').ok, true);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('financial commitment approval stores an explicit USD limit', () => {
  const store = new SecurityStore(':memory:');
  const approval = store.createApproval({ action: 'financial_commitment', summary: 'Scoped action', amountUsd: 250, ownerUid: 'owner-scope' });
  assert.equal(approval.amountUsd, 250);
  assert.equal(store.decideApproval(approval.id, 'approved', 'owner-scope')?.amountUsd, 250);
});

test('approved bitcoin transfer is bound to exact scope and cannot consume a different transfer', () => {
  const file = tempDb('bitcoin-scope');
  const store = new SecurityStore(file);
  const scope = { asset: 'BTC', network: 'Bitcoin Mainnet', destination: 'bc1qexample', amount: 0.01, fee: 0.0001 };
  const approval = store.createApproval({ action: 'bitcoin_transfer', summary: 'Send exact BTC transfer', scope, ownerUid: 'owner-scope' });
  store.decideApproval(approval.id, 'approved', 'owner-scope');
  assert.equal(store.consumeApproval(approval.id, 'bitcoin_transfer', 'owner-scope', { ...scope, amount: 0.02 }), null);
  assert.ok(store.consumeApproval(approval.id, 'bitcoin_transfer', 'owner-scope', scope));
  store.close();
});

test('expired approval is not consumed or burned', () => {
  const file = tempDb('approval-expiry');
  const store = new SecurityStore(file);
  const approval = store.createApproval({ action: 'high_impact_change', summary: 'Expiring action', ownerUid: 'owner-expiry' });
  store.decideApproval(approval.id, 'approved', 'owner-expiry');
  const db = new DatabaseSync(file);
  db.prepare('UPDATE approvals SET created_at=? WHERE id=?').run(new Date(Date.now() - 16 * 60 * 1000).toISOString(), approval.id);
  db.close();
  assert.equal(store.consumeApproval(approval.id, 'high_impact_change', 'owner-expiry'), null);
  assert.equal(store.getApproval(approval.id, 'owner-expiry')?.consumedAt ?? null, null);
  store.close();
});


test('Bitcoin transfer approval reservation survives PostgreSQL failure safely and can be released', () => {
  const store = new SecurityStore(':memory:');
  const scope = { asset: 'BTC', network: 'Bitcoin Mainnet', destination: 'bc1qexample', amount: 0.01, fee: 0.0001 };
  const approval = store.createApproval({ action: 'bitcoin_transfer', summary: 'Reserve then release', scope, ownerUid: 'owner-reserve' });
  store.decideApproval(approval.id, 'approved', 'owner-reserve');
  const reservationId = 'a'.repeat(64);
  assert.ok(store.reserveApproval(approval.id, 'bitcoin_transfer', 'owner-reserve', reservationId, scope));
  assert.equal(store.consumeApproval(approval.id, 'bitcoin_transfer', 'owner-reserve', scope), null);
  assert.equal(store.reserveApproval(approval.id, 'bitcoin_transfer', 'owner-reserve', 'b'.repeat(64), scope), null);
  assert.equal(store.releaseApprovalReservation(approval.id, 'owner-reserve', reservationId), true);
  assert.ok(store.reserveApproval(approval.id, 'bitcoin_transfer', 'owner-reserve', 'b'.repeat(64), scope));
  store.close();
});

test('Bitcoin transfer approval is consumed only when its reservation is finalized', () => {
  const store = new SecurityStore(':memory:');
  const scope = { asset: 'BTC', network: 'Bitcoin Mainnet', destination: 'bc1qexample', amount: 0.01, fee: 0.0001 };
  const approval = store.createApproval({ action: 'bitcoin_transfer', summary: 'Reserve then finalize', scope, ownerUid: 'owner-finalize' });
  store.decideApproval(approval.id, 'approved', 'owner-finalize');
  const reservationId = 'c'.repeat(64);
  assert.ok(store.reserveApproval(approval.id, 'bitcoin_transfer', 'owner-finalize', reservationId, scope));
  const finalized = store.finalizeApprovalReservation(approval.id, 'owner-finalize', reservationId);
  assert.ok(finalized?.consumedAt);
  assert.equal(store.reserveApproval(approval.id, 'bitcoin_transfer', 'owner-finalize', 'd'.repeat(64), scope), null);
  assert.ok(store.verifyAuditChain('owner-finalize').ok);
  store.close();
});
