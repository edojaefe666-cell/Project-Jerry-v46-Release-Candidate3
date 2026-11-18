import test from 'node:test';
import assert from 'node:assert/strict';
import { approveGoal, cancelGoal, decomposeGoal, interruptGoal, recoverGoal, transitionTask } from './goalExecutionControlPlane.ts';

const sample = (projectType: 'new' | 'existing' | 'general' = 'new') => decomposeGoal({
  title: 'Build a customer portal',
  description: 'Create a secure customer portal with accounts, dashboards and support workflows.',
  projectType,
  targetOutcome: 'A tested customer portal ready for owner review',
});
const verifyFirst = (goal: ReturnType<typeof sample>) => {
  let next = transitionTask(goal, goal.tasks[0].id, 'running', { checkpoint: 'Requirements work started' });
  next = transitionTask(next, next.tasks[0].id, 'verification_pending', { result: 'Requirements checklist prepared' });
  return transitionTask(next, next.tasks[0].id, 'verified', { result: 'Requirements checklist reviewed and accepted' });
};

test('goal intake validates required fields and length limits', () => {
  assert.throws(() => decomposeGoal({ title: 'abc', description: 'This description is long enough.' }), /title/);
  assert.throws(() => decomposeGoal({ title: 'Valid goal title', description: 'short' }), /Describe the goal/);
  assert.throws(() => decomposeGoal({ title: 'Valid goal title', description: 'A sufficiently detailed description.', projectType: 'invalid' as never }), /Project type/);
});

test('new projects decompose into ordered tasks with isolated workspace setup', () => {
  const goal = sample('new');
  assert.equal(goal.status, 'proposed');
  assert.ok(goal.tasks.some(task => task.title.includes('isolated project workspace')));
  assert.equal(goal.tasks[0].status, 'queued');
  assert.deepEqual(goal.tasks[1].dependsOn, [goal.tasks[0].id]);
});

test('existing applications begin with safe codebase inspection', () => {
  const goal = sample('existing');
  assert.ok(goal.tasks.some(task => task.title.includes('Inspect existing application safely')));
  assert.ok(!goal.tasks.some(task => task.title.includes('Create isolated project workspace')));
});

test('goal must be explicitly authorized before task execution', () => {
  const goal = sample();
  assert.throws(() => transitionTask(goal, goal.tasks[0].id, 'running'), /Authorize the goal/);
  assert.equal(approveGoal(goal).status, 'approved');
});

test('task-level approval cannot be granted before goal authorization', () => {
  const goal = sample();
  const gated = goal.tasks.find(task => task.requiresApproval)!;
  assert.equal(gated.status, 'awaiting_approval');
  assert.throws(() => transitionTask(goal, gated.id, 'approved'), /Authorize or recover the goal/);
});

test('external deployment task requires explicit approval and retains approval across interruption', () => {
  let goal = approveGoal(sample());
  const gated = goal.tasks.find(task => task.kind === 'deployment')!;
  assert.equal(gated.status, 'awaiting_approval');
  assert.throws(() => transitionTask(goal, gated.id, 'running'), /Invalid task transition/);
  goal = transitionTask(goal, gated.id, 'approved');
  assert.ok(goal.tasks.find(task => task.id === gated.id)?.approvalGrantedAt);
  // It cannot start until its predecessor is verified.
  assert.throws(() => transitionTask(goal, gated.id, 'running'), /dependent tasks/);
});

test('dependencies require verified predecessors, not merely completed or running states', () => {
  let goal = approveGoal(sample());
  assert.throws(() => transitionTask(goal, goal.tasks[1].id, 'running'), /dependent tasks/);
  goal = transitionTask(goal, goal.tasks[0].id, 'running');
  assert.throws(() => transitionTask(goal, goal.tasks[1].id, 'running'), /dependent tasks/);
  goal = transitionTask(goal, goal.tasks[0].id, 'verification_pending', { result: 'Requirements written' });
  goal = transitionTask(goal, goal.tasks[0].id, 'verified', { result: 'Reviewed requirements checklist' });
  assert.doesNotThrow(() => transitionTask(goal, goal.tasks[1].id, 'running'));
});

test('verification cannot pass without concrete evidence', () => {
  let goal = approveGoal(sample());
  goal = transitionTask(goal, goal.tasks[0].id, 'running');
  goal = transitionTask(goal, goal.tasks[0].id, 'verification_pending');
  assert.throws(() => transitionTask(goal, goal.tasks[0].id, 'verified'), /evidence/);
  goal = transitionTask(goal, goal.tasks[0].id, 'verified', { result: 'Test suite passed: 12 tests' });
  assert.equal(goal.tasks[0].verification?.status, 'passed');
});

test('goal completes only when all required tasks are verified; optional deployment remains gated', () => {
  let goal = approveGoal(sample());
  for (const task of goal.tasks.filter(item => !item.optional)) {
    const latest = goal.tasks.find(item => item.id === task.id)!;
    const predecessor = latest.dependsOn[0];
    if (predecessor) assert.equal(goal.tasks.find(item => item.id === predecessor)?.status, 'verified');
    goal = transitionTask(goal, latest.id, 'running', { checkpoint: 'Work started in isolated environment' });
    goal = transitionTask(goal, latest.id, 'verification_pending', { result: `Output produced for ${latest.title}` });
    goal = transitionTask(goal, latest.id, 'verified', { result: `Verified evidence for ${latest.title}` });
  }
  assert.equal(goal.status, 'completed');
  const deployment = goal.tasks.find(item => item.kind === 'deployment')!;
  assert.equal(deployment.status, 'awaiting_approval');
  goal = transitionTask(goal, deployment.id, 'approved');
  assert.equal(goal.status, 'completed');
  goal = transitionTask(goal, deployment.id, 'running');
  assert.equal(goal.status, 'in_progress');
});

test('interruption preserves checkpoint and recovery requires explicit goal authorization', () => {
  let goal = approveGoal(sample());
  goal = transitionTask(goal, goal.tasks[0].id, 'running', { checkpoint: 'Inspected repository and captured git status' });
  goal = interruptGoal(goal, 'Process restarted unexpectedly');
  assert.equal(goal.tasks[0].status, 'interrupted');
  assert.equal(goal.tasks[0].checkpoint, 'Inspected repository and captured git status');
  goal = recoverGoal(goal);
  assert.equal(goal.status, 'approved');
  goal = transitionTask(goal, goal.tasks[0].id, 'running');
  assert.equal(goal.tasks[0].attempts, 2);
});

test('failed gated tasks cannot be retried without a prior explicit approval', () => {
  let goal = approveGoal(sample());
  const gated = goal.tasks.find(task => task.requiresApproval)!;
  assert.throws(() => transitionTask(goal, gated.id, 'running'), /Invalid task transition/);
  goal = transitionTask(goal, gated.id, 'approved');
  assert.ok(goal.tasks.find(task => task.id === gated.id)?.approvalGrantedAt);
});

test('invalid transitions and terminal-state execution are rejected', () => {
  const goal = sample();
  assert.throws(() => transitionTask(goal, goal.tasks[0].id, 'verified'), /Invalid task transition/);
  const cancelled = cancelGoal(goal, 'Owner cancelled the request');
  assert.equal(cancelled.status, 'cancelled');
  assert.throws(() => transitionTask(cancelled, cancelled.tasks[0].id, 'running'), /no longer executable/);
  assert.throws(() => cancelGoal(cancelled, 'Again'), /already terminal/);
});

test('cancellation records reason and blocks queued work', () => {
  const goal = sample();
  const cancelled = cancelGoal(goal, 'Scope changed');
  assert.equal(cancelled.interruptionReason, 'Scope changed');
  assert.ok(cancelled.tasks.every(task => task.status === 'blocked' || task.status === 'awaiting_approval'));
});

test('goal cancellation requires a reason and makes the goal non-executable',()=>{let g=sample();assert.throws(()=>cancelGoal(g,''),/reason/);g=cancelGoal(g,'Joshua cancelled this project');assert.equal(g.status,'cancelled');assert.throws(()=>transitionTask(g,g.tasks[0].id,'running'),/no longer executable/);});
