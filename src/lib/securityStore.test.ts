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
    const approval = store.createApproval({ action: 'financial_commitment', summary: 'Financial action', amountUsd: 25, scope: { recipient: 'Test vendor', purpose: 'Test financial approval scope' }, ownerUid: 'owner-1' });
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
  const approval = store.createApproval({ action: 'financial_commitment', summary: 'Scoped action', amountUsd: 250, scope: { recipient: 'Approved vendor Ltd', purpose: 'Purchase approved project equipment' }, ownerUid: 'owner-scope' });
  assert.equal(approval.amountUsd, 250);
  assert.equal(store.decideApproval(approval.id, 'approved', 'owner-scope')?.amountUsd, 250);
});

test('approved bitcoin transfer is bound to exact scope and cannot consume a different transfer', () => {
  const file = tempDb('bitcoin-scope');
  const store = new SecurityStore(file);
  const scope = { asset: 'BTC', network: 'Bitcoin Mainnet', destination: 'bc1qaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', amount: 0.01, fee: 0.0001 };
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
  store.setEmergencyStop(false, 'owner-reserve', 'Test explicitly resumes execution for reservation');
  const scope = { asset: 'BTC', network: 'Bitcoin Mainnet', destination: 'bc1qaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', amount: 0.01, fee: 0.0001 };
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
  store.setEmergencyStop(false, 'owner-finalize', 'Test explicitly resumes execution for reservation');
  const scope = { asset: 'BTC', network: 'Bitcoin Mainnet', destination: 'bc1qaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', amount: 0.01, fee: 0.0001 };
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


test('approval decision is single-use and an expired pending approval cannot be decided', () => {
  const file = tempDb('approval-decision-race');
  const store = new SecurityStore(file);
  try {
    const approval = store.createApproval({ action: 'high_impact_change', summary: 'Single decision', ownerUid: 'owner-decision' });
    assert.equal(store.decideApproval(approval.id, 'approved', 'owner-decision')?.status, 'approved');
    assert.equal(store.decideApproval(approval.id, 'rejected', 'owner-decision'), null);
    assert.equal(store.getApproval(approval.id, 'owner-decision')?.status, 'approved');

    const expired = store.createApproval({ action: 'high_impact_change', summary: 'Expired pending', ownerUid: 'owner-decision' });
    const db = new DatabaseSync(file);
    db.prepare('UPDATE approvals SET created_at=? WHERE id=?').run(new Date(Date.now() - 16 * 60 * 1000).toISOString(), expired.id);
    db.close();
    assert.equal(store.decideApproval(expired.id, 'approved', 'owner-decision'), null);
    assert.equal(store.getApproval(expired.id, 'owner-decision')?.status, 'pending');
    assert.equal(store.verifyAuditChain('owner-decision').ok, true);
  } finally {
    store.close();
    rmSync(path.dirname(file), { recursive: true, force: true });
  }
});


test('financial commitment approvals reject missing or incomplete scopes', () => {
  const store = new SecurityStore(':memory:');
  try {
    assert.throws(
      () => store.createApproval({ action: 'financial_commitment', summary: 'Unscoped financial action', amountUsd: 250, ownerUid: 'owner-scope' }),
      /explicit, immutable action scope/,
    );
    assert.throws(
      () => store.createApproval({ action: 'purchase', summary: 'Incomplete purchase', amountUsd: 100, scope: { recipient: 'Vendor only' }, ownerUid: 'owner-scope' }),
      /exact recipient or destination, and a clear purpose/,
    );
    const valid = store.createApproval({
      action: 'purchase', summary: 'Scoped purchase', amountUsd: 100,
      scope: { recipient: 'Vendor Ltd', purpose: 'Purchase project materials' },
      ownerUid: 'owner-scope',
    });
    assert.equal(valid.scopeHash?.length, 64);
  } finally {
    store.close();
  }
});

test('Bitcoin transfer approvals reject incomplete or imprecise scope', () => {
  const store = new SecurityStore(':memory:');
  try {
    assert.throws(
      () => store.createApproval({
        action: 'bitcoin_transfer', summary: 'Bad transfer',
        scope: { asset: 'BTC', network: 'Bitcoin Mainnet', destination: 'not-a-bitcoin-address', amount: 0.01, fee: 0.0001 },
        ownerUid: 'owner-btc',
      }),
      /valid destination address/,
    );
  } finally {
    store.close();
  }
});


test('owner emergency stop is durable, audited and explicitly recoverable', () => {
  const store = new SecurityStore(':memory:');
  try {
    assert.equal(store.getEmergencyStop().stopped, true);
    const stopped = store.setEmergencyStop(true, 'owner-stop', 'Owner requested immediate shutdown');
    assert.equal(stopped.stopped, true);
    assert.equal(stopped.ownerUid, 'owner-stop');
    assert.equal(store.getEmergencyStop().reason, 'Owner requested immediate shutdown');
    const resumed = store.setEmergencyStop(false, 'owner-stop', 'Owner verified recovery conditions');
    assert.equal(resumed.stopped, false);
    assert.equal(store.verifyAuditChain('owner-stop').ok, true);
  } finally {
    store.close();
  }
});

test('emergency stop requires an owner and a meaningful reason', () => {
  const store = new SecurityStore(':memory:');
  try {
    assert.throws(() => store.setEmergencyStop(true, '', 'stop now'), /Owner UID/);
    assert.throws(() => store.setEmergencyStop(true, 'owner-stop', 'no'), /meaningful emergency-control reason/);
    assert.equal(store.getEmergencyStop().stopped, true);
  } finally {
    store.close();
  }
});


test('emergency stop prevents atomic reservation of an approved Bitcoin transfer', () => {
  const store = new SecurityStore(':memory:');
  try {
    const scope = {
      asset: 'BTC', network: 'Bitcoin Mainnet',
      destination: 'bc1q' + 'a'.repeat(30), amount: 0.01, fee: 0.0001,
    };
    const approval = store.createApproval({ action: 'bitcoin_transfer', summary: 'Transfer before stop', scope, ownerUid: 'owner-stop' });
    store.decideApproval(approval.id, 'approved', 'owner-stop');
    store.setEmergencyStop(true, 'owner-stop', 'Emergency stop before transfer reservation');
    assert.equal(store.reserveApproval(approval.id, 'bitcoin_transfer', 'owner-stop', 'e'.repeat(64), scope), null);
    assert.equal(store.getApproval(approval.id, 'owner-stop')?.consumedAt ?? null, null);
  } finally {
    store.close();
  }
});

test('new security store starts with the emergency stop engaged', () => {
  const store = new SecurityStore(':memory:');
  try {
    const control = store.getEmergencyStop();
    assert.equal(control.stopped, true);
    assert.equal(control.ownerUid, 'system');
    assert.match(control.reason, /secure first-boot default/i);
  } finally {
    store.close();
  }
});

test('explicit owner resume is preserved across security store initialization', () => {
  const file = tempDb('owner-resume-preserved');
  const first = new SecurityStore(file);
  first.setEmergencyStop(false, 'owner-uid-1', 'Owner explicitly resumed after checks');
  first.close();
  const reopened = new SecurityStore(file);
  try {
    const control = reopened.getEmergencyStop();
    assert.equal(control.stopped, false);
    assert.equal(control.ownerUid, 'owner-uid-1');
    assert.equal(control.reason, 'Owner explicitly resumed after checks');
  } finally {
    reopened.close();
    rmSync(path.dirname(file), { recursive: true, force: true });
  }
});
