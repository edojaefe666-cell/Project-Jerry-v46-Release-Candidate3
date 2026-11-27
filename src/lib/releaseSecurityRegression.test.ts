import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const securityUi = fs.readFileSync(path.join(root, 'src/components/SecurityApprovals.tsx'), 'utf8');
const jerryEngine = fs.readFileSync(path.join(root, 'src/lib/jerryEngine.ts'), 'utf8');

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


test('self-upgrade persistence ignores client-supplied security and test pass claims', () => {
  const start = server.indexOf("app.post('/api/jerry/self-upgrades'");
  const end = server.indexOf("app.post('/api/jerry/self-upgrades/:id/verify'", start);
  const route = server.slice(start, end);
  assert.match(route, /auditSelfProgrammedCode\(String\(proposal\.code\)\)/);
  assert.match(route, /securityAuditPassed: codeAudit\.passed/);
  assert.match(route, /testStatus: 'pending'/);
  assert.doesNotMatch(route, /testStatus: proposal\.testStatus/);
  assert.doesNotMatch(route, /Boolean\(proposal\.securityAuditPassed\)/);
});

test('self-upgrade verification only promotes status from the isolated runner attestation', () => {
  const start = server.indexOf("app.post('/api/jerry/self-upgrades/:id/verify'");
  const end = server.indexOf("app.post('/api/jerry/verify-upgrade'", start);
  const persistedVerify = server.slice(start, end);
  assert.match(persistedVerify, /runIsolatedTestsWithStop\(/);
  assert.match(persistedVerify, /isolated\.status === 'passed' \? 'passed'/);
  assert.doesNotMatch(persistedVerify, /esbuild\.transform/);

  const directStart = end;
  const directEnd = server.indexOf("app.post('/api/jerry/execute-task'", directStart);
  const directVerify = server.slice(directStart, directEnd);
  assert.match(directVerify, /runIsolatedTestsWithStop\(/);
  assert.match(directVerify, /isolated\.status === 'passed' \? 'passed'/);
  assert.doesNotMatch(directVerify, /esbuild\.transform/);
});


test('security UI creates restore approvals with the exact immutable operation scope', () => {
  assert.match(securityUi, /action === 'high_impact_change' \? \{ scope: \{ operation: 'security_backup_restore' \} \}/);
});


test('self-upgrade verification uses the signed isolated runner rather than syntax-only checks', () => {
  assert.match(server, /runIsolatedSelfUpgradeTests\(/);
  assert.match(server, /isolated\.status === 'passed' \? 'passed'/);
  assert.doesNotMatch(server, /syntax transformation passed via esbuild/);
});


test('self-upgrade deployment gate requires explicit owner approval, not merely completed tests', () => {
  const start = jerryEngine.indexOf('export function canDeploySelfUpgrade');
  const end = jerryEngine.indexOf('export function executeRevenueTask', start);
  const gate = jerryEngine.slice(start, end);
  assert.match(gate, /approvalStatus !== 'approved'/);
  assert.match(gate, /explicit owner approval is required/);
});



test('emergency stop blocks every isolated self-upgrade test execution path', () => {
  const persisted = server.split('\n').find((line) => line.includes("app.post('/api/jerry/self-upgrades/:id/verify'"));
  const direct = server.split('\n').find((line) => line.includes("app.post('/api/jerry/verify-upgrade'"));
  assert.ok(persisted, 'persisted proposal verification route must exist');
  assert.ok(direct, 'direct verification route must exist');
  assert.match(persisted, /requireAuth, requireExecutionEnabled/);
  assert.match(direct, /requireAuth, requireExecutionEnabled/);
  assert.match(server, /const requireExecutionEnabled =/);
  assert.match(server, /res\.status\(423\)/);
});

test('emergency stop keeps internal wallet journal recovery separate from external execution', () => {
  const workerStart = server.indexOf('// Recover journal events after crashes');
  const workerEnd = server.indexOf('\n}\n\nstartServer()', workerStart);
  assert.ok(workerEnd > workerStart, 'wallet outbox worker block must have a stable end boundary');
  const worker = server.slice(workerStart, workerEnd);
  assert.match(worker, /drainOutboxWithStop/);
  assert.match(worker, /executionRegistry\.register\(\)/);
  assert.match(worker, /drainWalletJournalOutbox\(undefined, 50, execution\.signal\)/);
  assert.match(worker, /execution\.release\(\)/);
  assert.match(worker, /let outboxDrainInFlight = false/);
  assert.match(worker, /if \(outboxDrainInFlight\) return/);
  assert.match(worker, /outboxDrainInFlight = true/);
  assert.match(worker, /outboxDrainInFlight = false/);
  assert.doesNotMatch(worker, /submit-transfer|broadcast|external execution/i);
});


test('owner emergency stop uses the shared execution registry for in-flight verification', () => {
  assert.match(server, /new ExecutionRegistry\(isEmergencyStopActive\(\)\)/);
  assert.match(server, /executionRegistry\.setStopped\(body\.action === 'stop'/);
  assert.match(server, /runIsolatedSelfUpgradeTests\(input, \{ signal: execution\.signal \}\)/);
  assert.match(server, /if \(execution\.signal\.aborted\)/);
  assert.match(server, /execution\.release\(\)/);
});

test('Jerry Brain provider requests are cancellable on stop and client disconnect', () => {
  const start = server.indexOf("app.post('/api/brain/generate'");
  const end = server.indexOf("// Legacy state routes", start);
  const route = server.slice(start, end);
  assert.match(route, /executionRegistry\.register\(\)/);
  assert.match(route, /signal: execution\.signal/);
  assert.match(route, /res\.once\('close', cancelOnDisconnect\)/);
  assert.match(route, /execution\.cancel\('Jerry Brain client disconnected'\)/);
  assert.match(route, /execution\.release\(\)/);
});

test('emergency stop blocks model-provider and financial mutation routes', () => {
  const guardedRoutes = [
    '/api/brain/generate', '/api/jerry/chat', '/api/jerry/plan-goal',
    '/api/jerry/vision', '/api/jerry/tts', '/api/jerry/transcribe',
    '/api/jerry/scan-opportunities', '/api/jerry/discover-daily-ways',
    '/api/wallet/commands/record-income', '/api/wallet/sync-onchain',
    '/api/wallet/financial-truth/backfill', '/api/wallet/commands/reconcile-tx',
  ];
  for (const route of guardedRoutes) {
    const declaration = server.split('\n').find((line) => line.includes("app.post('" + route + "'"));
    assert.ok(declaration, 'missing route declaration: ' + route);
    assert.match(declaration, /requireExecutionEnabled/, 'emergency stop must guard: ' + route);
  }
});

test('Vision, TTS, and transcription provider calls are cancellable on stop and disconnect', () => {
  for (const routePath of ['/api/jerry/vision','/api/jerry/tts','/api/jerry/transcribe']) {
    const start=server.indexOf(`app.post('${routePath}'`);
    const end=server.indexOf('  // Jerry Proactive Opportunity Radar.',start);
    const route=server.slice(start,end);
    assert.ok(start>=0,`missing route ${routePath}`);
    assert.match(route,/executionRegistry\\.register\\(\\)/);
    assert.match(route,/signal:execution\\.signal/);
    assert.match(route,/res\\.once\\('close',cancelOnDisconnect\\)/);
    assert.match(route,/execution\\.cancel\\(/);
    assert.match(route,/execution\\.release\\(\\)/);
  }
});
