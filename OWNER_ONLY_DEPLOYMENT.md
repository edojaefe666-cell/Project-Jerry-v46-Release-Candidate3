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
