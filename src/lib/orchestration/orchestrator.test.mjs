import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertTransition, assertTransitionGuards, assertDependencyGraphAcyclic,
  evaluateDependencies, assertAuthorizationAndApproval, IdempotencyLedger,
  decideRecovery, classifyVerification, OrchestratorError
} from './orchestrator.ts';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = (n) => ({ kind: 'agent', id: id(n) });
function task(overrides = {}) {
  return {
    id: id(1), entityType: 'task', schemaVersion: 1,
    createdAt: '2026-11-13T00:00:00Z', createdBy: actor(1), updatedAt: '2026-11-13T00:00:00Z', updatedBy: actor(1),
    version: 1, tenantId: id(90), businessId: null, correlationId: id(91), causationId: null, archivedAt: null, metadata: {},
    goalId: null, milestoneId: null, parentTaskId: null, title: 'test', description: 'test', kind: 'research', status: 'planned', priority: 3,
    assignedEngineId: id(2), assignedAgentId: id(3), dependencyTaskIds: [], idempotencyKey: 'k1', attemptCount: 0, maxAttempts: 3,
    nextAttemptAt: null, startedAt: null, completedAt: null, checkpointRef: null, resultSummary: null, acceptanceCriteria: [],
    authorizationId: null, verificationId: null, resourceBudget: { maxUsdMinor: null, maxDurationSeconds: 300, maxAttempts: 3, allowedScopes: [] }, failure: null,
    ...overrides
  };
}
function verification(overrides = {}) {
  return { id: id(8), entityType: 'verification', schemaVersion: 1, createdAt: '2026-11-13T00:00:00Z', createdBy: actor(8), updatedAt: '2026-11-13T00:00:00Z', updatedBy: actor(8), version: 1, tenantId: id(90), businessId: null, correlationId: id(91), causationId: null, archivedAt: null, metadata: {}, subjectType: 'task', subjectId: id(1), verifier: actor(8), verifierIndependence: 'independent', method: 'automated_test', status: 'passed', criteriaResults: [{ criterionKey: 'done', passed: true, evidenceIds: [id(9)], notes: '' }], evidenceIds: [id(9)], verifiedAt: '2026-11-13T00:01:00Z', expiresAt: null, verifierNotes: '', ...overrides };
}
function expectCode(fn, code) { assert.throws(fn, e => e instanceof OrchestratorError && e.code === code); }

test('allows only declared lifecycle transitions', () => {
  assertTransition('discovered', 'evaluated');
  expectCode(() => assertTransition('planned', 'executing'), 'INVALID_STATE_TRANSITION');
  expectCode(() => assertTransition('completed', 'queued'), 'INVALID_STATE_TRANSITION');
});

test('requires authorization before queue and execution', () => {
  expectCode(() => assertTransitionGuards(task({ status: 'authorized' }), 'queued', { actorId: id(4), dependenciesSatisfied: true }), 'AUTHORIZATION_REQUIRED');
  assertTransitionGuards(task({ status: 'authorized' }), 'queued', { actorId: id(4), authorizationValid: true, dependenciesSatisfied: true });
});

test('requires dependency satisfaction before queue and final dispatch', () => {
  expectCode(() => assertTransitionGuards(task({ status: 'authorized' }), 'queued', { actorId: id(4), authorizationValid: true }), 'DEPENDENCIES_UNSATISFIED');
  expectCode(() => assertTransitionGuards(task({ status: 'queued' }), 'executing', { actorId: id(4), authorizationValid: true }), 'DEPENDENCIES_UNSATISFIED');
  assertTransitionGuards(task({ status: 'queued' }), 'executing', { actorId: id(4), authorizationValid: true, dependenciesSatisfied: true });
});

test('requires explicit owner approval when policy demands it', () => {
  expectCode(() => assertTransitionGuards(task(), 'authorized', { actorId: id(4), authorizationValid: true, ownerApprovalRequired: true, approvalValid: false }), 'APPROVAL_REQUIRED');
  expectCode(() => assertTransitionGuards(task(), 'authorized', { actorId: id(4), authorizationValid: true, ownerApprovalRequired: true }), 'APPROVAL_REQUIRED');
  assertTransitionGuards(task(), 'authorized', { actorId: id(4), authorizationValid: true, ownerApprovalRequired: true, approvalValid: true });
});

test('requires evidence before verification handoff', () => {
  expectCode(() => assertTransitionGuards(task({ status: 'executing' }), 'verifying', { actorId: id(4) }), 'EVIDENCE_REQUIRED');
  assertTransitionGuards(task({ status: 'executing' }), 'verifying', { actorId: id(4), evidencePresent: true });
});

test('requires independent passed verification before verified state', () => {
  const t = task({ status: 'verifying' });
  assertTransitionGuards(t, 'verified', { actorId: id(8), verification: verification() });
  expectCode(() => assertTransitionGuards(t, 'verified', { actorId: id(8), verification: verification({ status: 'inconclusive' }) }), 'VERIFICATION_NOT_PASSED');
  expectCode(() => assertTransitionGuards(t, 'verified', { actorId: id(3), verification: verification({ verifier: actor(3) }) }), 'VERIFIER_NOT_INDEPENDENT');
});

test('completion can only follow verified', () => {
  expectCode(() => assertTransitionGuards(task({ status: 'executing' }), 'completed', { actorId: id(4) }), 'INVALID_STATE_TRANSITION');
  assertTransitionGuards(task({ status: 'verified' }), 'completed', { actorId: id(4) });
});

test('detects circular and missing dependencies', () => {
  expectCode(() => assertDependencyGraphAcyclic([id(1), id(2)], [{ taskId: id(1), dependsOnTaskId: id(2), type: 'finish_to_start' }, { taskId: id(2), dependsOnTaskId: id(1), type: 'finish_to_start' }]), 'DEPENDENCY_CYCLE');
  expectCode(() => assertDependencyGraphAcyclic([id(1)], [{ taskId: id(1), dependsOnTaskId: id(2), type: 'finish_to_start' }]), 'DEPENDENCY_NOT_FOUND');
});

test('evaluates finish-to-start dependency and legacy dependency IDs', () => {
  const t = task({ dependencyTaskIds: [id(2)] });
  const prerequisite = task({ id: id(2), status: 'completed', verificationId: id(7) });
  assert.equal(evaluateDependencies(t, [], new Map([[id(2), prerequisite]])).satisfied, true);
  assert.equal(evaluateDependencies(t, [], new Map([[id(2), { ...prerequisite, status: 'executing' }]])).satisfied, false);
});

test('authorization must match actor, action, resource, digest and limits', () => {
  const auth = { status: 'active', validFrom: '2026-11-12T00:00:00Z', expiresAt: '2026-11-14T00:00:00Z', revokedAt: null, subjectActor: actor(3), action: 'financial.purchase', resourceId: id(6), payloadDigest: 'a'.repeat(64), maxUses: 1, usesConsumed: 0, maxUsdMinor: 5000, grantedByOwnerId: id(5) };
  const approval = { status: 'approved', action: 'financial.purchase', payloadDigest: 'a'.repeat(64), expiresAt: '2026-11-14T00:00:00Z', approverOwnerId: id(5) };
  assertAuthorizationAndApproval(auth, approval, { actorId: id(3), action: 'financial.purchase', resourceId: id(6), payloadDigest: 'a'.repeat(64), amountUsdMinor: 4000, ownerApprovalRequired: true, now: new Date('2026-11-13T00:00:00Z') });
  expectCode(() => assertAuthorizationAndApproval({ ...auth, revokedAt: '2026-11-12T01:00:00Z' }, approval, { actorId: id(3), action: 'financial.purchase', resourceId: id(6), payloadDigest: 'a'.repeat(64), ownerApprovalRequired: true, now: new Date('2026-11-13T00:00:00Z') }), 'AUTHORIZATION_INACTIVE');
  expectCode(() => assertAuthorizationAndApproval(auth, null, { actorId: id(3), action: 'financial.purchase', resourceId: id(6), payloadDigest: 'a'.repeat(64), ownerApprovalRequired: true, now: new Date('2026-11-13T00:00:00Z') }), 'OWNER_APPROVAL_MISSING');
  expectCode(() => assertAuthorizationAndApproval(auth, approval, { actorId: id(3), action: 'financial.purchase', resourceId: id(6), payloadDigest: 'a'.repeat(64), amountUsdMinor: 5001, ownerApprovalRequired: true, now: new Date('2026-11-13T00:00:00Z') }), 'AUTHORIZATION_LIMIT_EXCEEDED');
});

test('idempotency replays exact requests and rejects conflicting payloads', () => {
  const ledger = new IdempotencyLedger();
  assert.deepEqual(ledger.begin('same-key', 'digest-a'), { replay: false });
  expectCode(() => ledger.begin('same-key', 'digest-b'), 'IDEMPOTENCY_CONFLICT');
  expectCode(() => ledger.begin('same-key', 'digest-a'), 'IDEMPOTENCY_IN_PROGRESS');
  ledger.complete('same-key', 'digest-a', { taskId: id(1) });
  assert.deepEqual(ledger.begin('same-key', 'digest-a'), { replay: true, result: { taskId: id(1) } });
});

test('recovery reconciles unknown external outcomes before retry', () => {
  assert.equal(decideRecovery({ retryable: true, attemptCount: 0, maxAttempts: 3, externalOutcomeUnknown: true, authorizationValid: true, checkpointAvailable: true, ownerApprovalRequired: false, approvalValid: true }), 'RECONCILE_FIRST');
  assert.equal(decideRecovery({ retryable: true, attemptCount: 0, maxAttempts: 3, externalOutcomeUnknown: false, authorizationValid: false, checkpointAvailable: true, ownerApprovalRequired: false, approvalValid: true }), 'WAIT_FOR_APPROVAL');
  assert.equal(decideRecovery({ retryable: true, attemptCount: 1, maxAttempts: 3, externalOutcomeUnknown: false, authorizationValid: true, checkpointAvailable: true, ownerApprovalRequired: false, approvalValid: true }), 'RESTORE_CHECKPOINT');
  assert.equal(decideRecovery({ retryable: false, attemptCount: 1, maxAttempts: 3, externalOutcomeUnknown: false, authorizationValid: true, checkpointAvailable: false, ownerApprovalRequired: false, approvalValid: true }), 'STOP');
});

test('verification classification distinguishes pass, fail and incomplete', () => {
  assert.equal(classifyVerification(verification()), 'PASS');
  assert.equal(classifyVerification(verification({ status: 'failed' })), 'FAIL');
  assert.equal(classifyVerification(verification({ status: 'inconclusive', evidenceIds: [] })), 'INCOMPLETE');
});
