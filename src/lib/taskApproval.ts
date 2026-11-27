import type { ApprovalRequest } from './types.ts';

/**
 * Consume an autonomous-task approval exactly once. Call inside the same
 * database transaction that creates the durable task execution record.
 */
export function consumeAutonomousTaskApproval(
  approvals: ApprovalRequest[],
  taskId: string,
  approvalId?: string,
  consumedAt = new Date().toISOString(),
): ApprovalRequest[] | null {
  if (!approvalId) return null;
  const target = approvals.find((approval) =>
    approval.id === approvalId &&
    approval.kind === 'autonomous_task' &&
    approval.subjectId === taskId &&
    approval.decision === 'approved' &&
    !approval.consumedAt
  );
  if (!target) return null;
  return approvals.map((approval) =>
    approval.id === approvalId ? { ...approval, consumedAt } : approval
  );
}
