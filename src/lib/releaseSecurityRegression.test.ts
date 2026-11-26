import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');

test('all Jerry API endpoints require Firebase authentication', () => {
  const routes = [...server.matchAll(/app\.post\('(\/api\/jerry\/[^']+)'\s*,\s*([^\n]+)/g)].map((m) => ({ path: m[1], declaration: m[0] }));
  assert.ok(routes.length >= 18, `expected broad Jerry API coverage, found ${routes.length}`);
  for (const route of routes) {
    assert.match(route.declaration, /requireAuth/, `Jerry endpoint must require authentication: ${route.path}`);
  }
});

test('health endpoint remains intentionally public', () => {
  const match = server.match(/app\.get\('\/api\/health'[^\n]+/);
  assert.ok(match);
  assert.doesNotMatch(match[0], /requireAuth/);
});

test('production security middleware disables fingerprinting and sets browser hardening headers', () => {
  assert.match(server, /app\.disable\('x-powered-by'\)/);
  for (const header of [
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Cross-Origin-Opener-Policy',
    'Cross-Origin-Resource-Policy',
  ]) {
    assert.match(server, new RegExp(`setHeader\\('${header}'`), `missing security header: ${header}`);
  }
});

test('readiness is dependency-aware and does not expose database errors', () => {
  const start = server.indexOf("app.get('/api/ready'");
  const end = server.indexOf("const mergeClientWorkspaceState", start);
  const block = server.slice(start, end);
  assert.match(block, /db\.execute\(sql`select 1`\)/);
  assert.match(block, /res\.status\(503\)\.json\(\{ ok: false, database: 'unavailable' \}\)/);
  assert.doesNotMatch(block, /res\.status\(503\).*error|error\.message/);
});

test('production startup fails closed when the built SPA entrypoint is missing', () => {
  assert.match(server, /await fs\.access\(entrypoint\)/);
  assert.match(server, /Production build is missing/);
});

test('HTTP 500 handlers return generic errors instead of raw exception messages', () => {
  for (const match of server.matchAll(/res\.status\(500\)\.json\(\{ error: ([^}]+) \}\)/g)) {
    assert.doesNotMatch(match[1], /error\.message|message/);
  }
});

test('persistent memory export is owner-authenticated and cursor-paginated without a fixed record ceiling', () => {
  const start = server.indexOf("app.get('/api/memory/export'");
  const end = server.indexOf("app.get('/api/memory'", start);
  const route = server.slice(start, end);
  assert.match(route.split('=>')[0], /requireAuth/);
  assert.match(route, /decodeMemoryPageCursor/);
  assert.match(route, /encodeMemoryPageCursor/);
  assert.match(route, /limit: rawLimit \+ 1/);
  assert.match(route, /nextCursor/);
  assert.doesNotMatch(route, /limit: 1000/);
});

test('outgoing Bitcoin transfer staging is blocked while the emergency stop is engaged', () => {
  const route = server.match(/app\.post\('\/api\/wallet\/commands\/submit-transfer'[^\n]+/);
  assert.ok(route);
  assert.match(route[0], /requireAuth, requireExecutionEnabled/);
  const executionStub = server.match(/app\.post\('\/api\/jerry\/execute-task'[^\n]+/);
  assert.ok(executionStub);
  const start = server.indexOf("app.post('/api/jerry/execute-task'");
  const end = server.indexOf("app.post('/api/jerry/tasks/recover'", start);
  assert.match(server.slice(start, end), /res\.status\(501\)/);
});


test('security backup restore consumes its scoped approval and commits the replacement atomically', () => {
  const start = server.indexOf("app.post('/api/security/restore'");
  const end = server.indexOf("app.get('/api/health'", start);
  const route = server.slice(start, end);
  assert.match(route, /restoreSnapshotWithApproval\(/);
  assert.doesNotMatch(route, /consumeApproval\(/);
  assert.doesNotMatch(route, /importSnapshot\(/);
});
