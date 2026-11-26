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
