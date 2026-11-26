import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeAutonomousTaskApproval } from './taskApproval.ts';
import type { ApprovalRequest } from './types.ts';

const approval = (overrides: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
  id: 'approval-1',
  kind: 'autonomous_task',
  subjectId: 'task-1',
  title: 'Authorize task',
  reason: 'Owner approved this task',
  requestedAt: '2026-11-26T10:00:00.000Z',
  decision: 'approved',
  ...overrides,
});

test('consumes a matching approved task authorization exactly once', () => {
  const result = consumeAutonomousTaskApproval([approval()], 'task-1', 'approval-1', '2026-11-26T11:00:00.000Z');
  assert.ok(result);
  assert.equal(result[0].consumedAt, '2026-11-26T11:00:00.000Z');
  assert.equal(consumeAutonomousTaskApproval(result, 'task-1', 'approval-1'), null);
});

test('does not consume a rejected, pending, already consumed, or mismatched approval', () => {
  assert.equal(consumeAutonomousTaskApproval([approval({ decision: 'pending' })], 'task-1', 'approval-1'), null);
  assert.equal(consumeAutonomousTaskApproval([approval({ decision: 'rejected' })], 'task-1', 'approval-1'), null);
  assert.equal(consumeAutonomousTaskApproval([approval({ consumedAt: '2026-11-26T10:30:00.000Z' })], 'task-1', 'approval-1'), null);
  assert.equal(consumeAutonomousTaskApproval([approval()], 'task-2', 'approval-1'), null);
  assert.equal(consumeAutonomousTaskApproval([approval()], 'task-1', 'approval-2'), null);
  assert.equal(consumeAutonomousTaskApproval([approval({ kind: 'settlement' })], 'task-1', 'approval-1'), null);
});
