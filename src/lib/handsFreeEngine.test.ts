import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateIncomingCall, type ApprovedContactRecord, type IncomingCallContext } from './handsFreeEngine.ts';

const number = '+2348012345678';
const approved: ApprovedContactRecord = {
  id: 'contact-1', contactName: 'Ada', phoneNumber: number,
  status: 'approved', blocked: false, spam: false, conflict: false,
};
const base: IncomingCallContext = { callerNumber: number, handsFreeEnabled: true, securityLocked: false };
const decide = (call: Partial<IncomingCallContext> = {}, registry: readonly ApprovedContactRecord[] = [approved]) =>
  evaluateIncomingCall({ ...base, ...call }, registry);

test('ALLOW: explicitly approved unique contact with Hands-Free on and device unlocked', () => {
  const result = decide();
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'allow_approved_contact');
  assert.equal(result.matchedContactId, approved.id);
  assert.equal(result.normalizedNumber, number);
});

test('DENY: Hands-Free Mode is off, even for an approved caller', () => {
  assert.equal(decide({ handsFreeEnabled: false }).reason, 'hands_free_disabled');
});

test('DENY: security/lost-device lock is active, even for an approved caller', () => {
  assert.equal(decide({ securityLocked: true }).reason, 'security_locked');
});

test('DENY: hidden, restricted, or missing caller ID', () => {
  assert.equal(decide({ callerNumber: null }).reason, 'hidden_caller_id');
  assert.equal(decide({ callerNumber: '   ' }).reason, 'hidden_caller_id');
  assert.equal(decide({ callerIdRestricted: true }).reason, 'hidden_caller_id');
});

test('DENY: malformed or unrecognized number', () => {
  assert.equal(decide({ callerNumber: 'not-a-number' }).reason, 'unknown_or_invalid_number');
  assert.equal(decide({ callerNumber: '+2348099999999' }).reason, 'unknown_or_invalid_number');
});

test('DENY: OS/native integration marks caller blocked', () => {
  assert.equal(decide({ platformBlocked: true }).reason, 'platform_blocked');
});

test('DENY: OS/native integration marks caller as spam', () => {
  assert.equal(decide({ platformSpam: true }).reason, 'platform_spam');
});

test('DENY: registry blocked status overrides prior approval', () => {
  assert.equal(decide({}, [{ ...approved, blocked: true, status: 'suspended' }]).reason, 'registry_blocked');
});

test('DENY: registry spam status overrides prior approval', () => {
  assert.equal(decide({}, [{ ...approved, spam: true, status: 'suspended' }]).reason, 'registry_spam');
});

test('DENY: duplicate conflict flag suspends the number', () => {
  assert.equal(decide({}, [{ ...approved, conflict: true, status: 'suspended' }]).reason, 'duplicate_conflict');
});

test('DENY: multiple active records for the same normalized number are a conflict', () => {
  const duplicate = { ...approved, id: 'contact-2', contactName: 'Another person', phoneNumber: '+234 801 234 5678' };
  assert.equal(decide({}, [approved, duplicate]).reason, 'duplicate_conflict');
});

test('DENY: saved but unapproved/revoked contact', () => {
  assert.equal(decide({}, [{ ...approved, status: 'revoked' }]).reason, 'revoked');
});

test('DENY: suspended contact remains denied after risk flag is cleared', () => {
  assert.equal(decide({}, [{ ...approved, status: 'suspended' }]).reason, 'approval_suspended');
});

test('ALLOW: phone formatting is normalized before registry matching', () => {
  const result = decide({ callerNumber: '+234 (801) 234-5678' });
  assert.equal(result.allowed, true);
  assert.equal(result.normalizedNumber, number);
});

test('DENY: conflicting duplicate record cannot be bypassed by another approved match', () => {
  const conflicted = { ...approved, id: 'contact-2', contactName: 'Other', conflict: true, status: 'suspended' as const };
  assert.equal(decide({}, [approved, conflicted]).reason, 'duplicate_conflict');
});
