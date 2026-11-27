import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const securityUi = fs.readFileSync(path.join(root, 'src/components/SecurityApprovals.tsx'), 'utf8');
const jerryEngine = fs.readFileSync(path.join(root, 'src/lib/jerryEngine.ts'), 'utf8');
const walletOutbox = fs.readFileSync(path.join(root, 'src/db/walletJournalOutbox.ts'), 'utf8');
const sharedApprovalStore = fs.readFileSync(path.join(root, 'src/db/approvalStore.ts'), 'utf8');
const sharedRateLimitStore = fs.readFileSync(path.join(root, 'src/db/rateLimitStore.ts'), 'utf8');
const sharedProviderOperationStore = fs.readFileSync(path.join(root, 'src/db/providerOperationStore.ts'), 'utf8');
const multimodalAdapters = fs.readFileSync(path.join(root, 'src/lib/multimodalAdapters.ts'), 'utf8');
const opportunityRadar = fs.readFileSync(path.join(root, 'src/lib/opportunityRadar.ts'), 'utf8');
const providerUsageStore = fs.readFileSync(path.join(root, 'src/db/providerUsageStore.ts'), 'utf8');
const providerCostStore = fs.readFileSync(path.join(root, 'src/db/providerCostStore.ts'), 'utf8');
const providerAdapters = fs.readFileSync(path.join(root, 'src/lib/providerAdapters.ts'), 'utf8');
const providerSpendPolicy = fs.readFileSync(path.join(root, 'src/lib/providerSpendPolicy.ts'), 'utf8');
const environmentExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const apiClient = fs.readFileSync(path.join(root, 'src/lib/apiClient.ts'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
const androidManifest = fs.readFileSync(path.join(root, 'android-native/app/src/main/AndroidManifest.xml'), 'utf8');
const androidPermissionManager = fs.readFileSync(path.join(root, 'android-native/app/src/main/java/com/projectjerry/android/permissions/JerryPermissionManager.kt'), 'utf8');
const androidMainActivity = fs.readFileSync(path.join(root, 'android-native/app/src/main/java/com/projectjerry/android/ui/MainActivity.kt'), 'utf8');
const authContext = fs.readFileSync(path.join(root, 'src/lib/AuthContext.tsx'), 'utf8');
const appComponent = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
const androidAuthClient = fs.readFileSync(path.join(root, 'android-native/app/src/main/res/values/strings.xml'), 'utf8');

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

test('container liveness and readiness probes are public, bounded, and non-disclosing', () => {
  const liveness = server.match(/app\.get\('\/healthz'[\s\S]*?\n  \}\);/);
  assert.ok(liveness, 'liveness probe must exist');
  assert.match(liveness[0], /status: 'ok'/);
  assert.doesNotMatch(liveness[0], /db\.execute|readSharedExecutionControl/);

  const readiness = server.match(/app\.get\('\/readyz'[\s\S]*?\n  \}\);/);
  assert.ok(readiness, 'readiness probe must exist');
  assert.match(readiness[0], /JERRY_OWNER_UID/);
  assert.match(readiness[0], /db\.execute\(sql\`SELECT 1\`\)/);
  assert.match(readiness[0], /to_regclass\('public\.app_sql_migrations'\)/);
  assert.match(readiness[0], /0017_provider_token_reservations\.sql/);
  assert.match(readiness[0], /readSharedExecutionControl/);
  assert.match(readiness[0], /status\(503\)\.json\(\{ status: 'not_ready' \}\)/);
  assert.doesNotMatch(readiness[0], /error\.message|SQL_HOST|JERRY_OWNER_UID.*json/);
});

test('Jerry UI displays authentication errors instead of silently hiding sign-in failures', () => {
  assert.match(appComponent, /authError/);
  assert.match(appComponent, /role="alert"/);
});

test('Android app uses native Google identity and exchanges the ID token with Firebase Auth', () => {
  assert.match(androidMainActivity, /CredentialManager\.create/);
  assert.match(androidMainActivity, /GetGoogleIdOption\.Builder/);
  assert.match(androidMainActivity, /default_web_client_id/);
  assert.match(androidMainActivity, /@JavascriptInterface/);
  assert.match(androidMainActivity, /jerry-native-auth-result/);
  assert.match(androidAuthClient, /default_web_client_id/);
  assert.match(authContext, /signInWithCredential/);
  assert.match(authContext, /GoogleAuthProvider\.credential\(idToken\)/);
  assert.match(authContext, /window\.JerryNativeAuth\?\.signInWithGoogle/);
  assert.ok(authContext.indexOf('window.JerryNativeAuth?.signInWithGoogle') < authContext.indexOf('signInWithPopup'),
    'Android must use native Credential Manager rather than popup auth');
});

test('Android WebView grants microphone only to Jerry local origin after runtime approval', () => {
  assert.match(androidMainActivity, /origin\.scheme == "https"/);
  assert.match(androidMainActivity, /origin\.host == "localhost"/);
  assert.match(androidMainActivity, /request\.resources\.all/);
  assert.match(androidMainActivity, /RESOURCE_AUDIO_CAPTURE/);
  assert.match(androidMainActivity, /audioPermissionLauncher\.launch\(Manifest\.permission\.RECORD_AUDIO\)/);
  assert.match(androidMainActivity, /request\.deny\(\)/);
  assert.match(androidMainActivity, /onPermissionRequestCanceled/);
  assert.match(androidMainActivity, /pendingAudioPermission\?\.deny\(\)/);
});

test('Android requests only currently justified runtime permissions', () => {
  assert.doesNotMatch(androidManifest, /android\.permission\.(READ_CONTACTS|READ_PHONE_STATE)/);
  assert.doesNotMatch(androidPermissionManager, /Manifest\.permission\.(READ_CONTACTS|READ_PHONE_STATE)/);
  assert.match(androidManifest, /android\.permission\.RECORD_AUDIO/);
  assert.match(androidPermissionManager, /Manifest\.permission\.RECORD_AUDIO/);
  assert.match(androidPermissionManager, /Build\.VERSION\.SDK_INT <= 30/);
});

test('all hosted AI and live research paths default to no paid spending before verified revenue', () => {
  assert.match(providerSpendPolicy, /JERRY_PAID_SERVICES_ENABLED !== '1'/);
  assert.match(providerSpendPolicy, /verified revenue/);
  assert.match(providerAdapters, /assertHostedProviderSpendEnabled\(\`\$\{route\.provider\}\/\$\{route\.model\}\`\)/);
  assert.ok((multimodalAdapters.match(/assertHostedProviderSpendEnabled/g) ?? []).length >= 3,
    'vision, speech and transcription routes must all enforce the paid-services gate');
  assert.match(opportunityRadar, /assertHostedProviderSpendEnabled\('Tavily live research'\)/);
  assert.match(server, /assertHostedProviderSpendEnabled\('Google Gemini direct SDK'\)/);
  assert.match(environmentExample, /JERRY_PAID_SERVICES_ENABLED=0/);
});

test('Jerry workspace is gated behind a valid authenticated owner session', () => {
  assert.match(appSource, /loading: authLoading/);
  assert.match(appSource, /if \(authLoading\)/);
  assert.match(appSource, /if \(!user \|\| !idToken\)/);
  assert.match(appSource, /Sign in securely with Google/);
  assert.match(appSource, /Workspace data and protected actions are unavailable until authentication succeeds/);
});

test('Android API client refuses the placeholder backend instead of silently targeting an invalid host', () => {
  assert.match(apiClient, /hostname\.endsWith\('\.invalid'\)/);
  assert.match(apiClient, /window\.location\.origin === 'https:\/\/localhost'/);
  assert.match(apiClient, /Jerry backend is not connected/);
  assert.match(apiClient, /verified HTTPS JERRY_BACKEND_ORIGIN/);
  assert.match(apiClient, /if \(!API_BASE\) return input/);
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


test('Bitcoin transfer staging is crash-recoverable and cannot broadcast funds', () => {
  const start = server.indexOf("app.post('/api/wallet/commands/submit-transfer'");
  const end = server.indexOf('// Real Live Bitcoin Market Price', start);
  const route = server.slice(start, end);
  assert.match(route, /runIdempotentWorkspaceCommand/);
  assert.match(route, /reserveApproval\(approvalId, 'bitcoin_transfer'/);
  assert.match(route, /finalizeApprovalReservation\(approvalId, uid, reservationId\)/);
  assert.match(route, /pending_approval/);
  assert.match(route, /Idempotency-Key/);
  assert.doesNotMatch(route, /broadcast|sendRawTransaction|sendTransaction|submitTransaction/i,
    'approval and staging must never initiate an external Bitcoin transfer');
  assert.match(route, /retry the same idempotency key/i,
    'a committed reservation must be reconciled using its original operation key');
});

test('security backup restore consumes its scoped approval and commits the replacement atomically', () => {
  const start = server.indexOf("app.post('/api/security/restore'");
  const end = server.indexOf("app.get('/api/health'", start);
  const route = server.slice(start, end);
  assert.match(route, /securityStore\.validateSnapshot\(snapshot\)/);
  assert.match(route, /await restoreSharedSecuritySnapshot\(snapshot/);
  assert.doesNotMatch(route, /restoreSnapshotWithApproval\(/);
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


test('shared execution leases serialize owner stop with active ledger side effects', () => {
  const control = fs.readFileSync(path.join(root, 'src/db/executionControl.ts'), 'utf8');
  const outbox = fs.readFileSync(path.join(root, 'src/db/walletJournalOutbox.ts'), 'utf8');
  assert.match(control, /FOR SHARE/);
  assert.match(control, /withSharedExecutionLease/);
  assert.match(outbox, /withSharedExecutionLease\(async/);
  assert.match(outbox, /ensureWalletTransactionJournaled/);
  assert.match(outbox, /const interrupted = signal\?\.aborted === true/);
  assert.match(outbox, /const remainingIds = claimedRows\.slice\(index\)\.map/);
  assert.match(outbox, /available_at = now\(\),\s+updated_at = now\(\)/);
  assert.match(outbox, /if \(interrupted\)[\s\S]*?break;/,
    'an emergency stop must immediately release the current and remaining claims instead of waiting for stale-claim recovery');
});


test('wallet outbox claims use fencing tokens so stale workers cannot finalize reclaimed rows', () => {
  const outbox = fs.readFileSync(path.join(root, 'src/db/walletJournalOutbox.ts'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'drizzle/0011_wallet_outbox_claim_fencing.sql'), 'utf8');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS claim_token uuid/);
  assert.match(outbox, /const claimToken = randomUUID\(\)/);
  assert.match(outbox, /claim_token = \$\$\{uid \? 3 : 2\}/);
  assert.match(outbox, /RETURNING[\s\S]*?o\.claim_token/);
  assert.match(outbox, /WHERE id = \$1 AND status = 'processing' AND claim_token = \$2/);
  assert.match(outbox, /if \(finalized\.rowCount === 1\) processed\+\+/);
  assert.match(outbox, /if \(retry\.rowCount === 1\) \{[\s\S]*?failed\+\+[\s\S]*?retried\+\+/);
  assert.match(outbox, /SET status = 'processed', claim_token = NULL/);
});


test('AI-enhanced owner learning is persisted only inside the shared execution lease', () => {
  const start = server.indexOf("app.post('/api/jerry/teach'");
  const end = server.indexOf("app.post('/api/jerry/self-program'", start);
  const route = server.slice(start, end);
  const lease = route.indexOf('withSharedExecutionLease(() => saveMemoryEntryForUser(');
  assert.ok(lease >= 0, 'learning persistence must be fenced by the shared emergency-stop lease');
  assert.ok(route.indexOf('saveMemoryEntryForUser', lease) > lease);
  assert.match(route.split('=>')[0], /requireAuth, requireExecutionEnabled/);
});

test('isolated self-upgrade runner holds a shared lease until verification exits', () => {
test('isolated self-upgrade verification holds the shared stop lease until the runner exits', () => {
  const start = server.indexOf('const runIsolatedTestsWithStop =');
  const end = server.indexOf('// Provider calls consume quota', start);
  const helper = server.slice(start, end);
  assert.match(helper, /withSharedExecutionLease\(async \(\) =>/);
  assert.ok(helper.indexOf('withSharedExecutionLease') < helper.indexOf('runIsolatedSelfUpgradeTests(input'),
    'the runner must execute before the shared lease is released');
  assert.match(helper, /execution\.signal\.aborted/);
  assert.match(helper, /execution\.release\(\)/);
});

test('owner emergency stop uses the shared execution registry for in-flight verification', () => {
  assert.match(server, /new ExecutionRegistry\(isEmergencyStopActive\(\)\)/);
  assert.match(server, /executionRegistry\.setStopped\([\s\S]*body\.action === 'stop'/);
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
    assert.match(route,/executionRegistry\.register\(\)/);
    assert.match(route,/signal:execution\.signal/);
    assert.match(route,/res\.once\('close',cancelOnDisconnect\)/);
    assert.match(route,/execution\.cancel\(/);
    assert.match(route,/execution\.release\(\)/);
  }
});

test('Opportunity Radar and Learning cancel provider work on emergency stop or client disconnect', () => {
  for (const routePath of ['/api/jerry/scan-opportunities', '/api/jerry/teach']) {
    const start = server.indexOf(`app.post('${routePath}'`);
    const end = server.indexOf('\n  // Jerry ', start + 1);
    const route = server.slice(start, end > start ? end : server.length);
    assert.ok(start >= 0, `missing route ${routePath}`);
    assert.match(route, /executionRegistry\.register\(\)/);
    assert.match(route, /res\.once\('close', cancelOnDisconnect\)/);
    assert.match(route, /execution\.cancel\(/);
    assert.match(route, /execution\.release\(\)/);
    assert.match(route, /signal: execution\.signal/);
  }
});




test('Jerry chat, goal planning and business assessment cancel provider work on stop or disconnect', () => {
  const routes = [
    ['/api/jerry/chat', '\n  // Jerry Goal Engine'],
    ['/api/jerry/plan-goal', '\n  // Jerry Business: model-assisted opportunity assessment'],
    ['/api/jerry/assess-opportunity', '\n  // Vision and Voice use the shared execution registry'],
    ['/api/jerry/self-program', '\n  // Persist a generated self-upgrade proposal'],
  ] as const;
  for (const [routePath, endMarker] of routes) {
    const start = server.indexOf(`app.post('${routePath}'`);
    const end = server.indexOf(endMarker, start);
    const route = server.slice(start, end > start ? end : server.length);
    assert.ok(start >= 0, `missing provider route: ${routePath}`);
    assert.match(route.split('=>')[0], /requireExecutionEnabled/);
    assert.match(route, /executionRegistry\.register\(\)/);
    assert.match(route, /signal: execution\.signal/);
    assert.match(route, /res\.once\('close', cancelOnDisconnect\)/);
    assert.match(route, /execution\.cancel\(/);
    assert.match(route, /execution\.signal\.aborted \|\| isEmergencyStopActive\(\)/);
    assert.match(route, /execution\.release\(\)/);
  }
});

test('human insight and internet growth Gemini calls abort on emergency stop or client disconnect', () => {
  for (const routePath of ['/api/jerry/learn-human-insight', '/api/jerry/learn-internet-growth']) {
    const start = server.indexOf(`app.post('${routePath}'`);
    const end = server.indexOf('    } finally {', start);
    const route = server.slice(start, end > start ? end + 180 : server.length);
    assert.ok(start >= 0, `missing learning route: ${routePath}`);
    assert.match(route, /executionRegistry\.register\(\)/);
    assert.match(route, /abortSignal: execution\.signal/);
    assert.match(route, /res\.once\('close', cancelOnDisconnect\)/);
    assert.match(route, /execution\.cancel\(/);
    assert.match(route, /execution\.signal\.aborted \|\| isEmergencyStopActive\(\)/);
    assert.match(route, /execution\.release\(\)/);
  }
});


test('daily opportunity discovery aborts Gemini generation on emergency stop or client disconnect', () => {
  const start = server.indexOf("app.post('/api/jerry/discover-daily-ways'");
  const end = server.indexOf('\n  // Jerry Daily Human Understanding:', start);
  const route = server.slice(start, end > start ? end : server.length);
  assert.ok(start >= 0, 'missing daily opportunity discovery route');
  assert.match(route, /executionRegistry\.register\(\)/);
  assert.match(route, /abortSignal: execution\.signal/);
  assert.match(route, /res\.once\('close', cancelOnDisconnect\)/);
  assert.match(route, /execution\.cancel\(/);
  assert.match(route, /execution\.release\(\)/);
  assert.match(route, /isEmergencyStopActive\(\)/);
});


test('financial workspace mutations hold the shared stop lease through durable state changes', () => {
  const decisionStart = server.indexOf("app.post('/api/approvals/:id/decision'");
  const decisionEnd = server.indexOf("app.post('/api/wallet/commands/record-income'", decisionStart);
  const decisionRoute = server.slice(decisionStart, decisionEnd);
  assert.match(decisionRoute.split('=>')[0], /requireExecutionEnabled/);
  assert.match(decisionRoute, /withSharedExecutionLease\(\(\) => runIdempotentWorkspaceCommand/);

  const incomeStart = server.indexOf("app.post('/api/wallet/commands/record-income'");
  const transferStart = server.indexOf("app.post('/api/wallet/commands/submit-transfer'", incomeStart);
  const incomeRoute = server.slice(incomeStart, transferStart);
  assert.match(incomeRoute, /withSharedExecutionLease\(\(\) => runIdempotentWorkspaceCommand/);

  const transferEnd = server.indexOf('// Real Live Bitcoin Market Price', transferStart);
  const transferRoute = server.slice(transferStart, transferEnd);
  const leaseStart = transferRoute.indexOf('withSharedExecutionLease(async () =>');
  const finalize = transferRoute.indexOf('securityStore.finalizeApprovalReservation', leaseStart);
  const leaseClose = transferRoute.indexOf('return { ...commandResult, finalizedApproval };', leaseStart);
  assert.ok(leaseStart >= 0 && finalize > leaseStart && leaseClose > finalize,
    'transfer reservation finalization must remain inside the shared execution lease');
  assert.match(transferRoute, /runIdempotentWorkspaceCommand/,
    'transfer staging must persist a replay receipt in the same PostgreSQL transaction as the workspace mutation');
  assert.match(transferRoute, /securityStore\.reserveApproval\(approvalId, 'bitcoin_transfer'/,
    'transfer staging must reserve the exact scoped owner approval');
  assert.match(transferRoute, /status: 'pending_approval'/,
    'approval only stages a pending transfer and must not settle it');
  assert.doesNotMatch(transferRoute, /broadcast|sendRawTransaction|sendTransaction/i,
    'approval and staging must never broadcast an external Bitcoin transfer');

  const reconcileStart = server.indexOf("app.post('/api/wallet/commands/reconcile-tx'");
  const reconcileEnd = server.indexOf("app.post('/api/jerry/chat'", reconcileStart);
  const reconcileRoute = server.slice(reconcileStart, reconcileEnd);
  assert.match(reconcileRoute, /withSharedExecutionLease\(async \(\) =>/);
  assert.ok(reconcileRoute.indexOf('ensureWalletTransactionJournaled') > reconcileRoute.indexOf('withSharedExecutionLease'),
    'journal synchronization must complete before releasing the reconciliation lease');
});


test('stale task recovery holds the shared execution lease through its durable state repair', () => {
  const start = server.indexOf("app.post('/api/jerry/tasks/recover'");
  const end = server.indexOf("app.post('/api/jerry/discover-daily-ways'", start);
  const route = server.slice(start, end);
  assert.match(route.split('=>')[0], /requireAuth, requireExecutionEnabled/);
  assert.match(route, /withSharedExecutionLease\(\(\) => recoverStaleTaskExecutions\(uid, email\)\)/);
});

test('approved destructive workspace reset cannot race the shared emergency stop', () => {
  const start = server.indexOf("app.post('/api/state/reset'");
  const end = server.indexOf('// Cloud SQL PostgreSQL Protected Routes', start);
  const route = server.slice(start, end);
  assert.match(route.split('=>')[0], /requireAuth, requireExecutionEnabled/);
  const lease = route.indexOf('withSharedExecutionLease(async () =>');
  const reset = route.indexOf('runIdempotentWorkspaceCommand', lease);
  const finalize = route.indexOf('securityStore.finalizeApprovalReservation', lease);
  assert.ok(lease >= 0 && reset > lease && finalize > reset,
    'workspace reset intent and approval finalization must stay inside the shared lease');
  assert.match(route, /workspace-reset:\$\{approvalId\}/,
    'the durable reset receipt must be bound to the exact owner approval');
  assert.match(route, /'workspace-reset:v1'/,
    'the reset idempotency record must bind a versioned command');
  assert.match(route, /resetCommitted = true/,
    'a committed workspace reset must never release its reserved approval on recovery');
});

  const start = server.indexOf('const runIsolatedTestsWithStop =');
  const end = server.indexOf('// Provider calls consume quota', start);
  const helper = server.slice(start, end);
  assert.match(helper, /withSharedExecutionLease\(async \(\) =>/);
  assert.ok(helper.indexOf('withSharedExecutionLease') < helper.indexOf('runIsolatedSelfUpgradeTests(input'),
    'the runner must execute before the shared lease is released');
  assert.match(helper, /execution\.signal\.aborted/);
  assert.match(helper, /execution\.release\(\)/);
});

test('owner emergency stop uses the shared execution registry for in-flight verification', () => {
  assert.match(server, /new ExecutionRegistry\(isEmergencyStopActive\(\)\)/);
  assert.match(server, /executionRegistry\.setStopped\([\s\S]*body\.action === 'stop'/);
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
    assert.match(route,/executionRegistry\.register\(\)/);
    assert.match(route,/signal:execution\.signal/);
    assert.match(route,/res\.once\('close',cancelOnDisconnect\)/);
    assert.match(route,/execution\.cancel\(/);
    assert.match(route,/execution\.release\(\)/);
  }
});

test('Opportunity Radar and Learning cancel provider work on emergency stop or client disconnect', () => {
  for (const routePath of ['/api/jerry/scan-opportunities', '/api/jerry/teach']) {
    const start = server.indexOf(`app.post('${routePath}'`);
    const end = server.indexOf('\n  // Jerry ', start + 1);
    const route = server.slice(start, end > start ? end : server.length);
    assert.ok(start >= 0, `missing route ${routePath}`);
    assert.match(route, /executionRegistry\.register\(\)/);
    assert.match(route, /res\.once\('close', cancelOnDisconnect\)/);
    assert.match(route, /execution\.cancel\(/);
    assert.match(route, /execution\.release\(\)/);
    assert.match(route, /signal: execution\.signal/);
  }
});


test('daily opportunity discovery aborts Gemini generation on emergency stop or client disconnect', () => {
  const start = server.indexOf("app.post('/api/jerry/discover-daily-ways'");
  const end = server.indexOf('\n  // Jerry Daily Human Understanding:', start);
  const route = server.slice(start, end > start ? end : server.length);
  assert.ok(start >= 0, 'missing daily opportunity discovery route');
  assert.match(route, /executionRegistry\.register\(\)/);
  assert.match(route, /abortSignal: execution\.signal/);
  assert.match(route, /res\.once\('close', cancelOnDisconnect\)/);
  assert.match(route, /execution\.cancel\(/);
  assert.match(route, /execution\.release\(\)/);
  assert.match(route, /isEmergencyStopActive\(\)/);
});


test('financial workspace mutations hold the shared stop lease through durable state changes', () => {
  const decisionStart = server.indexOf("app.post('/api/approvals/:id/decision'");
  const decisionEnd = server.indexOf("app.post('/api/wallet/commands/record-income'", decisionStart);
  const decisionRoute = server.slice(decisionStart, decisionEnd);
  assert.match(decisionRoute.split('=>')[0], /requireExecutionEnabled/);
  assert.match(decisionRoute, /withSharedExecutionLease\(\(\) => runIdempotentWorkspaceCommand/);

  const incomeStart = server.indexOf("app.post('/api/wallet/commands/record-income'");
  const transferStart = server.indexOf("app.post('/api/wallet/commands/submit-transfer'", incomeStart);
  const incomeRoute = server.slice(incomeStart, transferStart);
  assert.match(incomeRoute, /withSharedExecutionLease\(\(\) => runIdempotentWorkspaceCommand/);

  const transferEnd = server.indexOf('// Real Live Bitcoin Market Price', transferStart);
  const transferRoute = server.slice(transferStart, transferEnd);
  const leaseStart = transferRoute.indexOf('withSharedExecutionLease(async () =>');
  const finalize = transferRoute.indexOf('securityStore.finalizeApprovalReservation', leaseStart);
  const leaseClose = transferRoute.indexOf('return { ...commandResult, finalizedApproval };', leaseStart);
  assert.ok(leaseStart >= 0 && finalize > leaseStart && leaseClose > finalize,
    'transfer reservation finalization must remain inside the shared execution lease');

  const reconcileStart = server.indexOf("app.post('/api/wallet/commands/reconcile-tx'");
  const reconcileEnd = server.indexOf("app.post('/api/jerry/chat'", reconcileStart);
  const reconcileRoute = server.slice(reconcileStart, reconcileEnd);
  assert.match(reconcileRoute, /withSharedExecutionLease\(async \(\) =>/);
  assert.ok(reconcileRoute.indexOf('ensureWalletTransactionJournaled') > reconcileRoute.indexOf('withSharedExecutionLease'),
    'journal synchronization must complete before releasing the reconciliation lease');
});


test('stale task recovery holds the shared execution lease through its durable state repair', () => {
  const start = server.indexOf("app.post('/api/jerry/tasks/recover'");
  const end = server.indexOf("app.post('/api/jerry/discover-daily-ways'", start);
  const route = server.slice(start, end);
  assert.match(route.split('=>')[0], /requireAuth, requireExecutionEnabled/);
  assert.match(route, /withSharedExecutionLease\(\(\) => recoverStaleTaskExecutions\(uid, email\)\)/);
});

test('approved destructive workspace reset cannot race the shared emergency stop', () => {
  const start = server.indexOf("app.post('/api/state/reset'");
  const end = server.indexOf('// Cloud SQL PostgreSQL Protected Routes', start);
  const route = server.slice(start, end);
  assert.match(route.split('=>')[0], /requireAuth, requireExecutionEnabled/);
  const lease = route.indexOf('withSharedExecutionLease(async () =>');
  const reset = route.indexOf('updateWorkspaceForUserAtomic', lease);
  const finalize = route.indexOf('securityStore.finalizeApprovalReservation', lease);
  assert.ok(lease >= 0 && reset > lease && finalize > reset,
    'workspace reset and approval finalization must stay inside the shared lease');
});

test('security backup restore holds the shared emergency-stop lease through the restore mutation', () => {
  const start = server.indexOf("app.post('/api/security/restore'");
  const end = server.indexOf("app.get('/api/health'", start);
  const route = server.slice(start, end);
  assert.match(route.split('=>')[0], /requireAuth, requireExecutionEnabled/);
  assert.match(route, /await withSharedExecutionLease\(async \(\) =>/);
  assert.ok(route.indexOf('withSharedExecutionLease') < route.indexOf('decryptSecurityBackup'));
  assert.ok(route.indexOf('decryptSecurityBackup') < route.indexOf('restoreSharedSecuritySnapshot'));
  assert.match(route, /res\.status\(423\)/);
  assert.match(route, /Security restore was not started/);
});

test('owner memory and workspace persistence writes are fenced by the shared emergency stop', () => {
  const routes = [
    ['/api/memory', '\n  // Provider-neutral Jerry Brain endpoint', 'post'],
    ['/api/state', "app.post('/api/state/reset'", 'put'],
    ['/api/cloudsql/workspace', "app.post('/api/cloudsql/daily-summary'", 'put'],
    ['/api/cloudsql/daily-summary', '\n  // Server-owned approval and financial command boundary', 'post'],
  ] as const;
  for (const [routePath, endMarker, method] of routes) {
    const start = server.indexOf(`app.${method}('${routePath}'`);
    const end = server.indexOf(endMarker, start + 1);
    const route = server.slice(start, end > start ? end : server.length);
    assert.ok(start >= 0, `missing persistence route: ${routePath}`);
    assert.match(route.split('=>')[0], /requireAuth, requireExecutionEnabled/);
    assert.match(route, /withSharedExecutionLease\(/,
      `persistence mutation must hold the shared emergency-stop lease: ${routePath}`);
  }
});

test('workspace initialization and self-upgrade proposal creation cannot bypass the shared stop', () => {
  const stateStart = server.indexOf("app.get('/api/state'");
  const stateEnd = server.indexOf("app.put('/api/state'", stateStart);
  const stateRoute = server.slice(stateStart, stateEnd);
  assert.match(stateRoute, /withSharedExecutionLease\(async \(\) =>/);
  assert.match(stateRoute, /const latest = await getWorkspaceForUser/);

  const cloudStart = server.indexOf("app.get('/api/cloudsql/workspace'");
  const cloudEnd = server.indexOf("app.put('/api/cloudsql/workspace'", cloudStart);
  const cloudRoute = server.slice(cloudStart, cloudEnd);
  assert.match(cloudRoute, /withSharedExecutionLease\(async \(\) =>/);
  assert.match(cloudRoute, /const latest = await getWorkspaceForUser/);

  const approvalStart = server.indexOf("app.post('/api/approvals'");
  const approvalEnd = server.indexOf("app.get('/api/approvals'", approvalStart);
  const approvalRoute = server.slice(approvalStart, approvalEnd);
  assert.match(approvalRoute.split('=>')[0], /requireAuth, requireExecutionEnabled/);
  assert.match(approvalRoute, /withSharedExecutionLease\(\(\) => runIdempotentWorkspaceCommand/);

  const upgradeStart = server.indexOf("app.post('/api/jerry/self-upgrades'");
  const upgradeEnd = server.indexOf("app.post('/api/jerry/self-upgrades/:id/verify'", upgradeStart);
  const upgradeRoute = server.slice(upgradeStart, upgradeEnd);
  assert.match(upgradeRoute.split('=>')[0], /requireAuth, requireExecutionEnabled/);
  assert.match(upgradeRoute, /withSharedExecutionLease\(\(\) => runIdempotentWorkspaceCommand/);
});

test('self-upgrade verification holds the shared stop lease through proposal persistence', () => {
  const start = server.indexOf("app.post('/api/jerry/self-upgrades/:id/verify'");
  const end = server.indexOf("app.post('/api/jerry/verify-upgrade'", start);
  const route = server.slice(start, end);
  assert.match(route.split('=>')[0], /requireAuth, requireExecutionEnabled/);
  const lease = route.indexOf('withSharedExecutionLease(() => runIdempotentWorkspaceCommand');
  const mutation = route.indexOf('runIdempotentWorkspaceCommand', lease);
  const response = route.indexOf('res.json({ ...result.response', mutation);
  assert.ok(lease >= 0 && mutation > lease && response > mutation,
    'verification and persisted proposal update must remain inside the shared execution lease');
});

test('standalone upgrade verification holds the shared stop lease during the external runner call', () => {
  const start = server.indexOf("app.post('/api/jerry/verify-upgrade'");
  const end = server.indexOf("app.post('/api/jerry/execute-task'", start);
  const route = server.slice(start, end);
  assert.match(route.split('=>')[0], /requireAuth, requireExecutionEnabled/);
  const lease = route.indexOf('withSharedExecutionLease(() =>');
  const runner = route.indexOf('runIsolatedTestsWithStop', lease);
  assert.ok(lease >= 0 && runner > lease,
    'external isolated runner must execute while the shared stop lease is held');
  assert.match(route, /res\.status\(423\)/);
  assert.match(route, /Upgrade verification was not started/);
});

test('on-chain wallet sync holds the shared stop lease across external reads and workspace persistence', () => {
  const start = server.indexOf(`app.post('/api/wallet/sync-onchain'`);
  const end = server.indexOf(`app.post('/api/wallet/verify-tx'`, start);
  const route = server.slice(start, end);
  assert.match(route.split('=>')[0], /requireAuth, requireExecutionEnabled/);
  const lease = route.indexOf('withSharedExecutionLease(async () =>');
  const externalRead = route.indexOf("fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot'", lease);
  const persistence = route.indexOf('updateWorkspaceForUserAtomic', lease);
  assert.ok(lease >= 0 && externalRead > lease && persistence > externalRead,
    'shared lease must cover both external wallet reads and the subsequent workspace write');
  assert.match(route, /res\.status\(423\)/);
});

test('Bitcoin reconciliation holds the shared stop lease across blockchain reads, ledger journaling and workspace persistence', () => {
  const start = server.indexOf("app.post('/api/wallet/commands/reconcile-tx'");
  const end = server.indexOf("app.post('/api/jerry/chat'", start);
  const route = server.slice(start, end);
  assert.match(route.split('=>')[0], /requireAuth, requireExecutionEnabled/);
  const lease = route.indexOf('withSharedExecutionLease(async () =>');
  const chainRead = route.indexOf('https://blockstream.info/api/tx/', lease);
  const mutationLease = route.indexOf('runIdempotentWorkspaceCommand', chainRead);
  const journal = route.indexOf('ensureWalletTransactionJournaled', mutationLease);
  assert.ok(lease >= 0 && chainRead > lease && mutationLease > chainRead && journal > mutationLease,
    'outer shared lease must cover chain reads, transaction persistence and journal posting');
  assert.match(route, /res\.status\(423\)/);
});

test('historical financial backfill holds the shared stop lease across journal repair and reconciliation', () => {
  const start = server.indexOf("app.post('/api/wallet/financial-truth/backfill'");
  const end = server.indexOf("app.post('/api/wallet/commands/reconcile-tx'", start);
  const route = server.slice(start, end);
  assert.match(route.split('=>')[0], /requireAuth, requireExecutionEnabled/);
  const lease = route.indexOf('withSharedExecutionLease(async () =>');
  const backfill = route.indexOf('backfillHistoricalWalletJournal', lease);
  const report = route.indexOf('reconcileFinancialTruth', backfill);
  assert.ok(lease >= 0 && backfill > lease && report > backfill,
    'shared lease must cover historical journal repair and its resulting financial-truth report');
  assert.match(route, /res\.status\(423\)/);
});

test('read-only Bitcoin transaction verification is also fenced from new external requests during emergency stop', () => {
  const start = server.indexOf("app.post('/api/wallet/verify-tx'");
  const end = server.indexOf("app.get('/api/wallet/financial-truth'", start);
  const route = server.slice(start, end);
  assert.match(route.split('=>')[0], /requireAuth, requireExecutionEnabled/);
  const lease = route.indexOf('withSharedExecutionLease(async () =>');
  const chainRead = route.indexOf('https://blockstream.info/api/tx/', lease);
  assert.ok(lease >= 0 && chainRead > lease, 'shared lease must be acquired before external Blockstream reads');
  assert.match(route, /res\.status\(423\)/);
});

test('Jerry teaching refuses memory persistence when emergency stop interrupts learning', () => {
  const start = server.indexOf("app.post('/api/jerry/teach'");
  const end = server.indexOf('// Jerry Polyglot Self-Programming Engine', start);
  const route = server.slice(start, end);
  const lease = route.indexOf('withSharedExecutionLease(() => saveMemoryEntryForUser');
  const prePersistStopCheck = route.indexOf('execution.signal.aborted || isEmergencyStopActive()');
  assert.ok(lease >= 0 && prePersistStopCheck >= 0 && prePersistStopCheck < lease,
    'teaching must recheck stop immediately before acquiring persistence lease');
  assert.match(route, /res\.status\(423\)/);
  assert.match(route, /persisted: false/);
});

test('distributed emergency-stop polling is serialized and bounded to 250ms', () => {
  assert.match(server, /let executionControlSyncInFlight = false/);
  assert.match(server, /if \(executionControlSyncInFlight\) return/);
  assert.match(server, /executionControlSyncInFlight = true/);
  assert.match(server, /executionControlSyncInFlight = false/);
  assert.match(server, /void synchronizeSharedExecutionControl\(\);\s*\}, 250\)/);
  assert.match(server, /catch \{\s*executionRegistry\.setStopped\(true, 'Shared execution-control read failed; fail closed'\)/);
});

test('offline learning fallbacks recheck shared emergency stop and fail closed when control is unavailable', () => {
  const humanStart = server.indexOf("app.post('/api/jerry/learn-human-insight'");
  const growthStart = server.indexOf("app.post('/api/jerry/learn-internet-growth'");
  const summaryStart = server.indexOf("app.post('/api/jerry/daily-summary'", growthStart);
  const humanRoute = server.slice(humanStart, growthStart);
  const growthRoute = server.slice(growthStart, summaryStart);
  for (const [name, route, fallback] of [
    ['human insight', humanRoute, 'buildOfflineInsight()'],
    ['internet growth', growthRoute, 'buildOfflinePlaybook()'],
  ] as const) {
    const noProvider = route.indexOf('if (!ai)');
    const sharedRead = route.indexOf('readSharedExecutionControl()', noProvider);
    const stoppedCheck = route.indexOf('sharedControl.stopped || isEmergencyStopActive()', sharedRead);
    const fallbackResponse = route.indexOf(fallback, stoppedCheck);
    assert.ok(noProvider >= 0 && sharedRead > noProvider && stoppedCheck > sharedRead && fallbackResponse > stoppedCheck,
      `${name} offline fallback must recheck shared stop before responding`);
    assert.match(route.slice(noProvider, fallbackResponse), /res\.status\(423\)/);
    assert.match(route.slice(noProvider, fallbackResponse), /res\.status\(503\)/);
    assert.match(route.slice(noProvider, fallbackResponse), /executionRegistry\.setStopped\(true/);
  }
});

test('Gemini learning and discovery routes refresh the durable shared stop before accepting provider output', () => {
  assert.match(server, /const sharedStopBlocksAcceptance = async \(\): Promise<boolean> =>/);
  assert.match(server, /readSharedExecutionControl\(\)/);
  assert.match(server, /Shared execution-control read failed before accepting provider output/);
  const routes = [
    {
      name: 'daily opportunity discovery',
      start: "app.post('/api/jerry/discover-daily-ways'",
      end: "app.post('/api/jerry/learn-human-insight'",
    },
    {
      name: 'human insight',
      start: "app.post('/api/jerry/learn-human-insight'",
      end: "app.post('/api/jerry/learn-internet-growth'",
    },
    {
      name: 'internet growth',
      start: "app.post('/api/jerry/learn-internet-growth'",
      end: "app.post('/api/jerry/daily-summary'",
    },
  ];
  for (const routeSpec of routes) {
    const start = server.indexOf(routeSpec.start);
    const end = server.indexOf(routeSpec.end, start + routeSpec.start.length);
    const route = server.slice(start, end);
    const providerCall = route.indexOf('await ai.models.generateContent(');
    const acceptanceGuard = route.indexOf('await sharedStopBlocksAcceptance()', providerCall);
    const parseOrFallback = Math.max(
      route.indexOf('const rawText', providerCall),
      route.indexOf('const parsed = JSON.parse', providerCall),
    );
    assert.ok(providerCall >= 0 && acceptanceGuard > providerCall && parseOrFallback > acceptanceGuard,
      `${routeSpec.name} must refresh the shared stop after Gemini completes and before parsing output`);
  }
  for (const [name, start, end, fallback] of [
    ['human insight', "app.post('/api/jerry/learn-human-insight'", "app.post('/api/jerry/learn-internet-growth'", 'buildOfflineInsight()'],
    ['internet growth', "app.post('/api/jerry/learn-internet-growth'", "app.post('/api/jerry/daily-summary'", 'buildOfflinePlaybook()'],
  ] as const) {
    const routeStart = server.indexOf(start);
    const route = server.slice(routeStart, server.indexOf(end, routeStart + start.length));
    const catchStart = route.lastIndexOf('} catch {');
    const fallbackIndex = route.indexOf(fallback, catchStart);
    assert.ok(catchStart >= 0 && route.indexOf('await sharedStopBlocksAcceptance()', catchStart) < fallbackIndex,
      `${name} must recheck shared stop before returning a provider-error fallback`);
  }
});

test('vision, voice, transcription and opportunity research refresh the durable stop before delivering provider results', () => {
  const cases = [
    {
      name: 'vision',
      start: "app.post('/api/jerry/vision'",
      end: "app.post('/api/jerry/tts'",
      guard: 'await sharedStopBlocksAcceptance()',
    },
    {
      name: 'text to speech',
      start: "app.post('/api/jerry/tts'",
      end: "app.post('/api/jerry/transcribe'",
      guard: 'await sharedStopBlocksAcceptance()',
    },
    {
      name: 'transcription',
      start: "app.post('/api/jerry/transcribe'",
      end: "app.post('/api/jerry/scan-opportunities'",
      guard: 'await sharedStopBlocksAcceptance()',
    },
    {
      name: 'opportunity radar',
      start: "app.post('/api/jerry/scan-opportunities'",
      end: "app.post('/api/jerry/teach'",
      guard: 'await sharedStopBlocksAcceptance()',
    },
  ];
  for (const item of cases) {
    const start = server.indexOf(item.start);
    const end = server.indexOf(item.end, start + item.start.length);
    const route = server.slice(start, end);
    const providerAwait = Math.max(
      route.indexOf('await analyzeImageWithModelFallback('),
      route.indexOf('await synthesizeSpeechWithModelFallback('),
      route.indexOf('await transcribeAudioWithModelFallback('),
      route.indexOf('await runOpportunityRadar('),
    );
    const guard = route.indexOf(item.guard, providerAwait);
    assert.ok(start >= 0 && providerAwait >= 0 && guard > providerAwait,
      `${item.name} must re-read shared stop after provider work and before delivering results`);
  }
});

test('Jerry teaching refreshes durable stop after optional AI enhancement and before memory persistence', () => {
  const start = server.indexOf("app.post('/api/jerry/teach'");
  const end = server.indexOf('// Jerry Polyglot Self-Programming Engine', start);
  const route = server.slice(start, end);
  const provider = route.indexOf('await generateWithModelFallback(');
  const stop = route.indexOf('await sharedStopBlocksAcceptance()', provider);
  const persist = route.indexOf('withSharedExecutionLease(() => saveMemoryEntryForUser', stop);
  assert.ok(provider >= 0 && stop > provider && persist > stop,
    'teaching must refresh shared stop after enhancement and before memory persistence');
});

test('chat, goal planning, opportunity assessment and self-programming refresh shared stop after Gemini/provider completion', () => {
  const cases = [
    { name: 'chat', start: "app.post('/api/jerry/chat'", end: "app.post('/api/jerry/plan-goal'", call: 'await generateWithModelFallback(' },
    { name: 'goal planning', start: "app.post('/api/jerry/plan-goal'", end: "app.post('/api/jerry/assess-opportunity'", call: 'await generateWithModelFallback(' },
    { name: 'opportunity assessment', start: "app.post('/api/jerry/assess-opportunity'", end: "app.post('/api/jerry/self-program'", call: 'await generateWithModelFallback(' },
    { name: 'self-programming', start: "app.post('/api/jerry/self-program'", end: "app.post('/api/jerry/discover-daily-ways'", call: 'await generateWithModelFallback(' },
  ];
  for (const item of cases) {
    const start = server.indexOf(item.start);
    const end = server.indexOf(item.end, start + item.start.length);
    const route = server.slice(start, end);
    const provider = route.indexOf(item.call);
    const guard = route.indexOf('await sharedStopBlocksAcceptance()', provider);
    assert.ok(start >= 0 && provider >= 0 && guard > provider,
      `${item.name} must refresh the shared emergency-stop latch after provider completion`);
  }
});

test('provider result delivery holds the durable shared execution lease through response handoff', () => {
  assert.match(server, /const deliverWithSharedExecutionLease = async/);
  const helperStart = server.indexOf('const deliverWithSharedExecutionLease = async');
  const helperEnd = server.indexOf('let executionControlSyncInFlight', helperStart);
  const helper = server.slice(helperStart, helperEnd);
  assert.match(helper, /withSharedExecutionLease\(async \(\) =>/);
  assert.match(helper, /execution\.signal\.aborted \|\| isEmergencyStopActive\(\)/);
  assert.match(helper, /deliver\(\)/);
  for (const [route, next] of [
    ["app.post('/api/jerry/chat'", "app.post('/api/jerry/plan-goal'"],
    ["app.post('/api/jerry/plan-goal'", "app.post('/api/jerry/assess-opportunity'"],
    ["app.post('/api/jerry/assess-opportunity'", "app.post('/api/jerry/vision'"],
    ["app.post('/api/jerry/vision'", "app.post('/api/jerry/tts'"],
    ["app.post('/api/jerry/tts'", "app.post('/api/jerry/transcribe'"],
    ["app.post('/api/jerry/transcribe'", "app.post('/api/jerry/scan-opportunities'"],
    ["app.post('/api/jerry/scan-opportunities'", "app.post('/api/jerry/teach'"],
    ["app.post('/api/jerry/teach'", "app.post('/api/jerry/self-program'"],
    ["app.post('/api/jerry/self-program'", "app.post('/api/jerry/verify-upgrade'"],
    ["app.post('/api/jerry/discover-daily-ways'", "app.post('/api/jerry/learn-human-insight'"],
    ["app.post('/api/jerry/learn-human-insight'", "app.post('/api/jerry/learn-internet-growth'"],
    ["app.post('/api/jerry/learn-internet-growth'", "app.post('/api/jerry/daily-summary'"],
    ["app.post('/api/brain/generate'", "app.get('/api/state'"],
  ]) {
    const start = server.indexOf(route);
    const end = server.indexOf(next, start + route.length);
    assert.ok(server.slice(start, end).includes('deliverWithSharedExecutionLease('),
      `${route} must hand provider output to the response under the shared lease`);
  }
});


test('wallet outbox claims are serialized against the durable owner emergency stop', () => {
  const claimStart = walletOutbox.indexOf('const picked = await withSharedExecutionLease');
  const claimEnd = walletOutbox.indexOf('const claimedRows =', claimStart);
  assert.ok(claimStart >= 0 && claimEnd > claimStart, 'outbox claim must be inside a shared execution lease');
  const claim = walletOutbox.slice(claimStart, claimEnd);
  assert.match(claim, /if \(signal\?\.aborted\) throw/);
  assert.match(claim, /client\.query\(/);
  assert.match(claim, /UPDATE wallet_journal_outbox/);
  assert.ok(walletOutbox.includes('LIMIT $${uid ? 2 : 1}'), 'claim limit must remain a PostgreSQL bind parameter');
  assert.ok(walletOutbox.includes('claim_token = $${uid ? 3 : 2}'), 'UUID fencing token must remain a PostgreSQL bind parameter');
});


test('Bitcoin settlement verification and persistence share one owner-stop lease', () => {
  const start = server.indexOf("app.post('/api/wallet/commands/record-income'");
  const end = server.indexOf("app.post('/api/wallet/commands/submit-transfer'", start);
  const route = server.slice(start, end);
  const lease = route.indexOf('await withSharedExecutionLease(async () =>');
  const firstExternalRead = route.indexOf('fetch(');
  const persistence = route.indexOf('runIdempotentWorkspaceCommand(');
  assert.ok(lease >= 0 && firstExternalRead > lease, 'shared lease must be acquired before external Bitcoin verification');
  assert.ok(persistence > firstExternalRead, 'verified settlement persistence must remain inside the same lease');
  assert.equal((route.match(/withSharedExecutionLease\(/g) ?? []).length, 1, 'settlement must not nest execution leases');
});


test('provider executions are pinned to admission epoch and stale results are rejected after stop/resume', () => {
  assert.match(server, /const registerSharedExecution = async/);
  assert.match(server, /const control = await readSharedExecutionControl\(\)/);
  assert.match(server, /return \{ \.\.\.execution, epoch: control\.epoch \}/);
  assert.match(server, /withSharedExecutionLease\(async \(lease\) =>/);
  assert.match(server, /lease\.epoch !== execution\.epoch/);
  const registrations = server.match(/await registerSharedExecution\(\)/g) ?? [];
  assert.ok(registrations.length >= 10,
    'Provider and long-running routes must capture the shared control epoch when admitted.');
});


test('cross-instance owner recovery reconciles the local SQLite latch before execution polling', () => {
  assert.match(server, /import \{ synchronizeLocalEmergencyControl \} from '\.\/src\/lib\/emergencyStopSync\.ts'/);
  const pollerStart = server.indexOf('const synchronizeSharedExecutionControl = async');
  const pollerEnd = server.indexOf('const executionControlPoller', pollerStart);
  const poller = server.slice(pollerStart, pollerEnd);
  const sharedRead = poller.indexOf('await readSharedExecutionControl()');
  const localSync = poller.indexOf('synchronizeLocalEmergencyControl(sharedControl, securityStore)');
  const registryUpdate = poller.indexOf('executionRegistry.setStopped(');
  assert.ok(sharedRead >= 0 && localSync > sharedRead && registryUpdate > localSync,
    'each instance must reconcile its local durable stop mirror from shared owner state before setting its execution latch');
  assert.match(poller, /catch \{\s*executionRegistry\.setStopped\(true/);
});


test('every wallet mutation or external verification route is owner-stop guarded and lease protected', () => {
  const routeCases = [
    {
      name: 'incoming settlement recording',
      start: "app.post('/api/wallet/commands/record-income'",
      end: "app.post('/api/wallet/commands/submit-transfer'",
    },
    {
      name: 'outgoing transfer staging',
      start: "app.post('/api/wallet/commands/submit-transfer'",
      end: 'async function fetchLiveSpotPrices()',
    },
    {
      name: 'on-chain wallet synchronization',
      start: "app.post('/api/wallet/sync-onchain'",
      end: "app.post('/api/wallet/verify-tx'",
    },
    {
      name: 'external transaction verification',
      start: "app.post('/api/wallet/verify-tx'",
      end: "app.get('/api/wallet/financial-truth'",
    },
    {
      name: 'financial journal backfill',
      start: "app.post('/api/wallet/financial-truth/backfill'",
      end: "app.post('/api/wallet/commands/reconcile-tx'",
    },
    {
      name: 'transaction reconciliation',
      start: "app.post('/api/wallet/commands/reconcile-tx'",
      end: "app.post('/api/jerry/chat'",
    },
  ];

  for (const item of routeCases) {
    const start = server.indexOf(item.start);
    const end = server.indexOf(item.end, start + item.start.length);
    assert.ok(start >= 0 && end > start, `${item.name} route boundaries must exist`);
    const route = server.slice(start, end);
    assert.match(route.slice(0, route.indexOf('{')), /requireExecutionEnabled/,
      `${item.name} must reject work when the owner emergency stop is active`);
    assert.match(route, /withSharedExecutionLease\(/,
      `${item.name} must hold a durable cross-instance execution lease`);
  }
});

test('production no longer depends on instance-local SQLite for owner security authority', () => {
  assert.doesNotMatch(server, /JERRY_SECURITY_STORE_TOPOLOGY/);
  for (const marker of [
    'await listSharedApprovals',
    'await createSharedApproval',
    'await decideSharedApproval',
    'await listSharedContacts',
    'await createSharedContact',
    'await setSharedContactStatus',
    'await listSharedSecurityAudit',
    'await verifySharedSecurityAudit',
    'await exportSharedSecuritySnapshot',
    'await restoreSharedSecuritySnapshot',
  ]) assert.ok(server.includes(marker), `missing shared security operation: ${marker}`);
  assert.match(server, /getEmergencyStop\(\)\.stopped/);
});

test('owner approval APIs and external-operation reservations use shared PostgreSQL authority', () => {
  assert.match(server, /from '\.\/src\/db\/approvalStore\.ts'/);
  for (const marker of [
    'await listSharedApprovals',
    'await createSharedApproval',
    'await decideSharedApproval',
    'await reserveSharedApproval',
    'await finalizeSharedApprovalReservation',
    'await releaseSharedApprovalReservation',
  ]) {
    assert.ok(server.includes(marker), `missing shared approval operation: ${marker}`);
  }
  const start = server.indexOf("app.get('/api/security/approvals'");
  const end = server.indexOf("app.get('/api/security/emergency-stop'", start);
  const routes = server.slice(start, end);
  assert.doesNotMatch(routes, /securityStore\.(listApprovals|createApproval|decideApproval)/);
  assert.match(routes, /async \(req: AuthRequest, res\)/);
});

test('shared approval authority commits state transitions and hash-linked audit events atomically', () => {
  assert.match(sharedApprovalStore, /CREATE TABLE IF NOT EXISTS jerry_security_approvals/);
  assert.match(sharedApprovalStore, /CREATE TABLE IF NOT EXISTS jerry_security_approval_audit/);
  assert.match(sharedApprovalStore, /await client\.query\('BEGIN'\)/);
  assert.match(sharedApprovalStore, /await client\.query\('COMMIT'\)/);
  assert.match(sharedApprovalStore, /await client\.query\('ROLLBACK'\)/);
  assert.match(sharedApprovalStore, /pg_advisory_xact_lock/);
  assert.match(sharedApprovalStore, /previous_hash/);
  assert.match(sharedApprovalStore, /entry_hash/);
  assert.match(sharedApprovalStore, /reservation_id IS NULL OR reservation_id=\$1/);
  assert.match(sharedApprovalStore, /consumed_at IS NULL/);
});

test('shared backup restore never revives historical spending approvals and archives legacy audit evidence', () => {
  assert.match(sharedApprovalStore, /legacyAuditArchive\?\./);
  assert.match(sharedApprovalStore, /jerry_security_legacy_audit_archive/);
  assert.match(sharedApprovalStore, /status=CASE WHEN status='pending' THEN 'rejected'/);
  assert.match(sharedApprovalStore, /consumed_at=CASE WHEN status='approved' THEN COALESCE\(consumed_at,now\(\)\)/);
  assert.match(sharedApprovalStore, /ON CONFLICT\(id\) DO NOTHING/);
});
test('expensive provider routes use shared PostgreSQL owner quotas and fail closed on storage outage', () => {
  assert.match(server, /import \{ createSharedOwnerRateLimiter \} from '\.\/src\/db\/rateLimitStore\.ts'/);
  assert.doesNotMatch(server, /createOwnerRateLimiter/);
  for (const bucket of ['brain','chat','goal-plan','opportunity','voice']) {
    assert.match(server, new RegExp(`createSharedOwnerRateLimiter\\('${bucket}'`));
  }
  assert.match(sharedRateLimitStore, /INSERT INTO jerry_owner_rate_limits/);
  assert.match(sharedRateLimitStore, /ON CONFLICT\(owner_uid,bucket_key\) DO UPDATE/);
  assert.match(sharedRateLimitStore, /request_count=jerry_owner_rate_limits\.request_count \+ 1/);
  assert.match(sharedRateLimitStore, /Shared rate-limit storage is unavailable/);
  assert.match(sharedRateLimitStore, /status\(503\)/);
});


test('direct Coinbase and Blockstream requests reserve shared owner operations before outbound calls', () => {
  assert.match(server, /async function reserveExternalServiceOperations\(ownerUid: string, operationCount: number\)/);
  assert.match(server, /for \(let index = 0; index < operationCount; index \+= 1\)/);
  const routes = [
    { marker: "app.post('/api/wallet/commands/record-income", count: 3 },
    { marker: "app.post('/api/wallet/sync-onchain", count: 2 },
    { marker: "app.post('/api/wallet/verify-tx", count: 2 },
    { marker: "app.post('/api/wallet/commands/reconcile-tx", count: 2 },
  ];
  for (const route of routes) {
    const start = server.indexOf(route.marker);
    assert.ok(start >= 0, `missing external wallet route: ${route.marker}`);
    const section = server.slice(start, start + 9000);
    const reservation = section.indexOf('await reserveExternalServiceOperations(');
    const outbound = section.search(/fetch\(['\x60]https:\/\//);
    assert.ok(reservation >= 0 && outbound > reservation,
      `${route.marker} must reserve shared operations before outbound requests`);
    assert.match(section.slice(reservation, reservation + 100),
      new RegExp(`reserveExternalServiceOperations\\((?:uid|req\\.user!\\.uid), ${route.count}\\)`));
  }
  assert.match(server, /async function fetchLiveSpotPrices\(ownerUid: string\)/);
  const priceHelper = server.slice(server.indexOf('async function fetchLiveSpotPrices'), server.indexOf(`app.post('/api/wallet/sync-onchain'`));
  assert.ok(priceHelper.indexOf('reserveExternalServiceOperations(ownerUid, 1)') <
    priceHelper.indexOf("fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot'"),
    'the standalone Coinbase helper must reserve before its request');
});

test('multimodal and direct SDK provider attempts consume a shared daily owner operation budget', () => {
  assert.match(server, /import \{ reserveConfiguredProviderOperation \} from '\.\/src\/db\/providerOperationStore\.ts'/);
  for (const route of [
    'analyzeImageWithModelFallback',
    'synthesizeSpeechWithModelFallback',
    'transcribeAudioWithModelFallback',
  ]) {
    const index = server.indexOf(route + '({');
    assert.ok(index >= 0, `missing multimodal route call: ${route}`);
    assert.match(server.slice(index, index + 700), /ownerUid:req\.user!\.uid/);
  }
  assert.equal((server.match(/await reserveConfiguredProviderOperation\(req\.user!\.uid\)/g) ?? []).length, 3,
    'all direct Gemini SDK routes must reserve before execution');
  assert.equal((server.match(/await reserveDirectGeminiTokens\(req\.user!\.uid, prompt\)/g) ?? []).length, 3,
    'all direct Gemini SDK routes must reserve the shared daily token budget before execution');
  assert.equal((server.match(/await settleDirectGeminiTokens\(tokenReservation, response\)/g) ?? []).length, 3,
    'all direct Gemini SDK routes must reconcile provider-reported token usage');
  assert.match(server, /JERRY_DAILY_PROVIDER_TOKEN_LIMIT must be configured/);
  assert.match(server, /Buffer\.byteLength\(prompt, 'utf8'\) \+ 512 \+ 2048/);
  assert.equal((server.match(/maxOutputTokens: 2048/g) ?? []).length, 3,
    'all direct Gemini SDK responses must have a hard output token cap');
  assert.equal((multimodalAdapters.match(/await reserveConfiguredProviderOperation\(options\.ownerUid\)/g) ?? []).length, 6,
    'each Google/OpenAI vision, speech and transcription attempt must reserve a slot');
  assert.match(sharedProviderOperationStore, /ON CONFLICT\(owner_uid,usage_day\) DO UPDATE/);
  assert.match(sharedProviderOperationStore, /used_operations < jerry_provider_daily_operations\.daily_limit_operations/);
  assert.match(sharedProviderOperationStore, /JERRY_DAILY_PROVIDER_OPERATION_LIMIT/);
  assert.match(server, /researchApiKey: process\.env\.TAVILY_API_KEY,\s*ownerUid: req\.user!\.uid/);
  assert.match(opportunityRadar, /reserveConfiguredProviderOperation\(options\.ownerUid\)/);
});

test('wallet external-service operation reservations are acquired inside the shared emergency-stop lease', () => {
  const cases = [
    {
      name: 'incoming Bitcoin settlement verification',
      start: "app.post('/api/wallet/commands/record-income'",
      end: "app.post('/api/wallet/commands/submit-transfer'",
      reservation: 'reserveExternalServiceOperations(uid, 3)',
    },
    {
      name: 'on-chain wallet synchronization',
      start: "app.post('/api/wallet/sync-onchain'",
      end: "app.post('/api/wallet/verify-tx'",
      reservation: 'reserveExternalServiceOperations(uid, 2)',
    },
    {
      name: 'Bitcoin transaction verification',
      start: "app.post('/api/wallet/verify-tx'",
      end: "app.get('/api/wallet/financial-truth'",
      reservation: 'reserveExternalServiceOperations(req.user!.uid, 2)',
    },
    {
      name: 'Bitcoin transaction reconciliation',
      start: "app.post('/api/wallet/commands/reconcile-tx'",
      end: "app.post('/api/jerry/chat'",
      reservation: 'reserveExternalServiceOperations(uid, 2)',
    },
  ];

  for (const item of cases) {
    const start = server.indexOf(item.start);
    const end = server.indexOf(item.end, start + item.start.length);
    assert.ok(start >= 0 && end > start, `${item.name} route boundaries must exist`);
    const route = server.slice(start, end);
    const lease = route.indexOf('await withSharedExecutionLease(async () =>');
    const reservation = route.indexOf('await ' + item.reservation);
    const singleQuotedFetch = route.indexOf("fetch('https://");
    const templateFetch = route.indexOf('fetch(`https://');
    const firstOutbound = [singleQuotedFetch, templateFetch].filter((value) => value >= 0).sort((a, b) => a - b)[0] ?? -1;
    assert.ok(lease >= 0 && reservation > lease && firstOutbound > reservation,
      `${item.name}: quota reservation and outbound request must both occur after acquiring the shared stop lease`);
  }
});


test('direct Gemini SDK execution reserves configured USD cost inside the shared stop lease', () => {
  const helperStart = server.indexOf('async function generateDirectGeminiWithBudget');
  const helperEnd = server.indexOf('async function startServer()', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'direct Gemini budget helper must exist');
  const helper = server.slice(helperStart, helperEnd);
  const lease = helper.indexOf('withSharedExecutionLease(async () =>');
  const tokenReservation = helper.indexOf('reserveDirectGeminiTokens(ownerUid, prompt)');
  const operationReservation = helper.indexOf('reserveConfiguredProviderOperation(ownerUid)');
  const costReservation = helper.indexOf('reserveProviderCost({ ownerUid');
  const request = helper.indexOf('const response = await generate()');
  assert.ok(lease >= 0 && tokenReservation > lease && operationReservation > tokenReservation &&
    costReservation > operationReservation && request > costReservation,
    'shared stop lease must cover token, operation and USD cost reservations before SDK request');

  const routes = [
    "app.post('/api/jerry/discover-daily-ways'",
    "app.post('/api/jerry/learn-human-insight'",
    "app.post('/api/jerry/learn-internet-growth'",
  ];
  for (const routeMarker of routes) {
    const start = server.indexOf(routeMarker);
    assert.ok(start >= 0, `route ${routeMarker} must exist`);
    const route = server.slice(start, start + 16_000);
    assert.match(route, /generateDirectGeminiWithBudget\(req\.user!\.uid, prompt, execution\.signal/);
  }
  assert.equal((server.match(/ai\.models\.generateContent\(/g) ?? []).length, 3,
    'all direct Gemini SDK generation call sites must remain within the budgeted helper');
});


test('provider usage ledger endpoint is authenticated, owner-scoped, read-only and available during emergency stop', () => {
  const start = server.indexOf("app.get('/api/provider-usage'");
  const end = server.indexOf("app.get('/api/memory/export'", start);
  assert.ok(start >= 0 && end > start, 'provider usage ledger endpoint must exist');
  const route = server.slice(start, end);
  assert.match(route, /requireAuth/);
  assert.doesNotMatch(route.split('\n')[0], /requireExecutionEnabled/);
  assert.match(route, /getProviderUsageAudit\(uid, rawDays\)/);
  assert.match(route, /getProviderCostAudit\(uid, rawDays\)/);
  assert.match(route, /Cache-Control', 'no-store'/);
  assert.match(route, /reserved: 'Unsettled reservation/);
  assert.match(route, /settled: 'Provider usage or cost was reconciled/);
  assert.match(route, /rawDays > 90/);
});


test('provider budget audit is owner-authenticated, read-only, bounded and disables caching', () => {
  const start = server.indexOf("app.get('/api/security/provider-usage'");
  const end = server.indexOf('// Dedicated owner-scoped persistent memory API.', start);
  const route = server.slice(start, end);
  assert.ok(start >= 0 && end > start, 'provider usage audit route must exist');
  assert.match(route.split('=>')[0], /requireAuth/);
  assert.match(route, /getProviderUsageAudit\(req\.user!\.uid, rawDays\)/);
  assert.match(route, /getProviderCostAudit\(req\.user!\.uid, rawDays\)/);
  assert.match(route, /rawDays < 1 \|\| rawDays > 90/);
  assert.match(route, /Cache-Control', 'no-store'/);
  assert.doesNotMatch(route, /reserveProvider|settleProvider|DELETE FROM|UPDATE jerry_provider/);
});


test('provider token and USD settlements only claim reservations after the daily budget update succeeds', () => {
  for (const [name, source, budgetTable, ledgerTable] of [
    ['token', providerUsageStore, 'jerry_provider_daily_usage', 'jerry_provider_token_reservations'],
    ['USD', providerCostStore, 'jerry_provider_daily_cost', 'jerry_provider_cost_reservations'],
  ] as const) {
    const start = source.indexOf('WITH candidate AS MATERIALIZED');
    const end = source.indexOf('SELECT reservation_id FROM claimed', start);
    const sql = source.slice(start, end);
    assert.ok(start >= 0 && end > start, name + ' settlement SQL must expose its ordered CTE pipeline');
    assert.match(sql, new RegExp('FROM ' + ledgerTable));
    assert.match(sql, /FOR UPDATE/);
    assert.ok(sql.indexOf('), budget AS (') > sql.indexOf('FOR UPDATE'));
    assert.ok(sql.indexOf('UPDATE ' + budgetTable) > sql.indexOf('), budget AS ('));
    assert.ok(sql.indexOf('), claimed AS (') > sql.indexOf('RETURNING candidate.reservation_id'));
    assert.ok(sql.indexOf('UPDATE ' + ledgerTable + ' AS reservation') > sql.indexOf('), claimed AS ('));
  }
});
