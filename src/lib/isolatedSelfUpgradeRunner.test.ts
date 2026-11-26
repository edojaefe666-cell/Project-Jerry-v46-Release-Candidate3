import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { runIsolatedSelfUpgradeTests } from './isolatedSelfUpgradeRunner.ts';

const secret = 'test-runner-shared-secret-with-at-least-32-bytes';
const input = { language: 'typescript', source: 'export const add = (a: number, b: number) => a + b;', testCode: 'if (add(2, 3) !== 5) throw new Error("bad add");' };
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const sign = (value: string) => createHmac('sha256', secret).update(value, 'utf8').digest('hex');

function signedFetch(resultOverrides: Record<string, unknown> = {}, signatureOverride?: string) {
  return async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    const expectedRequestSignature = sign(String(init?.body));
    assert.equal((init?.headers as Record<string, string>)['x-jerry-runner-request-signature'], expectedRequestSignature);
    const result = {
      protocolVersion: 1,
      requestId: request.requestId,
      sourceSha256: hash(input.source),
      testSha256: hash(input.testCode),
      sandboxed: true,
      networkDisabled: true,
      status: 'passed',
      exitCode: 0,
      durationMs: 42,
      summary: 'Assertions completed.',
      ...resultOverrides,
    };
    const raw = JSON.stringify(result);
    return new Response(raw, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-jerry-runner-response-signature': signatureOverride ?? sign(raw),
      },
    });
  };
}

test('fails closed when the isolated test runner is not configured', async () => {
  const result = await runIsolatedSelfUpgradeTests(input, { endpoint: '', secret: '' });
  assert.equal(result.status, 'unavailable');
  assert.match(result.report, /not configured/);
});

test('rejects non-HTTPS runner endpoints', async () => {
  const result = await runIsolatedSelfUpgradeTests(input, {
    endpoint: 'http://runner.example.test/execute',
    secret,
    fetchImpl: signedFetch() as typeof fetch,
  });
  assert.equal(result.status, 'unavailable');
  assert.match(result.report, /HTTPS/);
});

test('accepts only a signed sandbox attestation bound to the exact source and tests', async () => {
  const result = await runIsolatedSelfUpgradeTests(input, {
    endpoint: 'https://runner.example.test/execute',
    secret,
    requestId: 'req-test-1',
    fetchImpl: signedFetch() as typeof fetch,
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.requestId, 'req-test-1');
  assert.match(result.report, /hashes matched/);
});

test('rejects an unsigned or tampered runner response', async () => {
  const result = await runIsolatedSelfUpgradeTests(input, {
    endpoint: 'https://runner.example.test/execute',
    secret,
    fetchImpl: signedFetch({}, '0'.repeat(64)) as typeof fetch,
  });
  assert.equal(result.status, 'unavailable');
  assert.match(result.report, /signature is invalid/);
});

test('rejects runner attestations for different source or test hashes', async () => {
  const result = await runIsolatedSelfUpgradeTests(input, {
    endpoint: 'https://runner.example.test/execute',
    secret,
    fetchImpl: signedFetch({ sourceSha256: 'f'.repeat(64) }) as typeof fetch,
  });
  assert.equal(result.status, 'unavailable');
  assert.match(result.report, /did not match/);
});

test('does not accept a pass claim without network isolation attestation', async () => {
  const result = await runIsolatedSelfUpgradeTests(input, {
    endpoint: 'https://runner.example.test/execute',
    secret,
    fetchImpl: signedFetch({ networkDisabled: false }) as typeof fetch,
  });
  assert.equal(result.status, 'unavailable');
});

test('records a correctly signed non-zero exit as a real test failure', async () => {
  const result = await runIsolatedSelfUpgradeTests(input, {
    endpoint: 'https://runner.example.test/execute',
    secret,
    fetchImpl: signedFetch({ status: 'failed', exitCode: 1, summary: 'One assertion failed.' }) as typeof fetch,
  });
  assert.equal(result.status, 'failed');
  assert.match(result.report, /exit code 1/);
});

test('rejects redirects and unreachable runner responses', async () => {
  const result = await runIsolatedSelfUpgradeTests(input, {
    endpoint: 'https://runner.example.test/execute',
    secret,
    fetchImpl: (async () => { throw new Error('network unavailable'); }) as typeof fetch,
  });
  assert.equal(result.status, 'unavailable');
  assert.match(result.report, /could not be reached/);
});


test('rejects missing or oversized code before contacting the runner', async () => {
  let called = false;
  const fetchImpl = (async () => { called = true; return new Response('{}'); }) as typeof fetch;
  const missing = await runIsolatedSelfUpgradeTests({ ...input, testCode: '' }, {
    endpoint: 'https://runner.example.test/execute', secret, fetchImpl,
  });
  const oversized = await runIsolatedSelfUpgradeTests({ ...input, source: 'x'.repeat(256_001) }, {
    endpoint: 'https://runner.example.test/execute', secret, fetchImpl,
  });
  assert.equal(missing.status, 'unavailable');
  assert.equal(oversized.status, 'unavailable');
  assert.equal(called, false);
});
