import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRequestHeaders } from './apiRequestHeaders';

test('preserves headers already present on a Request', () => {
  const request = new Request('https://example.test/api/tasks', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer existing-token',
      'Content-Type': 'application/json',
      'X-Request-Trace': 'trace-123',
    },
    body: JSON.stringify({ task: 'test' }),
  });

  const headers = mergeRequestHeaders(request);
  assert.equal(headers.get('authorization'), 'Bearer existing-token');
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(headers.get('x-request-trace'), 'trace-123');
});

test('explicit init headers override matching Request headers and preserve other headers', () => {
  const request = new Request('https://example.test/api/tasks', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer old-token',
      'X-Request-Trace': 'trace-123',
    },
    body: 'payload',
  });

  const headers = mergeRequestHeaders(request, {
    Authorization: 'Bearer refreshed-token',
    'Idempotency-Key': 'jerry-test-key',
  });
  assert.equal(headers.get('authorization'), 'Bearer refreshed-token');
  assert.equal(headers.get('x-request-trace'), 'trace-123');
  assert.equal(headers.get('idempotency-key'), 'jerry-test-key');
});

test('supports URL and string inputs with explicit headers', () => {
  assert.equal(mergeRequestHeaders(new URL('https://example.test')).get('accept'), null);
  assert.equal(mergeRequestHeaders('/api/tasks', { Accept: 'application/json' }).get('accept'), 'application/json');
});

test('preserves Request method and body when rebasing its URL', async () => {
  const request = new Request('https://assets.localhost/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Request-Trace': 'trace-456' },
    body: JSON.stringify({ task: 'persist request semantics' }),
  });

  const rebased = resolveRequestForFetch(
    request,
    'https://backend.example/api/tasks',
  );
  assert.ok(rebased instanceof Request);
  assert.equal(rebased.url, 'https://backend.example/api/tasks');
  assert.equal(rebased.method, 'POST');
  assert.equal(rebased.headers.get('content-type'), 'application/json');
  assert.equal(rebased.headers.get('x-request-trace'), 'trace-456');
  assert.deepEqual(await rebased.json(), { task: 'persist request semantics' });
});

test('keeps the original Request when its URL does not need rebasing', () => {
  const request = new Request('https://backend.example/api/tasks', { method: 'GET' });
  assert.equal(resolveRequestForFetch(request, request.url), request);
});
