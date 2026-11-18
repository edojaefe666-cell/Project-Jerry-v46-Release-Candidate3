import test from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import { adminAuth } from './firebase-admin.ts';
import type { UserRecord } from 'firebase-admin/auth';
import { randomUUID } from 'node:crypto';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';

const configuredEmail = process.env.JERRY_FIREBASE_TEST_EMAIL;
const apiKey = process.env.JERRY_FIREBASE_WEB_API_KEY;
const projectId = process.env.JERRY_FIREBASE_PROJECT_ID;
const enabled = process.env.JERRY_FIREBASE_INTEGRATION === '1';

async function signInWithPassword(email: string, password: string): Promise<{ idToken: string; localId: string }> {
  if (!apiKey) throw new Error('JERRY_FIREBASE_WEB_API_KEY is required');

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );

  const body = await response.json() as { idToken?: string; localId?: string; error?: { message?: string } };
  if (!response.ok || !body.idToken || !body.localId) {
    throw new Error(`Firebase test sign-in failed: ${body.error?.message ?? response.statusText}`);
  }
  return { idToken: body.idToken, localId: body.localId };
}

function responseProbe() {
  let statusCode = 200;
  let body: unknown;
  return {
    response: {
      status(code: number) { statusCode = code; return this; },
      json(value: unknown) { body = value; return this; },
    } as unknown as Response,
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
}

test('real Firebase authentication and Jerry bearer-token revocation boundary', async (t) => {
  if (!enabled) {
    t.skip('Set JERRY_FIREBASE_INTEGRATION=1 and test Firebase credentials to run the deployment gate.');
    return;
  }

  assert.ok(projectId, 'JERRY_FIREBASE_PROJECT_ID is required');
  assert.equal(adminAuth.app.options.projectId, projectId, 'Firebase Admin project must match the test project');
  assert.ok(configuredEmail, 'JERRY_FIREBASE_TEST_EMAIL is required as the base email for disposable CI identities');

  let testUser: UserRecord | null = null;
  try {
    const emailDomain = configuredEmail.slice(configuredEmail.lastIndexOf('@') + 1);
    assert.ok(emailDomain && emailDomain !== configuredEmail, 'JERRY_FIREBASE_TEST_EMAIL must contain a valid email domain');
    const disposableEmail = `jerry-ci-${randomUUID()}@${emailDomain}`;
    const disposablePassword = `Jr!${randomUUID()}aA9`;
    testUser = await adminAuth.createUser({ email: disposableEmail, password: disposablePassword });

    const session = await signInWithPassword(disposableEmail, disposablePassword);

    const firstRequest = { headers: { authorization: `Bearer ${session.idToken}` } } as AuthRequest;
    const firstResponse = responseProbe();
    let nextCalled = false;
    await requireAuth(firstRequest, firstResponse.response, () => { nextCalled = true; });
    assert.equal(nextCalled, true, 'Jerry auth middleware must accept the freshly issued Firebase ID token');
    assert.equal(firstRequest.user?.uid, session.localId);

    await adminAuth.revokeRefreshTokens(session.localId);

    const revokedRequest = { headers: { authorization: `Bearer ${session.idToken}` } } as AuthRequest;
    const revokedResponse = responseProbe();
    let revokedNextCalled = false;
    await requireAuth(revokedRequest, revokedResponse.response, () => { revokedNextCalled = true; });
    assert.equal(revokedNextCalled, false, 'Jerry auth middleware must reject the revoked Firebase ID token');
    assert.equal(revokedResponse.statusCode, 401);
    assert.deepEqual(revokedResponse.body, { error: 'Unauthorized: Invalid token' });
  } finally {
    if (testUser) {
      await adminAuth.deleteUser(testUser.uid);
    }
  }
});
