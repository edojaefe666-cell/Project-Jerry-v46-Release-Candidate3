import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequireAuth, type AuthRequest, type OwnerAuthPolicy } from './authCore.ts';
import type { Response, NextFunction } from 'express';

function setup(header?: string, verify?: (token: string, checkRevoked: boolean) => Promise<any>, policy: OwnerAuthPolicy = {}) {
  const req = { headers: header === undefined ? {} : { authorization: header } } as AuthRequest;
  const res = { code: 200, body: undefined as unknown,
    status(this: any, code: number) { this.code = code; return this; },
    json(this: any, body: unknown) { this.body = body; return this; },
  } as Response & { code: number; body: unknown };
  let nextCalls = 0;
  const next = (() => { nextCalls++; }) as NextFunction;
  return { req, res, next, get nextCalls() { return nextCalls; },
    middleware: createRequireAuth(verify ?? (async () => ({ uid: 'test-user' } as any)), policy) };
}

test('rejects absent and malformed bearer headers', async () => {
  for (const h of [undefined, 'Basic abc', 'Bearer ', 'Bearer token extra']) {
    const x = setup(h); await x.middleware(x.req, x.res, x.next);
    assert.equal(x.res.code, 401); assert.equal(x.nextCalls, 0);
  }
});
test('verifies bearer tokens with revocation checking', async () => {
  let checked = false;
  const x = setup('bEaReR token', async (_t, revoked) => { checked = revoked; return { uid: 'u' } as any; });
  await x.middleware(x.req, x.res, x.next);
  assert.equal(checked, true); assert.equal(x.req.user?.uid, 'u'); assert.equal(x.nextCalls, 1);
});
test('admits only the configured owner UID', async () => {
  const owner = setup('Bearer owner', async () => ({ uid: 'owner' } as any), { ownerUid: 'owner', requireOwner: true });
  await owner.middleware(owner.req, owner.res, owner.next);
  assert.equal(owner.nextCalls, 1);
  const other = setup('Bearer other', async () => ({ uid: 'other' } as any), { ownerUid: 'owner', requireOwner: true });
  await other.middleware(other.req, other.res, other.next);
  assert.equal(other.res.code, 403); assert.equal(other.nextCalls, 0);
});
test('fails closed in production when owner UID is not configured', async () => {
  let verified = false;
  const x = setup('Bearer token', async () => { verified = true; return { uid: 'any' } as any; }, { requireOwner: true });
  await x.middleware(x.req, x.res, x.next);
  assert.equal(x.res.code, 503); assert.equal(verified, false); assert.equal(x.nextCalls, 0);
});
test('enforces configured owner UID in non-production too', async () => {
  const x = setup('Bearer other', async () => ({ uid: 'other' } as any), { ownerUid: 'owner' });
  await x.middleware(x.req, x.res, x.next);
  assert.equal(x.res.code, 403); assert.equal(x.nextCalls, 0);
});
test('rejects invalid or revoked tokens', async () => {
  const x = setup('Bearer token', async () => { throw new Error('revoked'); });
  await x.middleware(x.req, x.res, x.next);
  assert.equal(x.res.code, 401); assert.equal(x.nextCalls, 0);
});
