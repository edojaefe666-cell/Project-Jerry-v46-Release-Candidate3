import type { ActorRef, UUID, ISODateTime, SHA256, EntityKind, TaskStatus, FinancialRecordStatus } from "./model.ts";

export type JerryEventType =
  | "goal.created" | "goal.status_changed"
  | "task.created" | "task.assigned" | "task.status_changed" | "task.checkpoint_saved" | "task.failed" | "task.recovered"
  | "authorization.granted" | "authorization.revoked" | "approval.requested" | "approval.decided"
  | "opportunity.created" | "opportunity.status_changed"
  | "business.created" | "business.status_changed"
  | "financial.transaction_recorded" | "financial.transaction_status_changed" | "financial.ledger_posted" | "financial.reconciled"
  | "verification.requested" | "verification.completed"
  | "learning.proposed" | "learning.validated" | "learning.contradicted"
  | "evidence.registered" | "integration.health_changed";

export interface EventEnvelope<TType extends JerryEventType = JerryEventType, TPayload = unknown> {
  eventId: UUID;
  eventType: TType;
  eventVersion: 1;
  occurredAt: ISODateTime;
  recordedAt: ISODateTime;
  tenantId: UUID;
  businessId: UUID | null;
  actor: ActorRef;
  correlationId: UUID;
  causationId: UUID | null;
  aggregateType: EntityKind | "tenant";
  aggregateId: UUID;
  aggregateVersion: number;
  idempotencyKey: string;
  payloadDigest: SHA256;
  payload: TPayload;
}

export interface TaskStatusChangedPayload {
  taskId: UUID;
  from: TaskStatus;
  to: TaskStatus;
  reason: string | null;
  authorizationId: UUID | null;
  verificationId: UUID | null;
}

export interface AuthorizationRevokedPayload {
  authorizationId: UUID;
  revokedBy: ActorRef;
  reason: string;
  effectiveAt: ISODateTime;
}

export interface ApprovalDecidedPayload {
  approvalId: UUID;
  decision: "approved" | "rejected";
  approverOwnerId: UUID;
  decidedAt: ISODateTime;
  payloadDigest: SHA256;
  authorizationId: UUID | null;
}

export interface FinancialStatusChangedPayload {
  transactionId: UUID;
  from: FinancialRecordStatus;
  to: FinancialRecordStatus;
  evidenceIds: UUID[];
  amountUsdMinor: number | null;
}

export interface VerificationCompletedPayload {
  verificationId: UUID;
  subjectType: EntityKind;
  subjectId: UUID;
  status: "passed" | "failed" | "inconclusive" | "waived";
  evidenceIds: UUID[];
}

export interface LearningValidatedPayload {
  learningRecordId: UUID;
  validationState: "validated" | "contradicted";
  confidenceBps: number;
  evidenceIds: UUID[];
}

/**
 * JSON Schema-like canonical constraints are documented in DATA_MODEL_SPEC.md.
 * Persist the exact envelope and payload as JSON; schema registry is keyed by
 * (eventType, eventVersion). Unknown versions must be quarantined, not guessed.
 */
