import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

test('financial capability source does not reintroduce unsupported EVM/USDC/USDT concepts', () => {
  const sources = [
    read('server.ts'),
    read('src/lib/seedData.ts'),
    read('src/lib/jerryEngine.ts'),
    read('src/lib/types.ts'),
    read('src/components/OverviewHub.tsx'),
    read('src/components/TasksRecovery.tsx'),
    read('src/components/WalletDashboard.tsx'),
  ].join('\n');

  for (const token of ['USDC', 'USDT', 'Ethereum', 'Polygon', 'EVM']) {
    assert.equal(sources.includes(token), false, `unsupported financial token leaked into canonical source: ${token}`);
  }
});

test('owner-sensitive daily discovery endpoint remains Firebase-authenticated', () => {
  const server = read('server.ts');
  const route = server.match(/app\.post\('\/api\/jerry\/discover-daily-ways'[\s\S]{0,120}async/);
  assert.ok(route, 'daily discovery route must exist');
  assert.match(route[0], /requireAuth/, 'daily discovery must require owner authentication');
});

test('every non-public API route is protected by the Firebase authentication boundary', () => {
  const server = read('server.ts');
  const routePattern = /app\.(?:get|post|put|patch|delete)\(\s*['"](\/api\/[^'"]+)['"]/g;
  const publicRoutes = new Set(['/api/health', '/api/ready']);
  const routes: Array<{ route: string; start: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = routePattern.exec(server)) !== null) {
    routes.push({ route: match[1], start: match.index });
  }

  assert.ok(routes.length > 0, 'expected at least one /api route in server.ts');

  for (let index = 0; index < routes.length; index += 1) {
    const { route, start } = routes[index];
    if (publicRoutes.has(route)) continue;
    const nextStart = routes[index + 1]?.start ?? server.length;
    const declaration = server.slice(start, nextStart);
    const handlerBoundary = declaration.search(/=>|\bfunction\b/);
    const middlewareHeader = handlerBoundary >= 0 ? declaration.slice(0, handlerBoundary) : declaration;
    assert.match(middlewareHeader, /\brequireAuth\b/, `API route must require Firebase authentication: ${route}`);
  }
});

test('security UI routes have server implementations and authentication boundaries', () => {
  const server = read('server.ts');
  const required = [
    "app.get('/api/security/approvals'",
    "app.post('/api/security/approvals'",
    "app.post('/api/security/approvals/:id/decision'",
    "app.get('/api/security/contacts'",
    "app.post('/api/security/contacts'",
    "app.post('/api/security/contacts/:id/status'",
    "app.get('/api/security/audit'",
    "app.get('/api/security/audit/integrity'",
    "app.get('/api/security/session'",
    "app.post('/api/security/sessions/revoke-all'",
    "app.post('/api/security/backup'",
    "app.post('/api/security/restore'",
  ];
  for (const route of required) assert.ok(server.includes(route), `missing security route: ${route}`);
  for (const route of required) {
    const start = server.indexOf(route);
    const block = server.slice(start, start + 1800);
    assert.match(block, /requireAuth/, `security route must require owner authentication: ${route}`);
  }
});


test('voice transcription capability is wired from the Voice & Vision UI to the authenticated server endpoint', () => {
  const component = read('src/components/VoiceVisionStudio.tsx');
  const server = read('server.ts');
  assert.match(component, /apiFetch\('\/api\/jerry\/transcribe'/, 'Voice UI must call the transcription endpoint');
  assert.match(component, /MediaRecorder|SpeechRecognition/, 'Voice UI must capture spoken input');
  assert.match(component, /audioBase64/, 'Voice UI must send captured audio to the transcription service');
  assert.match(server, /app\.post\('\/api\/jerry\/transcribe', requireAuth/, 'transcription endpoint must remain authenticated');
});
