export function normalizePhoneNumber(input: string): string {
  const raw = input.trim();
  if (!raw) throw new Error('Phone number is required.');
  const compact = raw.replace(/[().\s-]/g, '');
  if (!/^\+?[0-9]{7,15}$/.test(compact)) throw new Error('Invalid phone number.');
  if (compact.startsWith('+')) return compact;
  if (compact.startsWith('0')) return '+234' + compact.slice(1);
  return '+' + compact;
}

export type HandsFreeDecisionReason =
  | 'allow_approved_contact'
  | 'hands_free_disabled'
  | 'security_locked'
  | 'hidden_caller_id'
  | 'unknown_or_invalid_number'
  | 'platform_blocked'
  | 'platform_spam'
  | 'registry_blocked'
  | 'registry_spam'
  | 'duplicate_conflict'
  | 'not_approved'
  | 'approval_suspended'
  | 'revoked';

export interface ApprovedContactRecord {
  id: string;
  contactName: string;
  phoneNumber: string;
  status: 'approved' | 'suspended' | 'revoked';
  blocked: boolean;
  spam: boolean;
  conflict: boolean;
}

export interface IncomingCallContext {
  callerNumber?: string | null;
  callerIdRestricted?: boolean;
  handsFreeEnabled: boolean;
  securityLocked: boolean;
  /** Signals supplied by a trusted OS/native call integration, never inferred from contact names. */
  platformBlocked?: boolean;
  platformSpam?: boolean;
}

export interface HandsFreeEvaluation {
  allowed: boolean;
  reason: HandsFreeDecisionReason;
  normalizedNumber?: string;
  matchedContactId?: string;
  matchedContactName?: string;
}

/**
 * Pure, fail-closed policy engine. It does not answer calls. A future Android call bridge
 * must supply trusted device state and invoke this policy immediately before answering.
 */
export function evaluateIncomingCall(
  call: IncomingCallContext,
  registry: readonly ApprovedContactRecord[],
): HandsFreeEvaluation {
  if (!call.handsFreeEnabled) return { allowed: false, reason: 'hands_free_disabled' };
  if (call.securityLocked) return { allowed: false, reason: 'security_locked' };
  if (call.callerIdRestricted || !call.callerNumber?.trim()) return { allowed: false, reason: 'hidden_caller_id' };

  let normalizedNumber: string;
  try {
    normalizedNumber = normalizePhoneNumber(call.callerNumber);
  } catch {
    return { allowed: false, reason: 'unknown_or_invalid_number' };
  }

  if (call.platformBlocked) return { allowed: false, reason: 'platform_blocked', normalizedNumber };
  if (call.platformSpam) return { allowed: false, reason: 'platform_spam', normalizedNumber };

  const matches = registry.filter((record) => {
    try { return normalizePhoneNumber(record.phoneNumber) === normalizedNumber; }
    catch { return false; }
  });

  if (matches.length === 0) return { allowed: false, reason: 'unknown_or_invalid_number', normalizedNumber };

  const resultFor = (reason: HandsFreeDecisionReason, record?: ApprovedContactRecord): HandsFreeEvaluation => ({
    allowed: false,
    reason,
    normalizedNumber,
    ...(record ? { matchedContactId: record.id, matchedContactName: record.contactName } : {}),
  });

  // Risk flags override approval, including stale/revoked records. They can never grant access.
  const blocked = matches.find((record) => record.blocked);
  if (blocked) return resultFor('registry_blocked', blocked);
  const spam = matches.find((record) => record.spam);
  if (spam) return resultFor('registry_spam', spam);

  const activeMatches = matches.filter((record) => record.status !== 'revoked');
  if (matches.some((record) => record.conflict) || activeMatches.length > 1) {
    return resultFor('duplicate_conflict', activeMatches[0] ?? matches[0]);
  }

  if (activeMatches.length === 0) return resultFor('revoked', matches[0]);
  const contact = activeMatches[0];
  if (contact.status === 'suspended') return resultFor('approval_suspended', contact);
  if (contact.status !== 'approved') return resultFor('not_approved', contact);

  return {
    allowed: true,
    reason: 'allow_approved_contact',
    normalizedNumber,
    matchedContactId: contact.id,
    matchedContactName: contact.contactName,
  };
}
