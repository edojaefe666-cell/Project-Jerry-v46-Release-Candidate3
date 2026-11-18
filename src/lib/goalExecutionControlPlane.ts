export type GoalStatus = 'proposed' | 'approved' | 'in_progress' | 'interrupted' | 'completed' | 'cancelled';
export type GoalTaskStatus = 'queued' | 'awaiting_approval' | 'approved' | 'running' | 'interrupted' | 'verification_pending' | 'verified' | 'failed' | 'rejected' | 'blocked';
export type GoalTaskKind = 'research' | 'planning' | 'engineering' | 'content' | 'operations' | 'external_action' | 'financial' | 'deployment';
export interface GoalTask {
  id: string; title: string; description: string; kind: GoalTaskKind; status: GoalTaskStatus;
  dependsOn: string[]; requiresApproval: boolean; approvalGrantedAt?: string; optional?: boolean; approvalReason?: string;
  checkpoint?: string; result?: string; verification?: { status: 'pending' | 'passed' | 'failed'; evidence: string; verifiedAt?: string };
  attempts: number; updatedAt: string;
}
export interface ExecutionGoal {
  id: string; title: string; description: string; projectType: 'new' | 'existing' | 'general';
  targetOutcome: string; status: GoalStatus; tasks: GoalTask[]; createdAt: string; updatedAt: string;
  authorizedAt?: string; interruptionReason?: string; version: number;
}

const stamp = () => new Date().toISOString();
const id = () => globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 24);
const approvalKinds: GoalTaskKind[] = ['external_action', 'financial', 'deployment'];

export function decomposeGoal(input: { title: string; description: string; projectType?: 'new' | 'existing' | 'general'; targetOutcome?: string }): ExecutionGoal {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (title.length < 4 || title.length > 160) throw new Error('Goal title must be 4–160 characters.');
  if (description.length < 10 || description.length > 4000) throw new Error('Describe the goal in 10–4,000 characters.');
  const projectType = input.projectType ?? 'general';
  if (!['new', 'existing', 'general'].includes(projectType)) throw new Error('Project type must be new, existing, or general.');
  const steps: Array<{ title: string; kind: GoalTaskKind; description: string; optional?: boolean }> = [
    { title: 'Understand requirements and success criteria', kind: 'planning', description: 'Clarify scope, constraints, dependencies and measurable acceptance criteria.' },
    { title: 'Research and choose an approach', kind: 'research', description: 'Gather relevant information and compare feasible approaches before committing resources.' },
    { title: 'Create an execution plan', kind: 'planning', description: 'Break the outcome into milestones, tasks, dependencies and verification checks.' },
    ...(projectType === 'new' ? [{ title: 'Create isolated project workspace', kind: 'engineering' as const, description: 'Initialize a new project in an isolated workspace with version control.' }] : []),
    ...(projectType === 'existing' ? [{ title: 'Inspect existing application safely', kind: 'engineering' as const, description: 'Inspect the existing codebase, tests, architecture and working tree before proposing changes.' }] : []),
    { title: 'Implement authorized work', kind: 'engineering', description: 'Execute approved tasks in an isolated workspace; preserve existing work and record checkpoints.' },
    { title: 'Test and resolve defects', kind: 'engineering', description: 'Run relevant automated tests, inspect failures and fix issues without claiming unrun checks passed.' },
    { title: 'Verify the requested outcome', kind: 'operations', description: 'Compare actual results with acceptance criteria and attach concrete evidence.' },
    { title: 'Prepare handover and maintenance plan', kind: 'operations', description: 'Summarize deliverables, limitations, outstanding risks and maintenance needs.' },
    { title: 'External communications or account actions (optional)', kind: 'external_action', optional: true, description: 'Sending messages, submitting forms or changing external accounts requires separate approval of the exact action and content.' },
    { title: 'Purchases or financial commitments (optional)', kind: 'financial', optional: true, description: 'Any purchase, payment, subscription or financial commitment requires fresh approval of the amount, recipient and terms.' },
    { title: 'Publish, deploy or submit to production (optional)', kind: 'deployment', optional: true, description: 'Only after Joshua explicitly approves the exact destination, scope and impact; deployment is not performed by this planning record.' },
  ];
  const tasks: GoalTask[] = steps.map((step, index) => {
    const requiresApproval = approvalKinds.includes(step.kind);
    return {
      id: id(), title: step.title, description: step.description, kind: step.kind,
      status: requiresApproval ? 'awaiting_approval' : 'queued',
      dependsOn: index ? [] : [], requiresApproval, optional: step.optional,
      approvalReason: requiresApproval ? 'This task may affect an external system, money, a contract or production. Joshua must approve it explicitly.' : undefined,
      attempts: 0, updatedAt: stamp(),
    };
  });
  const lastRequired = tasks.filter(task => !task.optional).at(-1);
  tasks.forEach((task, index) => { task.dependsOn = task.optional ? (lastRequired ? [lastRequired.id] : []) : index ? [tasks[index - 1].id] : []; });
  // Optional high-impact tasks depend on the completed handover but do not block goal completion.
  const createdAt = stamp();
  return { id: id(), title, description, projectType, targetOutcome: (typeof input.targetOutcome === 'string' && input.targetOutcome.trim() ? input.targetOutcome.trim() : title).slice(0, 500), status: 'proposed', tasks, createdAt, updatedAt: createdAt, version: 1 };
}

export function approveGoal(goal: ExecutionGoal): ExecutionGoal {
  if (goal.status !== 'proposed' && goal.status !== 'interrupted') throw new Error('Only proposed or interrupted goals can be authorized.');
  const now = stamp();
  return { ...goal, status: 'approved', authorizedAt: now, interruptionReason: undefined, updatedAt: now, version: goal.version + 1 };
}

export function transitionTask(goal: ExecutionGoal, taskId: string, next: GoalTaskStatus, details?: { checkpoint?: string; result?: string; reason?: string }): ExecutionGoal {
  if (goal.status === 'cancelled') throw new Error('This goal is no longer executable.');
  const index = goal.tasks.findIndex(task => task.id === taskId);
  if (index < 0) throw new Error('Task not found.');
  const task = goal.tasks[index];
  if (goal.status === 'completed' && !task.optional) throw new Error('This goal is complete; only explicitly optional tasks may continue.');
  const allowed: Record<GoalTaskStatus, GoalTaskStatus[]> = {
    queued: ['running', 'rejected'], awaiting_approval: ['approved', 'rejected'], approved: ['running', 'rejected'],
    running: ['interrupted', 'verification_pending', 'failed'], interrupted: ['running', 'rejected'],
    verification_pending: ['verified', 'failed', 'running'], verified: [], failed: ['running', 'rejected'], rejected: [], blocked: ['queued'],
  };
  if (!allowed[task.status].includes(next)) throw new Error(`Invalid task transition: ${task.status} → ${next}.`);
  if (next === 'running') {
    if (goal.status !== 'approved' && goal.status !== 'in_progress' && !(goal.status === 'completed' && task.optional)) throw new Error('Authorize the goal before execution.');
    if (task.requiresApproval && !task.approvalGrantedAt) throw new Error('This task requires explicit approval before execution.');
    const missing = task.dependsOn.filter(dep => !goal.tasks.some(candidate => candidate.id === dep && candidate.status === 'verified'));
    if (missing.length) throw new Error('Complete and verify dependent tasks first.');
  }
  if (next === 'approved' && !task.requiresApproval) throw new Error('This task does not require a separate approval.');
  if (next === 'approved' && !['approved', 'in_progress', 'completed'].includes(goal.status)) throw new Error('Authorize or recover the goal before approving a gated task.');
  if (next === 'approved' && goal.status === 'completed' && !task.optional) throw new Error('Only optional gated tasks may be approved after goal completion.');
  if (next === 'verified' && task.status !== 'verification_pending') throw new Error('Move the task to verification pending before verifying it.');
  const updated: GoalTask = {
    ...task, status: next, updatedAt: stamp(), ...(next === 'approved' ? { approvalGrantedAt: stamp() } : {}),
    ...(typeof details?.checkpoint === 'string' ? { checkpoint: details.checkpoint.slice(0, 2000) } : {}),
    ...(typeof details?.result === 'string' ? { result: details.result.slice(0, 4000) } : {}),
  };
  if (next === 'running') updated.attempts += 1;
  if (next === 'verification_pending') updated.verification = { status: 'pending', evidence: (details?.result ?? task.result ?? '').slice(0, 4000) };
  if (next === 'verified') {
    const evidence = (details?.result ?? task.result ?? task.checkpoint ?? '').trim();
    if (evidence.length < 3) throw new Error('Verification requires concrete recorded evidence.');
    updated.verification = { status: 'passed', evidence: evidence.slice(0, 4000), verifiedAt: stamp() };
  }
  if (next === 'failed') updated.verification = { status: 'failed', evidence: (details?.reason ?? details?.result ?? 'Task failed; evidence not supplied.').slice(0, 4000) };
  const tasks = [...goal.tasks]; tasks[index] = updated;
  const required = tasks.filter(item => !item.optional);
  const allRequiredVerified = required.length > 0 && required.every(item => item.status === 'verified');
  const status: GoalStatus = allRequiredVerified ? (task.optional && next === 'running' ? 'in_progress' : 'completed') : next === 'running' ? 'in_progress' : goal.status;
  return { ...goal, tasks, status, updatedAt: stamp(), version: goal.version + 1 };
}

export function interruptGoal(goal: ExecutionGoal, reason: string): ExecutionGoal {
  const clean = typeof reason === 'string' ? reason.trim() : '';
  if (!clean) throw new Error('An interruption reason is required.');
  if (goal.status === 'completed' || goal.status === 'cancelled') throw new Error('Completed or cancelled goals cannot be interrupted.');
  const tasks = goal.tasks.map(task => task.status === 'running' ? { ...task, status: 'interrupted' as const, updatedAt: stamp(), checkpoint: task.checkpoint ?? 'Interrupted without a saved execution checkpoint.' } : task);
  return { ...goal, tasks, status: 'interrupted', interruptionReason: clean.slice(0, 1000), updatedAt: stamp(), version: goal.version + 1 };
}

export function recoverGoal(goal: ExecutionGoal): ExecutionGoal {
  if (goal.status !== 'interrupted') throw new Error('Only interrupted goals can be recovered.');
  return { ...goal, status: 'approved', interruptionReason: undefined, updatedAt: stamp(), version: goal.version + 1 };
}

export function cancelGoal(goal: ExecutionGoal, reason: string): ExecutionGoal {
  const clean = typeof reason === 'string' ? reason.trim() : '';
  if (!clean) throw new Error('A cancellation reason is required.');
  if (goal.status === 'completed' || goal.status === 'cancelled') throw new Error('Goal is already terminal.');
  const tasks = goal.tasks.map(task => task.status === 'running' ? { ...task, status: 'interrupted' as const, checkpoint: task.checkpoint ?? 'Stopped because the goal was cancelled.', updatedAt: stamp() } : task.status === 'queued' || task.status === 'approved' || task.status === 'awaiting_approval' ? { ...task, status: 'blocked' as const, updatedAt: stamp() } : task);
  return { ...goal, tasks, status: 'cancelled', interruptionReason: clean.slice(0, 1000), updatedAt: stamp(), version: goal.version + 1 };
}
