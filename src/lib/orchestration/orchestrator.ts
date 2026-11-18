import type { TaskStatus, Task, Authorization, Approval, Verification, UUID } from "./model.ts";

export type DependencyType = "finish_to_start" | "start_to_start" | "finish_to_finish" | "approval_required" | "evidence_required";
export interface TaskDependency { taskId: UUID; dependsOnTaskId: UUID; type: DependencyType; requiredEvidenceIds?: UUID[]; }
export interface TransitionContext {
  actorId: string;
  actorKind?: "owner" | "system" | "engine" | "agent" | "integration" | "service";
  ownerApprovalRequired?: boolean;
  reason?: string;
  authorizationValid?: boolean;
  approvalValid?: boolean;
  dependenciesSatisfied?: boolean;
  evidencePresent?: boolean;
  verification?: Verification;
  now?: Date;
}
export interface TransitionResult { from: TaskStatus; to: TaskStatus; changedAt: string; taskVersion: number; }

const transitions: Record<TaskStatus, readonly TaskStatus[]> = {
  discovered: ["evaluated", "rejected", "cancelled"],
  evaluated: ["planned", "blocked", "rejected", "cancelled"],
  planned: ["waiting_for_approval", "authorized", "blocked", "cancelled"],
  waiting_for_approval: ["authorized", "rejected", "cancelled", "blocked"],
  authorized: ["queued", "cancelled", "blocked"],
  queued: ["executing", "cancelled", "blocked"],
  executing: ["verifying", "failed", "interrupted", "recovery_required", "blocked", "cancelled"],
  verifying: ["verified", "failed", "blocked", "cancelled"],
  verified: ["completed"],
  completed: [],
  blocked: ["planned", "queued", "cancelled", "rejected"],
  failed: ["planned", "queued", "cancelled", "rejected"],
  interrupted: ["queued", "recovery_required", "cancelled"],
  recovery_required: ["queued", "blocked", "cancelled"],
  cancelled: [],
  rejected: []
};

export class OrchestratorError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, message: string, retryable = false) { super(message); this.code = code; this.retryable = retryable; this.name = "OrchestratorError"; }
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!transitions[from]?.includes(to)) throw new OrchestratorError("INVALID_STATE_TRANSITION", `Illegal task transition: ${from} -> ${to}.`);
}

export function assertTransitionGuards(task: Task, to: TaskStatus, context: TransitionContext): void {
  assertTransition(task.status, to);
  if ((to === "authorized" || to === "queued" || to === "executing") && context.authorizationValid !== true) {
    throw new OrchestratorError("AUTHORIZATION_REQUIRED", "A current positive authorization decision is required.");
  }
  if (to === "authorized" && context.ownerApprovalRequired && context.approvalValid !== true) {
    throw new OrchestratorError("APPROVAL_REQUIRED", "Required owner approval is missing or invalid.");
  }
  if ((to === "queued" || to === "executing") && context.dependenciesSatisfied !== true) {
    throw new OrchestratorError("DEPENDENCIES_UNSATISFIED", "All required dependencies must be satisfied before queue admission.");
  }
  if (to === "verifying" && context.evidencePresent !== true) {
    throw new OrchestratorError("EVIDENCE_REQUIRED", "Execution evidence must be persisted before verification handoff.");
  }
  if (to === "verified") {
    const v = context.verification;
    if (!v || v.status !== "passed" || v.subjectType !== "task" || v.subjectId !== task.id) {
      throw new OrchestratorError("VERIFICATION_NOT_PASSED", "A matching independent PASSED verification is required.");
    }
    if (v.verifier.id === task.assignedAgentId || v.verifier.id === task.assignedEngineId) {
      throw new OrchestratorError("VERIFIER_NOT_INDEPENDENT", "Verifier must differ from the assigned execution agent and engine.");
    }
    if (v.evidenceIds.length === 0 || v.criteriaResults.some(c => !c.passed)) {
      throw new OrchestratorError("VERIFICATION_EVIDENCE_INVALID", "Passed verification requires evidence and all criteria passing.");
    }
  }
  if (to === "completed" && task.status !== "verified") {
    throw new OrchestratorError("VERIFICATION_REQUIRED", "Only a verified task may be completed.");
  }
}

export function assertDependencyGraphAcyclic(taskIds: readonly string[], dependencies: readonly TaskDependency[]): void {
  const known = new Set(taskIds);
  const adjacency = new Map<string, string[]>();
  for (const id of taskIds) adjacency.set(id, []);
  for (const d of dependencies) {
    if (!known.has(d.taskId) || !known.has(d.dependsOnTaskId)) throw new OrchestratorError("DEPENDENCY_NOT_FOUND", `Dependency references an unknown task: ${d.taskId} -> ${d.dependsOnTaskId}.`);
    adjacency.get(d.taskId)!.push(d.dependsOnTaskId);
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new OrchestratorError("DEPENDENCY_CYCLE", `Circular task dependency detected at ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of adjacency.get(id) ?? []) visit(dep);
    visiting.delete(id); visited.add(id);
  };
  for (const id of taskIds) visit(id);
}

export function evaluateDependencies(task: Task, dependencies: readonly TaskDependency[], tasks: ReadonlyMap<string, Task>, evidenceIds: ReadonlySet<string> = new Set()): { satisfied: boolean; blockers: string[] } {
  const blockers: string[] = [];
  for (const d of dependencies.filter(x => x.taskId === task.id)) {
    const prerequisite = tasks.get(d.dependsOnTaskId);
    if (!prerequisite) { blockers.push(`missing_task:${d.dependsOnTaskId}`); continue; }
    if (d.type === "finish_to_start" && prerequisite.status !== "completed") blockers.push(`not_completed:${prerequisite.id}`);
    if (d.type === "start_to_start" && !["executing", "verifying", "verified", "completed"].includes(prerequisite.status)) blockers.push(`not_started:${prerequisite.id}`);
    if (d.type === "finish_to_finish" && task.status !== "completed" && prerequisite.status !== "completed") blockers.push(`finish_required:${prerequisite.id}`);
    if (d.type === "approval_required" && prerequisite.status !== "authorized" && prerequisite.status !== "completed") blockers.push(`approval_required:${prerequisite.id}`);
    if (d.type === "evidence_required" && (d.requiredEvidenceIds ?? []).some(id => !evidenceIds.has(id))) blockers.push(`evidence_missing:${prerequisite.id}`);
  }
  // Canonical Task.dependencyTaskIds are treated as finish-to-start prerequisites.
  const declared = new Set(dependencies.filter(x => x.taskId === task.id).map(x => x.dependsOnTaskId));
  for (const id of task.dependencyTaskIds) if (!declared.has(id)) {
    const prerequisite = tasks.get(id);
    if (!prerequisite || prerequisite.status !== "completed" || !prerequisite.verificationId) blockers.push(`not_completed_and_verified:${id}`);
  }
  return { satisfied: blockers.length === 0, blockers };
}

export function assertAuthorizationAndApproval(auth: Authorization | null, approval: Approval | null, input: {
  actorId: string; action: string; resourceId: string | null; payloadDigest: string;
  amountUsdMinor?: number | null; now?: Date; ownerApprovalRequired: boolean;
}): void {
  const now = input.now ?? new Date();
  if (!auth) throw new OrchestratorError("AUTHORIZATION_MISSING", "No authorization record supplied.");
  if (auth.status !== "active" || auth.revokedAt) throw new OrchestratorError("AUTHORIZATION_INACTIVE", "Authorization is not active or has been revoked.");
  if (Date.parse(auth.validFrom) > now.getTime() || (auth.expiresAt && Date.parse(auth.expiresAt) <= now.getTime())) throw new OrchestratorError("AUTHORIZATION_EXPIRED", "Authorization is not currently valid.");
  if (auth.subjectActor.id !== input.actorId || auth.action !== input.action || auth.resourceId !== input.resourceId) throw new OrchestratorError("AUTHORIZATION_SCOPE_MISMATCH", "Authorization actor, action or resource does not match.");
  if (auth.payloadDigest !== input.payloadDigest) throw new OrchestratorError("AUTHORIZATION_PAYLOAD_MISMATCH", "Authorization is not bound to this exact payload digest.");
  if (auth.maxUses !== null && auth.usesConsumed >= auth.maxUses) throw new OrchestratorError("AUTHORIZATION_EXHAUSTED", "Authorization use limit has been reached.");
  if (input.amountUsdMinor != null && auth.maxUsdMinor !== null && input.amountUsdMinor > auth.maxUsdMinor) throw new OrchestratorError("AUTHORIZATION_LIMIT_EXCEEDED", "Requested amount exceeds the authorized USD limit.");
  if (input.ownerApprovalRequired) {
    if (!approval) throw new OrchestratorError("OWNER_APPROVAL_MISSING", "Explicit owner approval is required.");
    if (approval.status !== "approved" || approval.action !== input.action || approval.payloadDigest !== input.payloadDigest || (approval.expiresAt && Date.parse(approval.expiresAt) <= now.getTime())) {
      throw new OrchestratorError("OWNER_APPROVAL_INVALID", "Owner approval is not valid for this exact action and payload.");
    }
    if (approval.approverOwnerId !== auth.grantedByOwnerId) throw new OrchestratorError("OWNER_APPROVAL_MISMATCH", "Approval owner does not match the authorization grantor.");
  }
}

export interface IdempotencyRecord<T> { key: string; requestDigest: string; status: "in_progress" | "completed"; result?: T; createdAt: string; }
export class IdempotencyLedger<T> {
  private records = new Map<string, IdempotencyRecord<T>>();
  begin(key: string, requestDigest: string, now = new Date()): { replay: false } | { replay: true; result?: T } {
    if (!key || !requestDigest) throw new OrchestratorError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency key and request digest are required.");
    const prior = this.records.get(key);
    if (prior) {
      if (prior.requestDigest !== requestDigest) throw new OrchestratorError("IDEMPOTENCY_CONFLICT", "Idempotency key was reused with a different request payload.");
      if (prior.status === "completed") return { replay: true, result: prior.result };
      throw new OrchestratorError("IDEMPOTENCY_IN_PROGRESS", "An operation with this idempotency key is already in progress.", true);
    }
    this.records.set(key, { key, requestDigest, status: "in_progress", createdAt: now.toISOString() });
    return { replay: false };
  }
  complete(key: string, requestDigest: string, result: T): void {
    const prior = this.records.get(key);
    if (!prior || prior.requestDigest !== requestDigest) throw new OrchestratorError("IDEMPOTENCY_RECORD_MISSING", "Cannot complete an unknown or mismatched idempotency operation.");
    if (prior.status === "completed") return;
    this.records.set(key, { ...prior, status: "completed", result });
  }
  get(key: string): IdempotencyRecord<T> | undefined { return this.records.get(key); }
}

export type RecoveryDecision = "RETRY" | "RESTORE_CHECKPOINT" | "RECONCILE_FIRST" | "WAIT_FOR_APPROVAL" | "STOP";
export function decideRecovery(input: { retryable: boolean; attemptCount: number; maxAttempts: number; externalOutcomeUnknown: boolean; authorizationValid: boolean; checkpointAvailable: boolean; ownerApprovalRequired: boolean; approvalValid: boolean; }): RecoveryDecision {
  if (!input.authorizationValid) return "WAIT_FOR_APPROVAL";
  if (input.ownerApprovalRequired && !input.approvalValid) return "WAIT_FOR_APPROVAL";
  if (input.externalOutcomeUnknown) return "RECONCILE_FIRST";
  if (!input.retryable || input.attemptCount >= input.maxAttempts) return "STOP";
  if (input.checkpointAvailable) return "RESTORE_CHECKPOINT";
  return "RETRY";
}

export function classifyVerification(v: Verification): "PASS" | "FAIL" | "INCOMPLETE" {
  if (v.status === "passed" && v.evidenceIds.length > 0 && v.criteriaResults.every(c => c.passed)) return "PASS";
  if (v.status === "failed" || v.criteriaResults.some(c => !c.passed)) return "FAIL";
  return "INCOMPLETE";
}

export interface TaskRepository {
  get(taskId: UUID): Promise<Task | null>;
  /** Must atomically persist the new task version and its audit/outbox record. */
  commitTransition(task: Task, expectedVersion: number, auditRecord: { taskId: UUID; actorId: string; action: string; from: TaskStatus; to: TaskStatus; at: string; reason?: string }): Promise<boolean>;
}
export class OrchestratorService {
  private readonly tasks: TaskRepository;
  constructor(tasks: TaskRepository) { this.tasks = tasks; }
  async transition(taskId: UUID, to: TaskStatus, context: TransitionContext): Promise<TransitionResult> {
    const task = await this.tasks.get(taskId);
    if (!task) throw new OrchestratorError("TASK_NOT_FOUND", `Task ${taskId} does not exist.`);
    assertTransitionGuards(task, to, context);
    const now = (context.now ?? new Date()).toISOString();
    const expectedVersion = task.version;
    const updated: Task = { ...task, status: to, updatedAt: now as Task["updatedAt"], updatedBy: { kind: context.actorKind ?? "service", id: context.actorId as UUID }, version: expectedVersion + 1,
      ...(to === "executing" && !task.startedAt ? { startedAt: now as Task["startedAt"] } : {}),
      ...(to === "completed" ? { completedAt: now as Task["completedAt"] } : {}),
      ...(to === "verified" && context.verification ? { verificationId: context.verification.id } : {}) };
    if (!await this.tasks.commitTransition(updated, expectedVersion, { taskId, actorId: context.actorId, action: "task.transition", from: task.status, to, at: now, reason: context.reason })) throw new OrchestratorError("CONCURRENT_MODIFICATION", "Task changed concurrently; reload and reevaluate.", true);
    return { from: task.status, to, changedAt: now, taskVersion: updated.version };
  }
}
