import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeImageWithModelFallback } from './multimodalAdapters';

const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const image = { prompt: 'Read this image', mimeType: 'image/png', base64Data: 'aGVsbG8=', configuration: { google: { apiKey: 'g-key', model: 'gemini-test' } } };

test('sends image bytes to Google using a server-side API key header', async () => {
  let url = '';
  let headers: HeadersInit | undefined;
  let request: any;
  const result = await analyzeImageWithModelFallback({ ...image, fetchImpl: async (input, init) => {
    url = String(input); headers = init?.headers; request = JSON.parse(String(init?.body));
    return response({ candidates: [{ content: { parts: [{ text: '{"analysis":"read"}' }] } }] });
  } });
  assert.equal(result.provider, 'google');
  assert.equal(result.text, '{"analysis":"read"}');
  assert.match(url, /gemini-test/);
  assert.equal(new Headers(headers).get('x-goog-api-key'), 'g-key');
  assert.equal(request.contents[0].parts[0].inlineData.data, 'aGVsbG8=');
  assert.doesNotMatch(url, /g-key/);
});

test('falls back to OpenAI vision when Google fails', async () => {
  let calls = 0;
  const result = await analyzeImageWithModelFallback({ ...image, configuration: {
    google: { apiKey: 'g-key' }, openai: { apiKey: 'o-key', model: 'vision-test' },
  }, fetchImpl: async (_input, init) => {
    calls += 1;
    if (calls === 1) return response({}, 503);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.messages[0].content[1].image_url.url, 'data:image/png;base64,aGVsbG8=');
    return response({ choices: [{ message: { content: 'Image read' } }] });
  } });
  assert.equal(calls, 2);
  assert.equal(result.provider, 'openai');
  assert.equal(result.text, 'Image read');
});

test('rejects unsupported media and malformed or oversized payloads before network access', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return response({}); };
  await assert.rejects(() => analyzeImageWithModelFallback({ ...image, mimeType: 'text/html', fetchImpl }), /Unsupported image/);
  await assert.rejects(() => analyzeImageWithModelFallback({ ...image, base64Data: 'not base64!', fetchImpl }), /Invalid or oversized/);
  assert.equal(called, false);
});

test('fails closed when no vision provider is configured', async () => {
  await assert.rejects(() => analyzeImageWithModelFallback({ ...image, configuration: {} }), /No vision provider/);
});
