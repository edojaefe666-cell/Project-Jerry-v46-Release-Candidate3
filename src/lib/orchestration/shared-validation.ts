import type {
  Authorization, Approval, FinancialTransaction, LedgerEntry, Task, TaskStatus,
  Verification, LearningRecord, USDMinor, BTCDecimal
} from "./model.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const SHA_RE = /^[a-f0-9]{64}$/i;
const BTC_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/;

export function assertUuid(value: string, field = "id"): asserts value is string {
  if (!UUID_RE.test(value)) throw new Error(`${field} must be a canonical UUID.`);
}
export function assertUtcTimestamp(value: string, field = "timestamp"): void {
  if (!ISO_RE.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${field} must be an RFC3339 UTC timestamp ending in Z.`);
}
export function assertUsdMinor(value: number, field = "amountUsdMinor"): asserts value is USDMinor {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a non-negative safe integer in USD cents.`);
}
export function assertBtcDecimal(value: string): asserts value is BTCDecimal {
  if (!BTC_RE.test(value)) throw new Error("BTC amount must be an exact decimal string with at most 8 fractional digits.");
}
export function assertConfidenceBps(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) throw new Error("confidenceBps must be an integer from 0 to 10000.");
}

const transitions: Record<TaskStatus, TaskStatus[]> = {
  discovered: ["evaluated", "rejected", "cancelled"],
  evaluated: ["planned", "blocked", "rejected", "cancelled"],
  planned: ["waiting_for_approval", "authorized", "queued", "blocked", "cancelled"],
  waiting_for_approval: ["authorized", "rejected", "cancelled", "blocked"],
  authorized: ["queued", "cancelled", "blocked"],
  queued: ["executing", "cancelled", "blocked"],
  executing: ["verifying", "failed", "interrupted", "recovery_required", "blocked"],
  verifying: ["verified", "failed", "executing", "blocked"],
  verified: ["completed"],
  completed: [],
  blocked: ["planned", "queued", "cancelled"],
  failed: ["planned", "queued", "cancelled"],
  interrupted: ["queued", "recovery_required", "cancelled"],
  recovery_required: ["queued", "blocked", "cancelled"],
  cancelled: [],
  rejected: []
};

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!transitions[from].includes(to)) throw new Error(`Illegal task transition: ${from} -> ${to}.`);
}

export function assertTaskRunnable(task: Task, deps: Task[], now = new Date()): void {
  if (!["authorized", "queued"].includes(task.status)) throw new Error("Task is not in a runnable state.");
  if (task.attemptCount >= task.maxAttempts) throw new Error("Task attempt limit reached.");
  if (task.nextAttemptAt && Date.parse(task.nextAttemptAt) > now.getTime()) throw new Error("Task retry time has not arrived.");
  const dependencyIds = new Set(deps.filter(d => d.status === "completed" && d.verificationId !== null).map(d => d.id));
  if (task.dependencyTaskIds.some(id => !dependencyIds.has(id))) throw new Error("Every dependency must be completed and independently verified.");
}

export function assertAuthorizationUsable(auth: Authorization, input: {
  actorId: string; action: string; resourceId: string | null; payloadDigest: string | null;
  amountUsdMinor?: number | null; now?: Date;
}): void {
  const now = input.now ?? new Date();
  if (auth.status !== "active") throw new Error("Authorization is not active.");
  if (Date.parse(auth.validFrom) > now.getTime()) throw new Error("Authorization is not yet valid.");
  if (auth.expiresAt && Date.parse(auth.expiresAt) <= now.getTime()) throw new Error("Authorization has expired.");
  if (auth.revokedAt) throw new Error("Authorization has been revoked.");
  if (auth.subjectActor.id !== input.actorId) throw new Error("Authorization subject mismatch.");
  if (auth.action !== input.action) throw new Error("Authorization action mismatch.");
  if (auth.resourceId !== input.resourceId) throw new Error("Authorization resource mismatch.");
  if (auth.payloadDigest && auth.payloadDigest !== input.payloadDigest) throw new Error("Approved payload digest mismatch.");
  if (auth.maxUses !== null && auth.usesConsumed >= auth.maxUses) throw new Error("Authorization use limit reached.");
  if (input.amountUsdMinor != null && auth.maxUsdMinor != null && input.amountUsdMinor > auth.maxUsdMinor) throw new Error("Authorization monetary limit exceeded.");
}

export function assertApprovalMatches(approval: Approval, action: string, digest: string, now = new Date()): void {
  if (approval.status !== "approved") throw new Error("Owner approval is not approved.");
  if (approval.action !== action || approval.payloadDigest !== digest) throw new Error("Approval does not match the exact action payload.");
  if (approval.expiresAt && Date.parse(approval.expiresAt) <= now.getTime()) throw new Error("Owner approval expired.");
}

export function assertFinancialTransaction(tx: FinancialTransaction): void {
  if (tx.fiatCurrency !== null && tx.fiatCurrency !== "USD") throw new Error("USD is the only supported fiat currency.");
  if (tx.btcAmount !== null) {
    assertBtcDecimal(tx.btcAmount);
    if (tx.btcNetwork !== "bitcoin-mainnet") throw new Error("BTC transactions must use Bitcoin mainnet.");
    if (tx.usdValuationAtEventMinor === null) throw new Error("BTC transactions require a USD valuation snapshot.");
  } else if (tx.btcNetwork !== null) {
    throw new Error("BTC network must be null when no BTC amount is present.");
  }
  if (tx.direction === "outflow" && (!tx.authorizationId || !tx.approvalId)) {
    throw new Error("Every outgoing financial transaction requires explicit owner approval and authorization.");
  }
  if (tx.status === "reconciled" && (!tx.reconciledAt || tx.evidenceIds.length === 0)) {
    throw new Error("Reconciled transactions require reconciliation timestamp and evidence.");
  }
  if (tx.amountUsdMinor !== null) assertUsdMinor(tx.amountUsdMinor);
}

export function assertBalancedJournal(entries: LedgerEntry[]): void {
  if (entries.length < 2) throw new Error("A journal requires at least two ledger entries.");
  const debits = entries.filter(e => e.entrySide === "debit").reduce((n, e) => n + e.amountUsdMinor, 0);
  const credits = entries.filter(e => e.entrySide === "credit").reduce((n, e) => n + e.amountUsdMinor, 0);
  if (!Number.isSafeInteger(debits) || !Number.isSafeInteger(credits) || debits !== credits) throw new Error("Journal debits and credits must balance exactly in USD cents.");
}

export function assertVerification(ver: Verification): void {
  if (ver.status === "passed" && ver.criteriaResults.some(c => !c.passed)) throw new Error("A passed verification cannot contain a failed criterion.");
  if (ver.status === "passed" && ver.evidenceIds.length === 0) throw new Error("A passed verification requires evidence.");
  if (ver.verifierIndependence === "same_actor_exception" && ver.method !== "human_review") throw new Error("Same-actor exception is limited to documented human review.");
}

export function assertLearningRecord(learning: LearningRecord): void {
  assertConfidenceBps(learning.confidenceBps);
  if (learning.validationState === "validated" && (!learning.validatedAt || !learning.validatedBy || learning.evidenceIds.length === 0)) {
    throw new Error("Validated learning requires validator, timestamp and evidence.");
  }
  if (learning.validationState === "proposed" && learning.validatedAt !== null) {
    throw new Error("Proposed learning cannot have a validation timestamp.");
  }
}
