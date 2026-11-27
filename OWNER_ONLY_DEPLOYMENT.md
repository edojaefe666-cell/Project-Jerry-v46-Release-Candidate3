# Jerry owner-only deployment

Jerry is a private, single-owner system. Firebase token validity is not equivalent to owner authorization.

## Production requirement
Configure the server-side secret `JERRY_OWNER_UID` with the sole owner's Firebase Authentication UID. Do not expose it in client-side Vite variables, Android resources, or source control.

With `NODE_ENV=production`, requests fail closed with HTTP 503 if the owner UID is absent. A valid Firebase identity with a different UID receives HTTP 403. Firebase token revocation checking remains enabled. Whenever an owner UID is configured, it is enforced in every environment.

## Zero-paid-services pre-revenue policy

- Hosted billable model providers (Google, OpenAI, Anthropic), hosted multimodal generation, speech, transcription, and Tavily live research are blocked unless `JERRY_PAID_SERVICES_ENABLED=1`.
- The default is disabled. Do not enable paid services until Jerry has generated independently verified revenue and the owner explicitly approves the spending arrangement.
- Local loopback model execution and public endpoints that do not require a paid account remain available subject to their own security controls. A provider's advertised free quota is not treated as proof that the account cannot incur charges.
- Token, operation, and USD budgets remain additional safeguards; they do not override this pre-revenue spending gate.
- Do not place provider credentials in the Android app. Hosted credentials remain server-side only.

## Container health and readiness

- `GET /healthz` is a public liveness probe. It only confirms that the HTTP process is responding; it does not claim PostgreSQL or owner authentication is ready.
- `GET /readyz` is a public, non-diagnostic readiness probe. In production it requires `JERRY_OWNER_UID`, a reachable PostgreSQL database, the SQL migration registry with the latest required migration applied, and a readable shared execution-control record. It returns only `{ "status": "ready" }` or a generic HTTP 503 `{ "status": "not_ready" }`; it never returns database errors, owner identifiers, or secret values.
- Apply the numbered SQL migrations before routing user traffic to a new deployment. Configure the orchestrator to use `/healthz` for liveness and `/readyz` for readiness. Do not use the liveness endpoint as proof that Jerry is connected.

## Android release artifacts and signing

- CI builds the debug APK and an unsigned release APK candidate, runs Android unit tests and lint, launches the bundled UI on an Android 10 (API 29) emulator, and publishes SHA-256 checksums with both artifacts. Physical testing on the owner's Infinix device remains a separate release check.
- The unsigned release candidate is a verification artifact, not an installable final release. Do not distribute it.
- Production signing requires an owner-controlled Android upload/release key. Never generate or store the production signing key in source control, the Android app, or chat. Configure signing only after the owner has safely created and backed up the key and explicitly authorized its use.
- The connected release APK additionally requires a verified HTTPS backend origin. The CI placeholder origin is intentionally blocked by the Android API client and does not constitute a connected build.

## Rollout
1. Independently verify the owner's Firebase UID.
2. Store it in the server secret manager as `JERRY_OWNER_UID`.
3. Deploy with `NODE_ENV=production`.
4. Verify owner access and denial of a second test identity.
5. Keep financial commitments, external actions, destructive operations, production releases, and security-policy changes behind scoped owner approval.

This control does not replace action-level approvals, audit logging, tenant isolation, or the independent emergency stop.


## Emergency stop

- The owner-only API exposes `GET /api/security/emergency-stop` and `POST /api/security/emergency-stop`.
- A new security store starts with the emergency stop engaged. A legacy untouched system-default latch is also migrated to stopped; an explicit owner resume is preserved across restarts. The owner must review recovery conditions and explicitly resume before transfer staging can be enabled.
- To stop, submit `{ "action": "stop", "reason": "..." }`. This latches the stop in the local security SQLite store and records an audit event.
- Outgoing Bitcoin transfer staging is blocked with HTTP 423 while the latch is active.
- To resume, submit `{ "action": "resume", "reason": "...", "confirmation": "RESUME_JERRY_EXECUTION" }`. Recovery is an explicit owner action and is recorded in the audit chain.
- The independent deployment/operator hard stop is `JERRY_EMERGENCY_STOP=1`. The application API cannot clear this environment-level switch; an operator must remove it through the deployment control plane.
- If the security control store cannot be read, the application fails closed and blocks transfer staging.
- This is an application-side stop for the currently implemented outgoing-transfer staging boundary. No Bitcoin broadcast implementation exists in this branch. Future external execution adapters must enforce the same stop independently at their own execution boundary before they are enabled.


## Android sign-in and device permissions

- The Android WebView uses the native Google Credential Manager flow. It obtains a Google ID token through Android system UI and exchanges that token with Firebase Web Auth using the public web OAuth client ID. The Android APK contains no OAuth client secret.
- Register the Android application ID `com.projectjerry.android` in the Firebase project and register the SHA-1/SHA-256 fingerprints for the actual signing certificate in Google/Firebase configuration. The CI debug APK is a build-verification artifact and its ephemeral runner signing certificate is not a production signing identity.
- Before a distributable release, create and protect a stable owner-controlled release signing key outside the repository and CI logs. Configure signing through protected CI secrets or the owner's secure local build environment. Never commit the keystore or passwords.
- The app requests microphone permission only when its trusted local WebView asks for audio capture. Other WebView origins and non-audio capture requests are denied. Contacts and phone-state permissions are not requested because the current Android features do not need them.
- Physical-device verification must confirm Google sign-in, token refresh, owner-only API access, microphone consent and sign-out on Android 10. CI compilation alone does not prove these device flows work.

## Android build connectivity

The Android CI workflow reads the non-secret GitHub Actions repository variable `JERRY_BACKEND_ORIGIN` and embeds that HTTPS origin as `VITE_API_BASE_URL` in the Android web assets. Configure it under **Repository Settings → Secrets and variables → Actions → Variables** only after a real backend is deployed and its HTTPS origin is verified. The variable must be a clean origin (scheme and host only; no path, credentials, query or fragment). If it is absent, CI deliberately falls back to `https://jerry-backend.invalid`; the Android API client detects that placeholder and returns a clear backend-not-connected error for API calls. That APK is a build-verification artifact, not a connected release APK. The workflow validates the origin before building. After setting the variable, rebuild and verify Firebase owner authentication, database migrations, emergency-stop behavior and provider configuration against that deployment. Never put provider credentials or owner UID values in Vite variables or APK assets.


## Cloud backend container

The repository now includes a multi-stage `Dockerfile` for the production API and bundled web UI. The image runs `bun server.ts` with `NODE_ENV=production`; it does not contain a provider key, Firebase service-account key, owner UID, database password, or backend origin. `.dockerignore` excludes local environment files, Git history, Android outputs, and build artifacts from the build context.

Release sequence (run only after selecting and authorizing a hosting environment):

1. Build the image with `docker build -t jerry-backend .`.
2. Provision a PostgreSQL database and configure the application secrets/environment variables in the hosting platform's secret manager.
3. Run the migration command once as a release job using the exact same image and production database configuration: `bun run db:migrate`.
4. Start the application container with the same database and authentication configuration. Do not run schema migrations concurrently from every replica.
5. Verify owner-only Firebase authentication, database readiness, shared emergency-stop state, provider budgets, and API smoke tests before configuring the Android backend origin.
6. Set the non-secret GitHub Actions repository variable `JERRY_BACKEND_ORIGIN` to the verified HTTPS origin and rebuild the Android APK.

Required production configuration includes `JERRY_OWNER_UID`, Firebase Admin Application Default Credentials (prefer the hosting platform's workload identity; otherwise use a secret-mounted credentials file), PostgreSQL connection variables (`SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`), and the explicitly approved provider/budget settings. Never bake credentials into the container image or Vite/Android assets.

This adds reproducible packaging only. No cloud provider has been selected, no database has been provisioned, no secrets have been configured, and no production deployment has occurred. Hosting costs and production deployment require explicit owner approval.

## Jerry Brain model providers

The authenticated chat route `POST /api/jerry/chat` and the provider-neutral generation route `POST /api/brain/generate` use server-side model adapters. They do not expose provider credentials to the browser or Android APK.

Configure only the providers you intend to use in the cloud server's secret manager:

- `GEMINI_API_KEY` (or `GOOGLE_AI_API_KEY`); optional model override `JERRY_GOOGLE_MODEL`
- `OPENAI_API_KEY`; optional model override `JERRY_OPENAI_MODEL`
- `ANTHROPIC_API_KEY`; optional model override `JERRY_ANTHROPIC_MODEL`
- `TAVILY_API_KEY` for Opportunity Radar source retrieval; keep it server-side and configure provider usage limits.
- Optional local OpenAI-compatible endpoint: `JERRY_LOCAL_MODEL_ENABLED=1`, `JERRY_LOCAL_MODEL_URL=http://127.0.0.1:11434`, and optional `JERRY_LOCAL_MODEL_NAME`. The local adapter rejects non-loopback hosts.

Never place provider keys in `VITE_*` variables, Android resources, APK assets, source control, or chat messages. Do not configure a provider unless its endpoint, model identifier, billing and data-handling terms have been reviewed. The service returns an unavailable response when no provider is configured; it does not fabricate an AI answer.

The current Brain adapter supports text chat, planning, research and coding prompts. Jerry Vision, speech generation and audio transcription now use server-side provider-neutral multimodal adapters. Vision supports Google Gemini and OpenAI image inputs; speech generation supports Google Gemini and OpenAI audio generation; transcription supports Google Gemini and OpenAI audio transcription. Optional model overrides are `JERRY_GOOGLE_TTS_MODEL`, `JERRY_OPENAI_TTS_MODEL`, `JERRY_GOOGLE_TRANSCRIPTION_MODEL`, and `JERRY_OPENAI_TRANSCRIPTION_MODEL`. Verify each configured model supports the requested modality before enabling it. Speech returns device/browser synthesis fallback only when no server speech provider is configured; provider failures return an error rather than fabricated audio. Vision and transcription responses are model outputs, not independently verified facts. Provider fallback is an availability mechanism, not a guarantee of identical model behavior or data residency across providers.


## AI request limits

The authenticated Brain generation route is limited to 20 requests per owner per minute, chat to 30, goal planning and opportunity assessment to 10 each, and the Jerry TTS/transcription routes to 20 combined per owner per minute. Responses over the limit return HTTP 429 with a `Retry-After` header. The in-process limiter bounds retained owner buckets and resets windows automatically.

These limits are a local abuse/cost guard, not a distributed quota system. A multi-instance production deployment must also enforce shared rate limits and provider-side spending/usage caps at the gateway or provider account. Provider keys should have least privilege and alerts/limits configured where supported.


## Daily business opportunity discovery

`POST /api/jerry/discover-daily-ways` is a research and idea-generation endpoint only. It no longer fabricates offline opportunities, assumes a previous-day profit, imposes a target to beat, or manufactures minimum daily-profit figures. If the research provider is not configured or returns invalid output, the endpoint returns an explicit error and no substitute financial figures.

Any nonzero `estimatedDailyProfitUsd` or `startupCapitalUsd` returned by the model is labelled as an unverified hypothetical scenario, not actual income, a verified forecast, a guarantee, or an approved budget. Validate demand, pricing, costs, customer volume and delivery capacity independently before relying on a scenario. Ideas do not execute tasks, contact customers, publish content, spend money, or authorize commitments.

## Goal planning and opportunity assessments

The authenticated goal-planning and opportunity-assessment routes use Jerry's provider-neutral server-side model adapters and per-owner rate limits. They return HTTP 503 when no model provider is configured and HTTP 502 when providers fail or return invalid structured output; they no longer present deterministic sample plans or hard-coded commercial projections as generated AI work.

Persistent memory is stored in the owner-scoped PostgreSQL `memory_entries` table. Apply the numbered SQL migrations with `bun run db:migrate` after database connectivity is configured. Migration `0008_memory_areas.sql` assigns legacy entries to three searchable areas: `owner_profile` (preferences), `mission_projects` (goals and workflows), and `knowledge_experience` (decisions and lessons). The five existing categories remain intact for compatibility. The authenticated `GET /api/memory` endpoint accepts optional `q`, `category`, `area`, and `limit` query parameters; all search results remain filtered by the authenticated tenant. The Android/web memory screen queries this endpoint when searching and falls back to locally loaded workspace memories only when the persistent search service is unavailable.

The Opportunity Radar (`POST /api/jerry/scan-opportunities`) retrieves bounded source extracts through Tavily when `TAVILY_API_KEY` is configured, then asks a configured provider-neutral research model to analyse them. Source references are separate from independently verified facts; retrieved sources and model summaries are not independently verified. The route fails closed with HTTP 503 when live research is unconfigured or returns no usable sources, and HTTP 502 when research/model processing fails. It never falls back to fabricated sample opportunities. Both live research and model provider credentials must be configured for a completed scan. Goal plans are proposals only; generated action steps do not execute, authorize spending, or approve external commitments.


## Isolated self-upgrade test runner

Jerry's API does not execute generated self-upgrade code. It uses a separate HTTPS runner adapter and accepts a test pass only when the runner returns a valid HMAC-signed attestation bound to the exact source and test-suite SHA-256 hashes.

The runner remains unavailable by default. Configure these values only in the cloud secret manager after deploying and independently auditing the sandbox service:

- `JERRY_TEST_RUNNER_URL`: credential-free HTTPS endpoint.
- `JERRY_TEST_RUNNER_HMAC_SECRET`: random shared secret with at least 32 characters.

The separate runner must enforce disposable container or microVM isolation, OS-level network denial, no inherited credentials or host mounts, read-only base filesystem, ephemeral workspace, resource/time/process limits, and destruction after every request. The request's `limits` fields are requirements, not enforcement; the runner must enforce them independently. Do not treat the runner's `sandboxed` response field as proof of isolation. Review `SELF_UPGRADE_RUNNER_PROTOCOL.md` and independently audit the runner implementation and infrastructure before configuring these secrets.

Until that separate service exists and passes an independent security review, verification remains `pending`, owner approval is blocked, and self-upgrades cannot be deployed. Syntax transformation alone is never considered a runtime test.


## Destructive workspace reset authorization

`POST /api/state/reset` is owner-authenticated and blocked while Jerry's emergency stop is engaged. It requires an `approvalId` for a fresh, approved `high_impact_change` authorization whose immutable scope is exactly:

```json
{ "operation": "workspace_reset" }
```

The route reserves that authorization before changing workspace state and finalizes (consumes) it only after the reset is durably saved. Missing, pending, rejected, expired, wrong-owner, wrong-scope, already-reserved, consumed, or replayed approvals are rejected. If the workspace update fails before commit, the reservation is released. Server-owned financial and security records are not erased by this workspace reset.

Create and approve the scoped request through the owner security approval endpoints; do not reuse an approval intended for a different action. A reset that commits but encounters a later authorization-finalization storage failure returns an explicit HTTP 503 and must be reconciled before another reset is attempted.


## Emergency-stop execution boundary coverage

The application emergency-stop middleware is applied to every implemented action that can stage an outgoing Bitcoin transfer or invoke the isolated self-upgrade test runner:

- POST /api/state/reset — destructive workspace reset.
- POST /api/wallet/commands/submit-transfer — outgoing transfer staging.
- POST /api/jerry/self-upgrades/:id/verify — isolated verification of a persisted code proposal.
- POST /api/jerry/verify-upgrade — direct isolated code verification.

The execution-task endpoint remains fail-closed with HTTP 501 because no verified task execution adapter exists. Do not interpret task recovery or journal recovery as task execution or money movement.

The PostgreSQL wallet journal outbox worker is intentionally not disabled by the emergency stop: it only records eligible, already-observed financial events into the internal double-entry journal. Preserving financial evidence and reconciling the ledger must continue during an emergency. It does not broadcast transactions or initiate transfers.

Read-only market/on-chain lookups, research, planning, memory, and security recovery remain available. The stop latch blocks the above execution paths and approval reservation. The independent cloud control-plane and Android-native kill switch are still outstanding; this application middleware alone is not proof of an independent, system-wide kill switch.


In-flight isolated verification requests are tracked by the server process. When the owner engages the application emergency stop, Jerry aborts their HTTP requests; the runner adapter propagates that cancellation signal and discards any result returned after cancellation. A remote runner must honor client cancellation and terminate its disposable execution environment. This request cancellation is not a substitute for the remote runner's mandatory process-tree kill, independent network isolation, or infrastructure-level emergency control.


## Daily summary financial-data migration

Migration `0009_nullable_daily_summary_profit.sql` makes the legacy `daily_summary_reports.daily_profit_usd` column nullable. Existing recorded values are preserved; new summaries without a verified ledger amount store SQL `NULL`. Apply the ordered SQL migrations before deploying code that writes unavailable financial metrics. Consumers must treat `NULL` as unavailable, never as zero income.
