import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPool } from './index.ts';
import {
  createSharedApproval, decideSharedApproval, reserveSharedApproval,
  finalizeSharedApprovalReservation, getSharedApproval,
} from './approvalStore.ts';

test('shared PostgreSQL approval reservation is single-winner across independent requests', {
  skip: process.env.JERRY_JOURNAL_TEST_DATABASE !== '1'
    ? 'Set JERRY_JOURNAL_TEST_DATABASE=1 for a disposable PostgreSQL database.'
    : false,
}, async () => {
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(process.env.SQL_HOST && process.env.SQL_USER && /test|tenant/i.test(process.env.SQL_DB_NAME ?? ''),
    'Approval integration requires a disposable PostgreSQL database name containing test/tenant.');
  const pool = createPool();
  const ownerUid = `approval-race-${randomUUID()}`;
  const idA = randomUUID();
  const idB = randomUUID();
  let approvalId = '';
  const initialControl = await pool.query('SELECT stopped FROM jerry_execution_control WHERE id=1');
  if (typeof initialControl.rows[0]?.stopped !== 'boolean') throw new Error('Shared execution control fixture is missing.');
  const originalStopped = initialControl.rows[0].stopped as boolean;
  try {
    await pool.query(
      "UPDATE jerry_execution_control SET stopped=false,epoch=epoch+1,reason='approval test fixture enabled',updated_by='test-fixture',updated_at=now() WHERE id=1");
    const approval = await createSharedApproval({
      action: 'high_impact_change', summary: 'Cross-instance single-use reservation test', ownerUid,
    });
    approvalId = approval.id;
    assert.equal((await decideSharedApproval(approval.id, 'approved', ownerUid))?.status, 'approved');

    const winners = await Promise.all([
      reserveSharedApproval(approval.id, 'high_impact_change', ownerUid, idA),
      reserveSharedApproval(approval.id, 'high_impact_change', ownerUid, idB),
    ]);
    const winningReservations = winners.filter(Boolean);
    assert.equal(winningReservations.length, 1, 'Only one distinct reservation ID may claim an approval.');
    const winningId = winningReservations[0]!.reservationId!;
    const losingId = winningId === idA ? idB : idA;
    assert.equal(await reserveSharedApproval(approval.id, 'high_impact_change', ownerUid, losingId), null,
      'A competing instance must not steal an active reservation.');

    assert.ok(await reserveSharedApproval(approval.id, 'high_impact_change', ownerUid, winningId),
      'The exact same reservation ID must be recoverable after a crash.');
    const finalized = await finalizeSharedApprovalReservation(approval.id, ownerUid, winningId);
    assert.ok(finalized?.consumedAt);
    assert.equal(await reserveSharedApproval(approval.id, 'high_impact_change', ownerUid, winningId), null,
      'A consumed approval must never be reserved again.');
    assert.ok((await getSharedApproval(approval.id, ownerUid))?.consumedAt);
  } finally {
    if (approvalId) {
      await pool.query('DELETE FROM jerry_security_approval_audit WHERE owner_uid=$1', [ownerUid]);
      await pool.query('DELETE FROM jerry_security_approvals WHERE owner_uid=$1', [ownerUid]);
    }
    await pool.query(
      "UPDATE jerry_execution_control SET stopped=$1,epoch=epoch+1,reason='approval test fixture cleanup',updated_by='test-fixture',updated_at=now() WHERE id=1", [originalStopped]);
  }
});
