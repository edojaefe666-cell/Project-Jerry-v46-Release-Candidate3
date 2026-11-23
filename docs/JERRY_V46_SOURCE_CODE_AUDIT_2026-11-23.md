# Jerry v46 Source-Code Audit — 2026-11-23

## Audit identity and limits

- Audited artifact: `Project-Jerry-v46-corrected-release-candidate.zip`
- SHA-256: `b829f0ccf720c18d86692d3527494c2d8e3eb76b6d7876a00fb1a62250f99ca5`
- Archive contents: 152 entries, including the React/TypeScript client, Express server, Firebase authentication, PostgreSQL/Drizzle schema and migrations, SQLite security stores, orchestration/engineering/browser policy modules, and tests.
- This is a source inspection of the uploaded archive. It is not proof that this exact archive is the source currently deployed or the exact source revision in GitHub.
- The archive's Firebase workflow still uses a long-lived service-account JSON GitHub secret. The separately inspected GitHub main-branch workflow had moved to OIDC/Secret Manager. Treat these as different revisions until the archive is synchronized with the repository.
- No live Firebase, Google Cloud, bank, brokerage, phone, or production environment was accessed.

## Verification performed

### Executed tests

Using Node 22.16.0 built-in TypeScript stripping (`node --experimental-strip-types --test`), the following selected source test batches passed:

- Core Jerry engine, goal execution control plane, orchestration, and hands-free policy: 72 passed.
- Wallet policy, Bitcoin settlement, double-entry journal rules, financial reconciliation, browser policy store, engineering control plane, product engineering, release security, and workspace-state regressions: 89 passed.
- Authentication middleware unit tests: 3 passed.
- Wallet journal atomic-unit and posting-line tests: 5 passed.

**Selected total: 169 passed, 0 failed.** This is not the full package test suite.

The release-lock consistency script also passed: root `esbuild` lock resolution is 0.28.2 and matches the declared `^0.28.2` range. The packaging note in this archive that says the lock is stale is therefore outdated relative to the actual included lock and guard script.

### Not verified

- Full `bun run verify:release` (Bun is not installed in this audit runtime).
- Full dependency installation, TypeScript lint/typecheck, and Vite production build (npm dependency installation timed out; no installed dependency tree was available).
- PostgreSQL tenant/journal integration tests against a disposable live PostgreSQL service.
- Real Firebase authentication/revocation integration test against the configured Firebase project.
- Production deployment, actual Gemini model availability/quotas, or live external service behavior.

## Capability findings

Status labels: **Implemented foundation** means source code exists and selected tests pass; it does not imply a complete end-to-end product capability.

| Roadmap division | Source evidence | Audit status |
|---|---|---|
| Conversation / Jerry Brain | Authenticated `/api/jerry/chat`, Gemini-backed chat and offline fallback; Brain UI | Implemented foundation; model behavior and grounding need live verification |
| Goal setting and planning | 8-level plan UI, deterministic fallback, Gemini plan endpoint | Implemented foundation |
| Goal/task governance | Goal Execution Control Plane and Universal Orchestrator implement guarded state machines, dependencies, authorization, evidence and recovery | Implemented as isolated modules; not wired into the production App/server task path |
| Task execution | Durable task execution records and idempotency exist | **Critical gap:** current execution endpoint generates a completion narrative and marks the task complete; it does not dispatch the requested real-world work to a tool/adapter |
| Business portfolio | Venture, income-stream, sales-report models and Business Lab UI | Partial planning/dashboard foundation; not a live operating portfolio |
| Venture-level accounting | Owner-level BTC ledger and double-entry journal exist | Missing venture-level books and venture IDs on ledger/journal postings; separate venture accounting is not implemented |
| Finance / accounting | BTC-only wallet policy, settlement checks, six-confirmation verification, reconciliation, journal, outbox and financial truth functions | Strong BTC accounting foundation; not a full accountant/banking system |
| Stocks / forex / self-trading | No brokerage, exchange, market execution, custody, or position-management integration found | Missing |
| Research / opportunity radar | Gemini Google Search grounding when configured; heuristic fallback when not configured | Partial; offline mode is not live research, and generated analysis must not be treated as independently verified facts |
| Memory / learning | Owner-entered memories and workspace persistence; teach endpoint can synthesize memory content | Partial; not a complete durable knowledge graph/vector retrieval or self-improving learning loop |
| Voice / vision | Browser microphone/transcription, TTS, image upload/analysis UI and server endpoints | Implemented foundation; real device/browser compatibility and model access not end-to-end verified |
| Phone assistant | Fail-closed incoming-call policy and tests | Policy only; no Android/native call bridge and no call answering |
| Browser agent | HTTPS-origin validation, session/action persistence, approval states, challenge handling and evidence fields | Policy/store only; no browser runtime, navigation executor or app integration |
| Engineering / app builder | Product Engineering and Engineering Control Plane provide plans, workspace file operations, bounded commands, Git/checkpoint concepts | Partial foundations; not connected to Jerry's main execution path or a complete CI/deploy runtime |
| Self-programming / self-upgrade | Code proposal generation and static security checks | **Critical gap:** JS/TS verification only transforms syntax; it does not execute supplied tests. For non-JS languages, a test string longer than eight characters can be marked passed without running it. No production deployment implementation was found |
| Security / approvals | Firebase bearer verification with revocation checking, owner-UID-scoped records, expiring/scope-hashed approvals, one-time consumption/reservation, hash-chained audit log, encrypted backup/restore | Strong foundations; owner-only identity policy is incomplete |
| Multi-agent specialists | Specialist roles are represented in engineering control-plane data | Not independent running agents; tests explicitly treat them as roles, not connected agents |
| Email, calendar, CRM, banking, errands | No complete live adapters found | Missing |

## Critical findings requiring remediation before autonomous operation

### P0 — Owner-only access is not enforced

The API accepts any valid Firebase ID token. The workspace bootstrap creates a new user/workspace for any authenticated UID. This provides tenant separation, but it does not enforce the roadmap requirement that Jerry is strictly for one owner. Add a server-side owner UID allowlist/claim and deny all other Firebase identities before any workspace or action route.

### P0 — Task completion can be reported without doing the task

`POST /api/jerry/execute-task` starts a durable task record, creates a fallback or Gemini-generated completion narrative, then completes the task. No action adapter is called. The fallback even describes a task as executed while labeling its revenue as projected and deliberately creating no settlement. This must be replaced by an adapter-driven executor that requires output/evidence; until then, tasks must remain planned/blocked and must not be marked completed or revenue-generating.

### P0 — Seed/demo business metrics can look like real operating results

`INITIAL_JERRY_STATE` contains pre-populated ventures, customer counts, monthly revenue/expense figures, sales reports, a proactive message claiming work was completed, and sample vision analysis. These are example fixtures, not evidence of actual businesses or revenue. Fresh owner workspaces must start with zero/empty financial and operating facts, or every fixture must be unmistakably labeled DEMO and excluded from financial totals and decisions.

### P1 — Self-upgrade verification is not real test execution

The verification route checks JavaScript/TypeScript syntax using esbuild but does not run the supplied test code. For other languages it marks a proposal passed based only on test-code length. The security scan is a small regex denylist, not a sandbox or semantic policy proof. No deploy route was found. Self-upgrade must remain proposal-only until isolated execution, meaningful assertions, review, owner authorization, artifact signing, rollback and deployment evidence exist.

### P1 — The new architecture divisions are disconnected

Production `App.tsx` and `server.ts` do not import/use the Universal Orchestrator, Goal Execution Control Plane, Product Engineering, Browser Agent, Engineering Control Plane, or Hands-Free Engine. Their tests demonstrate isolated logic, not integrated product behavior. One shared execution service must route all task types through common identity, authorization, approval, idempotency, evidence, audit and recovery controls.

### P1 — Multi-business accounting is not separated

Business ventures exist as dashboard records, but financial transaction/journal structures are user/tenant scoped rather than venture scoped. Portfolio totals can be shown, but separate books, cash ownership, liabilities, budgets, permissions and per-venture reconciliations are not established.

### P1 — Local policy stores need ownership integration before exposure

Browser and engineering control-plane SQLite stores do not carry owner UID tenancy fields and are not currently wired to authenticated API routes. Do not expose them to multiple identities until they are bound to the owner and shared authorization/audit controls.

## What is genuinely working as a foundation

- Firebase bearer-token validation requests revocation checking.
- Workspace, approvals, tasks, idempotency and financial records are tenant-scoped in PostgreSQL.
- Financial state is protected from generic client workspace overwrites.
- Workspace mutations use a per-user PostgreSQL advisory lock.
- High-impact approvals are time-limited, scope-hashed and consumed/reserved once.
- Security audit events are hash chained and verifiable.
- Wallet policy is deliberately restricted to native Bitcoin mainnet; BTC amounts use satoshi atomic units.
- Incoming BTC settlement checks the exact configured receiving address/amount; chain finality and reorg reconciliation are represented.
- Double-entry posting logic enforces per-asset balance and immutable posted entries in its tested foundation.
- Goal planning, task dependency rules, approval gates, checkpoints and evidence classification have substantial unit-test coverage.
- Browser and engineering policy modules deny unsafe origins/commands and require evidence before completion in their isolated tests.

## Recommended integrated implementation order

1. **Protect truth and identity:** enforce the single owner UID; remove or explicitly isolate demo financial fixtures; prevent simulated task execution from becoming a completed task or revenue.
2. **Create one execution spine:** connect App/server workflows to the Universal Orchestrator and Goal Execution Control Plane; use a common adapter contract with authorization, approval, idempotency, checkpoints, evidence, audit and recovery.
3. **Build venture isolation:** introduce venture IDs, separate venture books/accounts, budgets and permissions, and portfolio-level consolidation with reconciliation.
4. **Connect engineering and browser runtimes:** isolated workspaces and browser profiles, SSRF-safe navigation, bounded tool execution, independent verification, owner approval and rollback.
5. **Complete self-upgrade safely:** execute tests in language-specific disposable sandboxes; reject unsupported languages rather than passing them heuristically; require signed artifacts, owner authorization and rollback.
6. **Add real-world adapters:** email/calendar/CRM, phone bridge, banking and brokerage only with explicit provider integration and least-privilege credentials; trading and money movement remain owner-approved.
7. **Release verification:** install with the frozen lockfile, run typecheck/build/full unit suite, PostgreSQL integration suite, real Firebase revocation gate, then deploy and independently verify each division.

## Overall verdict

**Not release-ready as a fully autonomous Jerry.** The archive contains a meaningful authenticated application, tested financial/security foundations, planning interfaces and several useful isolated control-plane modules. It does not yet deliver the complete unified Hybrid Intelligence roadmap. The most urgent risks are owner identity enforcement, simulated task completion, demo financial figures, and disconnected control-plane modules. Preserve the working BTC/security foundations; integrate and extend them rather than replacing them.
