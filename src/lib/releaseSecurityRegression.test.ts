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
  assert.match(persistedVerify, /runIsolatedSelfUpgradeTests\(/);
  assert.match(persistedVerify, /isolated\.status === 'passed' \? 'passed'/);
  assert.doesNotMatch(persistedVerify, /esbuild\.transform/);

  const directStart = end;
  const directEnd = server.indexOf("app.post('/api/jerry/execute-task'", directStart);
  const directVerify = server.slice(directStart, directEnd);
  assert.match(directVerify, /runIsolatedSelfUpgradeTests\(/);
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
  assert.match(server, /res.status(423)/);
});

test('emergency stop keeps internal wallet journal recovery separate from external execution', () => {
  const workerStart = server.indexOf('// Recover journal events after crashes');
  const workerEnd = server.indexOf('}', server.indexOf('if (process.env.JERRY_DISABLE_JOURNAL_OUTBOX_WORKER', workerStart));
  const worker = server.slice(workerStart, workerEnd);
  assert.match(worker, /drainWalletJournalOutbox/);
  assert.doesNotMatch(worker, /submit-transfer|broadcast|external execution/i);
});


test('owner emergency stop aborts in-flight isolated verification requests', () => {
  assert.match(server, /const activeIsolatedExecutions = new Set<AbortController>\(\)/);
  assert.match(server, /for \(const controller of activeIsolatedExecutions\) controller\.abort/);
  assert.match(server, /runIsolatedSelfUpgradeTests\(input, \{ signal: controller\.signal \}\)/);
  assert.match(server, /if \(controller\.signal\.aborted\)/);
});
