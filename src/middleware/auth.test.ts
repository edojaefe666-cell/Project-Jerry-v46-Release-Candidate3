import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequireAuth, type AuthRequest } from './authCore.ts';
import type { Response, NextFunction } from 'express';

function harness(authorization?: string, verifier?: (token: string, checkRevoked: boolean) => Promise<any>) {
  const req = { headers: authorization === undefined ? {} : { authorization } } as AuthRequest;
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(this: { statusCode: number; body: unknown }, code: number) { this.statusCode = code; return this; },
    json(this: { statusCode: number; body: unknown }, body: unknown) { this.body = body; return this; },
  } as unknown as Response & { statusCode: number; body: unknown };
  let nextCalls = 0;
  const next = (() => { nextCalls += 1; }) as NextFunction;
  const verify = verifier ?? (async () => ({ uid: 'auth-test-user' } as any));
  return { req, response, next, get nextCalls() { return nextCalls; }, middleware: createRequireAuth(verify) };
}

test('auth middleware rejects missing and malformed bearer headers before token verification', async () => {
  for (const header of [undefined, 'Basic abc', 'Bearer ', 'Bearer token extra']) {
    const h = harness(header);
    await h.middleware(h.req, h.response, h.next);
    assert.equal(h.response.statusCode, 401);
    assert.equal(h.nextCalls, 0);
    assert.equal(h.req.user, undefined);
  }
});

test('auth middleware verifies bearer tokens with revocation checking enabled', async () => {
  let receivedToken = '';
  let receivedCheckRevoked = false;
  const h = harness('bEaReR valid-token', async (token, checkRevoked) => {
    receivedToken = token;
    receivedCheckRevoked = checkRevoked;
    return { uid: 'verified-user' } as any;
  });
  await h.middleware(h.req, h.response, h.next);
  assert.equal(receivedToken, 'valid-token');
  assert.equal(receivedCheckRevoked, true);
  assert.equal(h.req.user?.uid, 'verified-user');
  assert.equal(h.nextCalls, 1);
});

test('auth middleware rejects expired, invalid, and revoked token verification failures', async () => {
  for (const reason of ['expired', 'invalid', 'revoked']) {
    const h = harness('Bearer rejected-token', async () => { throw new Error(reason); });
    await h.middleware(h.req, h.response, h.next);
    assert.equal(h.response.statusCode, 401);
    assert.equal(h.nextCalls, 0);
    assert.equal(h.req.user, undefined);
  }
});
