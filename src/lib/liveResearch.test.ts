import test from 'node:test';
import assert from 'node:assert/strict';
import { searchLiveResearch } from './liveResearch';

test('returns bounded source references and strips unsafe URL components', async () => {
  let request: any;
  const result = await searchLiveResearch({
    query: 'Nigeria small business demand',
    apiKey: 'tavily-secret',
    fetchImpl: async (input, init) => {
      assert.equal(String(input), 'https://api.tavily.com/search');
      request = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ results: [
        { title: 'Market report', url: 'https://example.com/report#section', published_date: '2026-11-20', content: 'Evidence text' },
        { title: 'Duplicate', url: 'https://example.com/report', content: 'Duplicate evidence' },
        { title: 'Unsafe', url: 'javascript:alert(1)', content: 'Do not include' },
        { title: 'Credentials', url: 'https://user:pass@example.org/x', content: 'Do not include' },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.equal(request.api_key, 'tavily-secret');
  assert.equal(request.max_results, 5);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].url, 'https://example.com/report');
  assert.equal(result.sources[0].publishedDate, '2026-11-20T00:00:00.000Z');
});

test('rejects empty query and fails closed on provider errors', async () => {
  await assert.rejects(() => searchLiveResearch({ query: ' ', apiKey: 'key' }), /query/);
  await assert.rejects(() => searchLiveResearch({
    query: 'market', apiKey: 'key',
    fetchImpl: async () => new Response('unavailable', { status: 503 }),
  }), /HTTP 503/);
});

test('ignores malformed source records and caps content length', async () => {
  const result = await searchLiveResearch({
    query: 'test', apiKey: 'key', maxResults: 1,
    fetchImpl: async () => new Response(JSON.stringify({ results: [
      { title: 'Source', url: 'https://example.com', content: 'x'.repeat(7000) },
      { title: 'Second', url: 'https://example.net', content: 'second' },
    ] }), { status: 200 }),
  });
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].content.length, 6000);
});

test('owner cancellation aborts an active Tavily request', async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = searchLiveResearch({
    query: 'Nigeria SME market', apiKey: 'key', signal: controller.signal,
    fetchImpl: async (_input, init) => {
      calls++;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort(new Error('owner stop'));
  await assert.rejects(pending);
  assert.equal(calls, 1);
});
