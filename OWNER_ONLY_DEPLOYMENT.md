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
- To stop, submit `{ "action": "stop", "reason": "..." }`. This latches the stop in the local security SQLite store and records an audit event.
- Outgoing Bitcoin transfer staging is blocked with HTTP 423 while the latch is active.
- To resume, submit `{ "action": "resume", "reason": "...", "confirmation": "RESUME_JERRY_EXECUTION" }`. Recovery is an explicit owner action and is recorded in the audit chain.
- The independent deployment/operator hard stop is `JERRY_EMERGENCY_STOP=1`. The application API cannot clear this environment-level switch; an operator must remove it through the deployment control plane.
- If the security control store cannot be read, the application fails closed and blocks transfer staging.
- This is an application-side stop for the currently implemented outgoing-transfer staging boundary. No Bitcoin broadcast implementation exists in this branch. Future external execution adapters must enforce the same stop independently at their own execution boundary before they are enabled.


## Jerry Brain model providers

The authenticated chat route `POST /api/jerry/chat` and the provider-neutral generation route `POST /api/brain/generate` use server-side model adapters. They do not expose provider credentials to the browser or Android APK.

Configure only the providers you intend to use in the cloud server's secret manager:

- `GEMINI_API_KEY` (or `GOOGLE_AI_API_KEY`); optional model override `JERRY_GOOGLE_MODEL`
- `OPENAI_API_KEY`; optional model override `JERRY_OPENAI_MODEL`
- `ANTHROPIC_API_KEY`; optional model override `JERRY_ANTHROPIC_MODEL`
- Optional local OpenAI-compatible endpoint: `JERRY_LOCAL_MODEL_ENABLED=1`, `JERRY_LOCAL_MODEL_URL=http://127.0.0.1:11434`, and optional `JERRY_LOCAL_MODEL_NAME`. The local adapter rejects non-loopback hosts.

Never place provider keys in `VITE_*` variables, Android resources, APK assets, source control, or chat messages. Do not configure a provider unless its endpoint, model identifier, billing and data-handling terms have been reviewed. The service returns an unavailable response when no provider is configured; it does not fabricate an AI answer.

The current Brain adapter supports text chat, planning, research and coding prompts. Vision, speech generation and transcription are not yet wired through these adapters. Provider fallback is an availability mechanism, not a guarantee of identical model behavior or data residency across providers.


## AI request limits

The authenticated Brain generation route is limited to 20 requests per owner per minute, chat to 30, and goal planning to 10. Responses over the limit return HTTP 429 with a `Retry-After` header. The in-process limiter bounds retained owner buckets and resets windows automatically.

These limits are a local abuse/cost guard, not a distributed quota system. A multi-instance production deployment must also enforce shared rate limits and provider-side spending/usage caps at the gateway or provider account. Provider keys should have least privilege and alerts/limits configured where supported.
