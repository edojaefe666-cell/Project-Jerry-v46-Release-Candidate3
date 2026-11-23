# Jerry v46 — Initial Roadmap Audit and Evidence Register
**Audit date:** 2026-11-23  
**Scope:** Public GitHub repository state and workflow evidence visible to the audit.  
**Roadmap baseline:** `docs/PROJECT_JERRY_UNIFIED_MASTER_ROADMAP.md` on branch `roadmap/jerry-unified-master-plan`.  
**Source baseline:** main branch head `b3f70ebedd2c8e472b4939df925d8f96ecd0babe`.

## 1. Executive finding
**Overall status: NOT VERIFIED / implementation audit blocked.**

The GitHub repository's default branch currently exposes the v46 application as a ZIP archive, alongside workflow and setup files. The application source is not present as an extracted, inspectable source tree in the repository. The ZIP is a binary GitHub object; the available repository inspection interface returned no readable source for it. The prior conversation's uploaded ZIP is not available in the current working filesystem. Therefore this report does not invent file-level implementation claims or mark capabilities complete based only on filenames, test names, or documentation titles.

The immediate prerequisite for a defensible code-level audit is access to the exact current v46 ZIP (or an extracted source tree) so it can be inspected and tested. Keep the ZIP as the immutable baseline until a verified source snapshot is recorded.

## 2. Repository structure observed
At main head `b3f70eb`, the recursive Git tree exposed:
- `.github/workflows/firebase-release-gate.yml`
- `.github/workflows/repair-bun-lock.yml`
- `scripts/setup-jerry-github-oidc.sh`
- `Project-Jerry-v46-corrected-release-candidate.zip` (2,142,221 bytes)

No extracted application source files, root `package.json`, or application test files were present in the visible repository tree. The Firebase workflow extracts the ZIP and locates `package.json` inside it.

## 3. CI and release evidence
GitHub Actions history visible at audit time:
- Jerry Repair Bun Lockfile runs #1 and #2: **success**.
- Jerry CI runs #5 and #6 on branch `v46-verification-progress`: **success**. These results are not proof that the current main ZIP or current roadmap branch passed the same checks.
- Jerry Firebase Release Gate runs #1 through #9 on main: **failure**.
- The latest visible Firebase run #9 used source SHA `6a2bbe764b993529d688489544d943bfb5180eb3`, not current main SHA `b3f70eb`. It passed checkout, ZIP extraction, Bun setup, and frozen dependency installation, then failed at the Firebase integration test step. The OIDC and Secret Manager steps now present in the latest workflow were not present in that older run's executed step list. Therefore run #9 does not validate the new OIDC workflow.
- Cloud-side setup was previously blocked by `UREQ_PROJECT_BILLING_NOT_FOUND`; billing/API enablement remains unverified.
- No successful end-to-end Firebase authentication/revocation integration run is evidenced here.

## 4. Initial roadmap status matrix
The classifications below are deliberately conservative. "Exists in roadmap" is not equivalent to "exists in code".

| Division / capability | Initial status | Evidence required before promotion |
|---|---|---|
| Owner-only identity and access | Not verified | Inspect auth implementation, MFA/session controls, authorization tests, negative access tests |
| Hybrid Intelligence policy and approvals | Not verified | Central policy engine; approval records; deny-by-default tests for sensitive actions |
| Jerry Core / shared orchestration | Not verified | Trace a single request through intent, policy, planner, tools, memory, and audit |
| Memory and knowledge | Not verified | Persistence, retrieval, provenance, consent, retention, correction and isolation tests |
| Planner and goals | Not verified | Persisted goals, dependencies, scheduling, progress and successful execution evidence |
| Research and fact verification | Not verified | Source capture, citation provenance, freshness, conflict handling and hallucination checks |
| Tool registry and execution | Not verified | Typed tools, scoped credentials, retries, idempotency, approvals and audit traces |
| Engineering / app development | Not verified | Real build, test, review, secure deploy and rollback on a sample application |
| Personal assistant / phone / voice | Not verified | Device/voice integration, permissions, task completion, interruptions and recovery |
| Business creation and portfolio | Not verified | Venture lifecycle, separate books/data, operational workflows and portfolio reporting |
| Sales / CRM / marketing / influencing | Not verified | Real CRM lifecycle, consent-based outreach, pipeline and attributable results |
| Accounting / banking / finance | Not verified | Double-entry integrity, reconciliation, read-only bank integration, permissions and audit |
| Stocks / forex trading | Not verified | Historical backtests, paper-trading evidence, hard risk limits and owner-gated live path |
| Security / privacy / resilience | Not verified | Threat model, secret scanning, access boundaries, backup/restore and incident tests |
| Learning / self-upgrade | Not verified | Evaluation harness, sandboxed proposals, regression gates, approvals and rollback |
| Manual upgrade/build prompt boxes | Not verified | Owner-only UI, scoped generation, preview, tests, approval and traceable artifact output |

## 5. Confirmed workflow observations
The current Firebase workflow:
1. Checks out the repository.
2. Finds and extracts a ZIP release candidate.
3. Locates `package.json` within the extracted project.
4. Installs Bun 1.4.4 and dependencies with `bun install --frozen-lockfile`.
5. Authenticates to Google Cloud with GitHub OIDC.
6. Retrieves a Firebase Admin service-account JSON document from Secret Manager.
7. Runs `bun run test:firebase`.

This is evidence of a proposed release-test path, not proof the path succeeds. The service-account JSON remains a long-lived credential in Secret Manager; it is not stored in GitHub, but key lifecycle, rotation, and least-privilege access still require review.

The OIDC setup script hardcodes repository ID `1461307934`, which matches the GitHub repository metadata observed during this audit. The provider condition currently restricts the subject to repository ID and `refs/heads/main`. Confirm that the workflow's intended trigger branch and Secret Manager IAM permissions align before relying on this setup. Do not broaden trust to arbitrary branches.

## 6. Architecture risks to test after source is available
- Multiple modules may exist without a shared policy/identity boundary. Trace authorization across every tool and agent.
- Verify that no specialist agent can independently grant itself permissions or bypass owner approvals.
- Verify cross-business separation: separate ledgers, customer data, credentials, budgets, and audit trails.
- Verify accounting invariants and financial reconciliation rather than trusting UI balances.
- Verify retries cannot duplicate payments, trades, messages, or other external side effects.
- Verify prompt-injection and untrusted web/file content cannot issue privileged tool calls.
- Verify self-upgrade cannot modify policy, authentication, approval, or kill-switch controls.
- Verify secrets never enter source, prompts, logs, artifacts, or test output.
- Verify all external commitments and high-impact production changes have explicit owner authorization.

## 7. Required next audit pass
Once the source archive is available:
1. Record SHA-256 and archive inventory; extract to a clean workspace.
2. Read the full README, release contract, capability reconciliation, security and architecture documents.
3. Inspect the actual source tree, dependencies, environment-variable use, database schema, migrations, API routes, UI routes, and connector implementations.
4. Map every original and roadmap requirement to exact source files, runtime paths, tests, and deployment evidence.
5. Run lockfile validation, lint/typecheck, unit tests, integration tests, security checks, production build, and release verification.
6. Inspect test quality: mocks vs real services, negative cases, isolation, boundary conditions, and flaky/skipped tests.
7. Build a dependency graph and shared architecture plan; identify duplicate modules and competing sources of truth.
8. Implement in small, reviewable changes, with regression tests and owner approval gates.
9. Run end-to-end tests in a real staging environment; record logs and artifact hashes.
10. Update each status using the maturity ladder: Missing → Designed → Scaffolded → Implemented → Tested → Deployed → Independently Verified.

## 8. Release decision
**Do not declare v46 release-ready.** The Firebase integration gate is still failing in the last visible run, and the new OIDC workflow has not yet been evidenced by a successful run. Do not begin high-impact production actions or live financial integrations until security and release gates are independently verified.

## 9. Audit honesty statement
This is an initial repository/workflow evidence audit, not a completed application source audit. The absence of readable source in the current inspection path is a hard evidence gap. No feature is promoted to "working" without direct implementation and test evidence.
