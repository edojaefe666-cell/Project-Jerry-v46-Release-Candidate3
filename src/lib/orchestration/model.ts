/**
 * Jerry canonical shared data model.
 * IDs are opaque UUIDv7 strings (lowercase canonical UUID form).
 * Timestamps are RFC 3339 UTC strings.
 * Money uses integer minor units; BTC uses exact decimal strings.
 */

export type UUID = string & { readonly __brand: "UUID" };
export type ISODateTime = string & { readonly __brand: "ISODateTime" };
export type SHA256 = string & { readonly __brand: "SHA256" };
export type USDMinor = number & { readonly __brand: "USDMinor" }; // integer cents
export type BTCDecimal = string & { readonly __brand: "BTCDecimal" };

export type EntityKind =
  | "owner" | "engine" | "agent" | "goal" | "milestone" | "task"
  | "opportunity" | "business" | "product" | "customer" | "lead"
  | "authorization" | "approval" | "financial_account" | "financial_transaction"
  | "ledger_entry" | "verification" | "evidence" | "learning_record"
  | "integration" | "resource" | "document";

export interface RecordBase {
  id: UUID;
  entityType: EntityKind;
  schemaVersion: 1;
  createdAt: ISODateTime;
  createdBy: ActorRef;
  updatedAt: ISODateTime;
  updatedBy: ActorRef;
  version: number;                 // optimistic concurrency; starts at 1
  tenantId: UUID;                  // Jerry installation/workspace boundary
  businessId: UUID | null;          // null for system-wide records
  correlationId: UUID | null;       // end-to-end workflow trace
  causationId: UUID | null;         // event/command that caused this record
  archivedAt: ISODateTime | null;   // soft archive; never hard-delete audit/ledger
  metadata: Record<string, string | number | boolean | null>;
}

export type ActorKind = "owner" | "system" | "engine" | "agent" | "integration" | "service";
export interface ActorRef {
  kind: ActorKind;
  id: UUID;
  displayName?: string;
}

export interface Owner extends RecordBase {
  entityType: "owner";
  displayName: string;
  timezone: string;                 // IANA timezone
  fiatAccountingCurrency: "USD";
  autonomyPolicyId: UUID;
  status: "active" | "suspended";
}

export type EngineStatus = "registered" | "enabled" | "degraded" | "disabled";
export interface Engine extends RecordBase {
  entityType: "engine";
  key: string;                      // stable slug, unique per tenant
  name: string;
  responsibility: string;
  status: EngineStatus;
  contractVersion: string;
  capabilities: string[];
  acceptedEventTypes: string[];
  emittedEventTypes: string[];
  permissionScopes: string[];
  healthCheckedAt: ISODateTime | null;
}

export interface Agent extends RecordBase {
  entityType: "agent";
  engineId: UUID;
  agentKey: string;
  name: string;
  status: "available" | "busy" | "paused" | "disabled";
  capabilityTags: string[];
  executionMode: "advisory" | "prepare" | "preauthorized";
  maxConcurrentTasks: number;
}

export type GoalStatus = "proposed" | "approved" | "in_progress" | "blocked" | "interrupted" | "completed" | "cancelled";
export interface Goal extends RecordBase {
  entityType: "goal";
  title: string;
  description: string;
  objective: string;
  successCriteria: AcceptanceCriterion[];
  status: GoalStatus;
  priority: 1 | 2 | 3 | 4 | 5;
  ownerId: UUID;
  parentGoalId: UUID | null;
  targetAt: ISODateTime | null;
  authorizedByApprovalId: UUID | null;
}

export interface AcceptanceCriterion {
  key: string;
  description: string;
  required: boolean;
  verificationMethod: "automated_test" | "human_review" | "external_evidence" | "financial_reconciliation";
  evidenceType?: string;
}

export interface Milestone extends RecordBase {
  entityType: "milestone";
  goalId: UUID;
  title: string;
  sequence: number;
  status: "pending" | "in_progress" | "blocked" | "verified" | "cancelled";
  dueAt: ISODateTime | null;
  acceptanceCriteria: AcceptanceCriterion[];
}

export type TaskStatus =
  | "discovered" | "evaluated" | "planned" | "waiting_for_approval"
  | "authorized" | "queued" | "executing" | "verifying" | "verified"
  | "completed" | "blocked" | "failed" | "interrupted"
  | "recovery_required" | "cancelled" | "rejected";

export type TaskKind =
  | "research" | "analysis" | "planning" | "engineering" | "marketing"
  | "customer_operations" | "financial" | "external_communication"
  | "purchase" | "investment" | "contract" | "deployment" | "device_action"
  | "verification" | "maintenance";

export interface Task extends RecordBase {
  entityType: "task";
  goalId: UUID | null;
  milestoneId: UUID | null;
  parentTaskId: UUID | null;
  title: string;
  description: string;
  kind: TaskKind;
  status: TaskStatus;
  priority: 1 | 2 | 3 | 4 | 5;
  assignedEngineId: UUID | null;
  assignedAgentId: UUID | null;
  dependencyTaskIds: UUID[];
  idempotencyKey: string;           // unique per tenant + operation scope
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: ISODateTime | null;
  startedAt: ISODateTime | null;
  completedAt: ISODateTime | null;
  checkpointRef: string | null;     // durable checkpoint/document reference
  resultSummary: string | null;
  acceptanceCriteria: AcceptanceCriterion[];
  authorizationId: UUID | null;
  verificationId: UUID | null;
  resourceBudget: ResourceBudget;
  failure: FailureInfo | null;
}

export interface ResourceBudget {
  maxUsdMinor: USDMinor | null;
  maxDurationSeconds: number | null;
  maxAttempts: number;
  allowedScopes: string[];
}

export interface FailureInfo {
  code: string;
  message: string;
  retryable: boolean;
  occurredAt: ISODateTime;
}

export type OpportunityStatus = "discovered" | "researching" | "validated" | "recommended" | "approved" | "rejected" | "converted" | "archived";
export interface Opportunity extends RecordBase {
  entityType: "opportunity";
  title: string;
  description: string;
  sector: string;
  discoverySourceIds: UUID[];
  evidenceIds: UUID[];
  estimatedStartupCostUsdMinor: USDMinor | null;
  expectedMonthlyRevenueLowUsdMinor: USDMinor | null;
  expectedMonthlyRevenueHighUsdMinor: USDMinor | null;
  confidenceBps: number | null;     // 0..10000
  riskLevel: "low" | "moderate" | "high" | "critical" | "unknown";
  assumptions: string[];
  status: OpportunityStatus;
  nextAction: string | null;
  convertedBusinessId: UUID | null;
}

export type BusinessStatus = "proposed" | "pilot" | "active" | "paused" | "scaling" | "winding_down" | "closed";
export interface Business extends RecordBase {
  entityType: "business";
  name: string;
  legalName: string | null;
  description: string;
  status: BusinessStatus;
  opportunityId: UUID | null;
  ownerId: UUID;
  operatingTimezone: string;
  accountingCurrency: "USD";
  startedAt: ISODateTime | null;
  closedAt: ISODateTime | null;
  policyProfileId: UUID;
}

export interface Product extends RecordBase {
  entityType: "product";
  businessId: UUID;
  name: string;
  description: string;
  kind: "physical_product" | "digital_product" | "service" | "subscription";
  lifecycle: "draft" | "testing" | "available" | "paused" | "retired";
  priceUsdMinor: USDMinor | null;
  deliveryTerms: string | null;
}

export interface Lead extends RecordBase {
  entityType: "lead";
  businessId: UUID;
  source: string;
  status: "new" | "qualified" | "contact_approved" | "contacted" | "engaged" | "converted" | "disqualified" | "opted_out";
  contactRef: string | null;        // pointer to encrypted PII vault; never raw secrets in events
  consentStatus: "unknown" | "consented" | "not_required_basis_recorded" | "withdrawn";
  consentEvidenceId: UUID | null;
  estimatedValueUsdMinor: USDMinor | null;
  customerId: UUID | null;
}

export interface Customer extends RecordBase {
  entityType: "customer";
  businessId: UUID;
  externalCustomerRef: string | null;
  displayLabel: string;
  status: "prospect" | "active" | "inactive" | "suspended" | "deleted";
  contactRef: string | null;
  consentStatus: "unknown" | "consented" | "withdrawn";
  firstValueAt: ISODateTime | null;
}

export type AutonomyLevel = "observe" | "prepare" | "preauthorized_execute" | "owner_approval";
export type AuthorizationStatus = "draft" | "active" | "expired" | "revoked" | "consumed" | "denied";
export type SensitiveAction =
  | "financial.outgoing_transfer" | "financial.purchase" | "financial.investment"
  | "legal.contract" | "business.commitment" | "communication.confidential_share"
  | "communication.external_send" | "production.deploy" | "architecture.major_change"
  | "security.policy_change" | "device.automatic_answering.activate";

export interface Authorization extends RecordBase {
  entityType: "authorization";
  subjectActor: ActorRef;
  action: SensitiveAction | string;
  resourceType: EntityKind | "external_resource";
  resourceId: UUID | null;
  scope: Record<string, string | number | boolean | null>;
  autonomyLevel: AutonomyLevel;
  status: AuthorizationStatus;
  grantedByOwnerId: UUID | null;
  approvalId: UUID | null;
  validFrom: ISODateTime;
  expiresAt: ISODateTime | null;
  revokedAt: ISODateTime | null;
  revocationReason: string | null;
  maxUsdMinor: USDMinor | null;
  maxUses: number | null;
  usesConsumed: number;
  payloadDigest: SHA256 | null;     // binds approval to exact action/payload
  policyVersion: string;
}

export interface Approval extends RecordBase {
  entityType: "approval";
  requestedBy: ActorRef;
  approverOwnerId: UUID;
  action: SensitiveAction | string;
  resourceType: string;
  resourceId: UUID | null;
  payloadDigest: SHA256;
  summary: string;
  amountUsdMinor: USDMinor | null;
  status: "pending" | "approved" | "rejected" | "expired" | "revoked";
  requestedAt: ISODateTime;
  decidedAt: ISODateTime | null;
  expiresAt: ISODateTime | null;
  decisionReason: string | null;
  authorizationId: UUID | null;
}

export interface FinancialAccount extends RecordBase {
  entityType: "financial_account";
  businessId: UUID | null;
  label: string;
  accountType: "cash" | "bank" | "processor_clearing" | "wallet_btc" | "receivable" | "payable" | "equity" | "revenue" | "expense";
  currency: "USD" | "BTC";
  network: "bitcoin-mainnet" | null; // required iff currency is BTC
  externalAccountRef: string | null; // encrypted/opaque provider reference
  status: "active" | "frozen" | "closed";
}

export type FinancialRecordStatus = "projected" | "pending" | "confirmed" | "reconciled" | "voided" | "reversed";
export type FinancialDirection = "inflow" | "outflow";
export interface FinancialTransaction extends RecordBase {
  entityType: "financial_transaction";
  businessId: UUID | null;
  accountId: UUID;
  direction: FinancialDirection;
  status: FinancialRecordStatus;
  kind: "revenue" | "expense" | "refund" | "transfer" | "fee" | "investment" | "adjustment";
  fiatCurrency: "USD" | null;
  amountUsdMinor: USDMinor | null;  // authoritative fiat reporting value
  btcAmount: BTCDecimal | null;     // only for BTC-specific wallet transaction
  btcNetwork: "bitcoin-mainnet" | null;
  usdValuationAtEventMinor: USDMinor | null;
  exchangeRateSource: string | null;
  occurredAt: ISODateTime;
  confirmedAt: ISODateTime | null;
  reconciledAt: ISODateTime | null;
  externalReference: string | null;
  counterpartyRef: string | null;
  authorizationId: UUID | null;
  approvalId: UUID | null;
  evidenceIds: UUID[];
  reversalOfTransactionId: UUID | null;
  idempotencyKey: string;
}

export interface LedgerEntry extends RecordBase {
  entityType: "ledger_entry";
  transactionId: UUID;
  accountId: UUID;
  entrySide: "debit" | "credit";
  amountUsdMinor: USDMinor;         // double-entry ledger always USD functional currency
  postingDate: string;              // YYYY-MM-DD in accounting timezone
  journalId: UUID;
  reversalOfEntryId: UUID | null;
}

export type EvidenceKind =
  | "source_document" | "source_url" | "test_report" | "build_artifact"
  | "customer_confirmation" | "payment_processor_record" | "bank_statement"
  | "bitcoin_txid" | "deployment_record" | "human_review" | "system_log"
  | "screenshot" | "other";
export interface Evidence extends RecordBase {
  entityType: "evidence";
  kind: EvidenceKind;
  title: string;
  uri: string;                      // internal object URI or canonical source URI
  contentHash: SHA256 | null;
  capturedAt: ISODateTime;
  capturedBy: ActorRef;
  sourceSystem: string;
  integrityStatus: "unverified" | "verified" | "failed" | "expired";
  sensitivity: "public" | "internal" | "confidential" | "restricted";
  retentionUntil: ISODateTime | null;
}

export interface Verification extends RecordBase {
  entityType: "verification";
  subjectType: EntityKind;
  subjectId: UUID;
  verifier: ActorRef;
  verifierIndependence: "independent" | "separate_agent" | "same_actor_exception";
  method: "automated_test" | "human_review" | "external_confirmation" | "financial_reconciliation" | "security_review";
  status: "pending" | "passed" | "failed" | "inconclusive" | "waived";
  criteriaResults: Array<{ criterionKey: string; passed: boolean; evidenceIds: UUID[]; notes: string }>;
  evidenceIds: UUID[];
  verifiedAt: ISODateTime | null;
  expiresAt: ISODateTime | null;
  verifierNotes: string;
}

export interface LearningRecord extends RecordBase {
  entityType: "learning_record";
  scope: "system" | "engine" | "agent" | "business" | "opportunity" | "customer_segment" | "workflow";
  scopeId: UUID | null;
  category: "hypothesis" | "lesson" | "correction" | "preference" | "experiment" | "pattern";
  title: string;
  statement: string;
  hypothesis: string | null;
  actionTaken: string | null;
  observedOutcome: string | null;
  evidenceIds: UUID[];
  sourceTaskIds: UUID[];
  confidenceBps: number;            // 0..10000
  validationState: "proposed" | "supported" | "validated" | "contradicted" | "retired";
  validatedBy: ActorRef | null;
  validatedAt: ISODateTime | null;
  applicability: string[];
  expiresAt: ISODateTime | null;
  supersedesLearningId: UUID | null;
}

export interface Resource extends RecordBase {
  entityType: "resource";
  resourceType: "compute" | "api_quota" | "storage" | "human_time" | "marketing_budget" | "cash" | "other";
  label: string;
  unit: string;
  availableQuantity: string;        // decimal string to avoid floating point
  reservedQuantity: string;
  limitQuantity: string | null;
  costPerUnitUsdMinor: USDMinor | null;
  status: "available" | "constrained" | "exhausted" | "disabled";
}

export interface Integration extends RecordBase {
  entityType: "integration";
  key: string;
  provider: string;
  status: "connected" | "degraded" | "disconnected" | "revoked";
  grantedScopes: string[];
  credentialRef: string | null;     // secret manager reference only; never credential material
  lastSuccessfulSyncAt: ISODateTime | null;
  lastErrorCode: string | null;
}
