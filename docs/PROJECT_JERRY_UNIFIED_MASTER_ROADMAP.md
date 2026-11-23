# PROJECT JERRY — UNIFIED MASTER ROADMAP
**Version:** 2.0  
**Status:** Authoritative product vision and delivery blueprint; implementation and release gates remain separately verified.  
**Operating philosophy:** Hybrid Intelligence  
**Ownership:** Private, owner-only system. No multi-user product or shared tenant access unless the owner explicitly changes this requirement.

## 1. North-star vision
Jerry is one integrated, private intelligence and execution system that helps its owner think, learn, research, engineer, build, operate, protect, and grow. It must preserve every capability in the original vision while connecting them through one identity, memory, policy, planning, tool, data, and audit architecture.

Jerry is not a collection of unrelated chatbots, nor merely an assistant for individual opportunities. Its long-term ambition includes discovering, creating, owning/operating under the owner's direction, and managing a portfolio of independent businesses and diversified income streams.

## 2. Original vision — preserved
The following requirements are retained as first-class product intent:
- Engineering; influencing; achieving goals; human perspective; economy; management; execution; research; competition; income orientation.
- Conversationalist; self-sufficient trader for stocks and forex; business manager; accountant; friend; researcher.
- Broad programming-language competence; sales agent; security; banking; app developer; trend/business generator.
- Phone assistant; economist; online errands; task manager; execution; learner; self-upgrading; influencer; goal setter; income generator; helper; worker; builder; continuous learning.
- Manual Jerry Upgrade Prompt Box; manual Build Anything with Jerry Prompt Box.
- Strictly for the owner alone.

These are product ambitions, not claims that every capability is already implemented or safe for unrestricted autonomy.

## 3. Hybrid Intelligence constitution
1. **Autonomous within policy:** Jerry may research, reason, draft, plan, code, test, monitor, organize, and execute pre-approved, reversible, low-risk tasks.
2. **Consultative:** Jerry presents options, evidence, costs, risks, trade-offs, and a recommendation for important decisions.
3. **Owner authorization required:** banking and money movement; live trading; borrowing or credit; investment allocations; signing contracts; purchases above owner-set limits; external publication or binding communications; hiring/firing; access-control changes; destructive actions; production releases; changes to core security or autonomy policy.
4. **Least privilege:** tools and agents receive only the permissions needed for the current task.
5. **No silent escalation:** a task cannot grant itself broader permissions, identities, budgets, or access.
6. **Truthfulness:** distinguish proposed, scaffolded, implemented, tested, deployed, and independently verified capabilities.
7. **Human dignity:** influencing and persuasion must be transparent, lawful, non-coercive, and respect consent.
8. **Fail safely:** uncertainty, policy conflicts, suspicious inputs, or missing evidence stop the risky action and request owner review.

## 4. One-Jerry architecture
All capabilities use shared services rather than independent silos:
- **Jerry Core:** identity, conversation, intent understanding, reasoning, routing, policy enforcement, and response synthesis.
- **Owner Identity & Access:** owner authentication, device/session trust, step-up authentication, recovery, authorization scopes, and emergency lock.
- **Memory & Knowledge:** durable owner-approved memory, episodic/project memory, searchable knowledge, provenance, retention, correction, export, and deletion workflows.
- **Planner & Goal Engine:** goals, milestones, priorities, dependencies, budgets, schedules, progress, and outcome measurement.
- **Research & Truth Engine:** web/document research, source quality, citations, fact checking, uncertainty, market/competitor intelligence, and decision briefs.
- **Tool & Execution Fabric:** typed tool registry, connectors, browser/device automation, files, APIs, queues, retries, idempotency, and human approval gates.
- **Specialist Skills/Agents:** engineering, finance, business, sales, marketing, operations, research, security, accounting, personal assistance. Agents are bounded workers under one Jerry identity and policy—not independent authorities.
- **Data & Integration Layer:** canonical records, event bus, APIs, integration adapters, tenant isolation, data lineage, and reconciliation.
- **Observability & Governance:** audit trail, traces, metrics, alerts, policy decisions, incident response, cost controls, and release evidence.
- **Learning & Evolution:** evaluations, feedback, controlled experiments, model/tool versioning, regression tests, staged rollout, and rollback.

## 5. Capability divisions

### A. Intelligence, conversation, and human perspective
Natural conversation; context awareness; critical thinking; structured reasoning; emotional awareness without pretending to be human; multilingual interaction; voice and hands-free interaction; text/image/audio/document understanding where supported; clear explanations; memory-aware assistance; accessibility; source verification; uncertainty disclosure.

### B. Personal assistant and everyday execution
Phone assistant; task and calendar planning; reminders; online errands; document and file handling; email/message drafting; travel and service research; shopping comparisons; form preparation; workflow automation; device-aware assistance where permissions allow. External sending, purchases, bookings, and commitments follow configured approval limits.

### C. Engineering and product creation
Software architecture; requirements; UI/UX; frontend/backend/mobile development; databases; APIs; integrations; testing; security engineering; DevOps/CI/CD; cloud infrastructure; observability; documentation; debugging; code review; version control; app publishing. Language competence is demonstrated by task-specific tested output, not a claim of omniscience.

### D. Research, economy, and competition
Market and industry research; economic analysis; competitor monitoring; trend detection; customer discovery; opportunity scoring; feasibility; pricing; risk analysis; forecasting; evidence-backed strategy; research library and knowledge graph.

### E. Enterprise and wealth-building portfolio
Jerry must help the owner build and manage multiple independent ventures and income streams:
- Venture discovery, validation, business model design, feasibility and portfolio prioritization.
- Business formation checklists and professional referrals; brand, product, service, website, app, and go-to-market creation.
- Separate business workspaces, books, budgets, bank/payment integrations, customers, suppliers, inventory, contracts, and performance records.
- Portfolio-level dashboards for revenue, gross margin, operating profit, cash flow, runway, liabilities, concentration, and risk.
- Operations management: SOPs, procurement, fulfilment, quality, staffing workflows, customer support, service levels, and incident handling.
- Growth: sales pipeline, CRM, lead qualification, proposals, campaigns, retention, partnerships, and expansion.
- Exit, pause, restructure, or close recommendations with owner authorization for binding actions.
Each venture remains separately accounted for and permissioned, while Jerry provides unified portfolio oversight.

### F. Sales, marketing, influencing, and creator operations
Ethical sales pipeline; CRM; customer research; proposals; customer support; marketing plans; content generation; brand consistency; social publishing workflows; analytics; partnerships; reputation monitoring. No deceptive impersonation, spam, fabricated testimonials, or manipulative targeting.

### G. Finance, accounting, banking, and trading
Bookkeeping; chart of accounts; double-entry ledger; reconciliation; invoicing; payables/receivables; budgeting; cash-flow forecasting; management accounts; tax-ready records and jurisdiction-specific tax research; fraud/anomaly detection; treasury visibility; portfolio reporting.
Stocks/forex capabilities progress through research, paper trading, backtesting, risk controls, broker sandbox, and only then owner-authorized live execution. Live trading and transfers are never enabled by self-upgrade. Enforce position sizing, exposure limits, drawdown stops, instrument allowlists, kill switch, and full audit logs. Banking access starts read-only wherever possible; money movement requires step-up owner approval and transaction-specific limits.

### H. Security, privacy, and resilience
Owner-only access; strong authentication; device/session management; encryption in transit and at rest; secrets management; key rotation; least privilege; secure tenant/data boundaries; prompt-injection and untrusted-content defenses; tool allowlists; sandboxing; dependency and supply-chain scanning; backups; disaster recovery; audit logs; anomaly detection; incident response; data export/deletion; safe shutdown and emergency lock. Never store credentials in prompts, source code, or logs.

### I. Business management and accounting
Business dashboards; operational planning; staffing and role workflows; policy/SOP management; performance metrics; unit economics; management reporting; compliance calendars; supplier and customer records; audit-ready documentation.

### J. Learning, self-upgrading, and manual prompt workspaces
Two explicit owner-controlled workspaces:
- **Jerry Upgrade Prompt Box:** propose changes to Jerry's own capabilities, policies, tools, prompts, and architecture.
- **Build Anything with Jerry Prompt Box:** turn owner instructions into scoped plans, prototypes, code, tests, and deliverables.
All self-improvement follows propose → explain impact → owner approval where required → isolated branch/sandbox → tests/evaluations/security review → staged release → monitor → rollback. Jerry cannot rewrite its own authorization rules or remove owner controls.

## 6. Enterprise portfolio model
Represent each venture as a distinct managed entity with its own:
- Identity, ownership/authority record, legal and jurisdiction metadata.
- Business model, product/service catalogue, customers, suppliers, and operating procedures.
- Dedicated books, accounts, budgets, cash flows, assets, liabilities, and tax records.
- Team/agent assignments, tool permissions, spend limits, and approval matrix.
- KPIs, risks, milestones, evidence, and audit history.
A portfolio layer aggregates performance without mixing legal entities, funds, customer data, or accounting ledgers. Inter-company transfers and shared services require explicit rules and auditability.

## 7. Delivery sequence — build one integrated system
**Phase 0 — Baseline and truth:** freeze a known source snapshot; inventory code, docs, dependencies, environments, secrets references, tests, deployed resources, and release gates. Classify every capability as missing, designed, scaffolded, implemented, tested, deployed, or independently verified. Do not restart already completed gates; resume at the first unverified gate. Firebase integration remains blocked until cloud billing/API prerequisites and credentials are correctly configured and the real test passes.

**Phase 1 — Secure foundation:** owner identity, authorization policy, secrets, audit, tenant/data isolation, typed tool registry, error handling, CI, backup, and release controls.

**Phase 2 — Unified Jerry Core:** conversation, intent router, memory, knowledge, planner, research, task state, and shared execution orchestration.

**Phase 3 — Reliable execution:** queues, idempotency, retries, browser/API/file automation, notifications, approvals, monitoring, and recovery.

**Phase 4 — Engineering and creation:** build/test/review/deploy workflows and both prompt workspaces, with safe sandboxing and rollback.

**Phase 5 — Personal assistant and specialist capabilities:** phone/voice, calendar/tasks, communications, document workflows, research, and bounded specialist agents.

**Phase 6 — Enterprise portfolio:** opportunity discovery, venture workspaces, CRM/sales, marketing, operations, accounting, and consolidated portfolio reporting.

**Phase 7 — Advanced finance:** accounting integrity, read-only banking, reconciliation, financial analytics, paper trading/backtesting, then separately gated owner-authorized live financial integrations.

**Phase 8 — Learning and controlled evolution:** evaluation suites, feedback loops, performance optimization, model/tool updates, staged releases, and regression protection.

Phases may be developed in parallel only where dependencies and security boundaries allow. Release is evidence-based, not date-based.

## 8. Definition of done
A capability is not complete because a file, UI, test name, or mock exists. Each capability must have:
- Clear user stories and acceptance criteria.
- Real implementation wired to the shared Jerry Core and authorization policy.
- Positive, negative, boundary, failure, and recovery tests.
- Security/privacy review and least-privilege permissions.
- Observability, audit events, cost limits, and operator documentation.
- Demonstrated end-to-end behavior in the intended environment.
- Release evidence and rollback path.
Use these maturity labels consistently: **Missing → Designed → Scaffolded → Implemented → Tested → Deployed → Independently Verified**. Never skip a state in reporting.

## 9. Initial capability acceptance map
| Original capability | Required end state / evidence |
|---|---|
| Engineering / app developer / programming languages | Tested end-to-end build, review, test, secure deploy workflows |
| Influencing / influencer / sales agent | Ethical CRM, campaign, content, sales and conversion workflows |
| Goals / goal achievement / task manager | Persistent goals, milestones, dependency planning and measured completion |
| Human perspective / friend / conversationist | Context-aware, respectful, multimodal conversation with honest boundaries |
| Economy / economist / research / competition | Cited market/economic research, forecasts, competitor and trend intelligence |
| Management / business manager / accountant | Real operating controls, separated ledgers, reconciliation and reports |
| Execution / errands / worker / helper | Permissioned real-world tool execution with approvals, logs and recovery |
| Self-sufficient stock/forex trader | Backtesting, paper trading, hard risk limits; live execution only by owner authorization |
| Banking / security | Secure integrations, read-only first, transaction-level authorization, audit and kill switch |
| Trend business / income generator | Validated ventures, revenue attribution, portfolio management and profitability evidence |
| Phone assistant | Reliable mobile/voice workflows, permissions, interruption and recovery |
| Learner / self-upgrading | Evaluations, controlled change proposals, staged rollout and rollback |
| Manual upgrade/build prompt boxes | Owner-only scoped workspaces with preview, approval, sandbox and audit |
| Strictly for owner alone | Verified owner authentication, no unauthorized users, secure data boundaries |

## 10. Immediate next engineering actions
1. Establish the current repository state and exact default-branch head; preserve existing work.
2. Inspect the release archive and workflow files; produce a factual capability inventory and test evidence matrix.
3. Resume the existing Firebase release gate at its actual blocker; do not claim a pass until the real integration test succeeds.
4. Convert this roadmap into a traceable backlog with dependencies, acceptance tests, and owners.
5. Implement in small reviewable branches/PRs, starting with security and core integration prerequisites.
6. Keep a living status ledger that links every claim to code, test output, deployment evidence, or an explicit blocker.

## 11. Non-goals and hard boundaries
Jerry must not become an unrestricted autonomous actor. It must not self-authorize financial actions, bypass owner controls, fabricate results, mix business funds or records, impersonate people, manipulate users, or silently publish/commit/deploy high-impact changes. Capability growth must increase reliability and usefulness without weakening owner sovereignty.
