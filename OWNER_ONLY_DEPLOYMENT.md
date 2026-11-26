# Jerry owner-only deployment

Jerry is a private, single-owner system. Firebase token validity is not equivalent to owner authorization.

## Production requirement
Configure the server-side secret `JERRY_OWNER_UID` with the sole owner's Firebase Authentication UID. Do not expose it in client-side Vite variables, Android resources, or source control.

With `NODE_ENV=production`, requests fail closed with HTTP 503 if the owner UID is absent. A valid Firebase identity with a different UID receives HTTP 403. Firebase token revocation checking remains enabled. Whenever an owner UID is configured, it is enforced in every environment.

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


## Android build connectivity

The Android CI workflow currently uses `https://jerry-backend.invalid` as a deliberate non-routable placeholder. Its APK is a build-verification artifact, not a connected release APK. Before a usable APK is produced, configure a real HTTPS backend origin through the protected build environment, verify Firebase owner authentication and database migrations against that deployment, and rebuild. Never put provider credentials or owner UID values in Vite variables or APK assets.


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
