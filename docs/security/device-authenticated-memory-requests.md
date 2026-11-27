# Jerry device-authenticated encrypted-memory request protocol

Status: protocol design only. Do not expose encrypted-memory endpoints until implementation and tests satisfy every gate below.

## Trust boundaries

Firebase owner authentication establishes the human account session. It does not prove that this HTTP request originates from an enrolled device. The server additionally requires proof of possession of the registered Android Keystore ECDSA P-256 signing key. The device private key never leaves Android Keystore.

The client must not be able to select an arbitrary public key, owner UID, device status, or request scope. The server loads the signing public key and active status from its own owner-scoped device registry.

## Challenge issuance

An authenticated owner requests a short-lived challenge for one active device. The server:
- validates the device is active and belongs to the authenticated owner;
- accepts only a fixed allowlist of encrypted-memory operations and paths;
- creates a cryptographically random 256-bit nonce and unique challenge ID;
- binds the challenge to owner UID, device registration, HTTP method, canonical path, SHA-256 digest of the exact request body (or a fixed empty-body digest), and expiry;
- stores the challenge as unconsumed, with a maximum lifetime of 60 seconds;
- rate-limits challenge creation and applies emergency-stop fencing.

The challenge response contains no signing key and no authority beyond the one exact operation.

## Canonical signed payload

Use a fixed-order JSON object encoded as UTF-8:

{
  "purpose": "jerry-device-http-v1",
  "challengeId": "<opaque id>",
  "nonce": "<random base64url>",
  "ownerUid": "<authenticated UID>",
  "deviceId": "<registered device ID>",
  "method": "GET|POST|PUT",
  "path": "/api/memory/encrypted[...canonical path...]",
  "bodySha256": "<base64url SHA-256 digest>",
  "expiresAt": "<UTC ISO-8601 milliseconds>"
}

No query parameters, duplicate headers, path aliases, encoded slash, dot-segments, or non-canonical percent encoding are accepted. Query pagination is either part of the canonical signed target or moved into the signed body; it must never be unsigned.

The Android bridge validates purpose, field lengths, allowlisted route/method combinations, timestamp and expiry before signing. The bridge returns a 64-byte P-256 ECDSA r||s signature. It does not accept arbitrary raw payload signing from JavaScript. For state-changing writes, the native UI shows the owner the action and record ID before signing.

## Request verification and replay prevention

The client sends the original Firebase bearer token plus challenge ID and signature. The server independently loads the stored challenge and current active device public key, recomputes the body hash from raw request bytes, reconstructs the canonical payload from stored challenge fields, and verifies ECDSA SHA-256.

Verification and one-time challenge consumption occur in the same database transaction as the encrypted-memory operation. The transaction locks challenge and device rows, checks owner/device active state, exact method/path/body hash, expiry, emergency-stop state, and unused status, then marks the challenge consumed. A replay, concurrent duplicate, body mutation, route substitution, expired challenge, revoked device, or different owner must fail.

Never trust device ID or public key supplied by the request as authorization. A request header may identify a candidate device only; the registry and signature proof decide authority.

## Response protection

All encrypted-memory responses use Cache-Control: no-store and JSON content type. No plaintext metadata, search terms, decryption keys, wrapped-key plaintext, or signed URL-like secrets appear in logs, error messages, metrics labels, or traces. Responses contain ciphertext envelopes only.

## Emergency stop and failure behavior

Challenge issuance, verification, key-envelope delivery, writes, and rotation are blocked while emergency stop is active or shared execution control is unavailable. Fail closed. Do not consume a challenge before a transaction is certain to commit. Do not silently fall back to Firebase-only authorization or legacy plaintext memory endpoints.

## Required tests

- ECDSA valid signature and malformed/invalid signature rejection.
- Altered owner, device, method, path, query, body bytes, nonce, challenge ID, expiry, and key all rejected.
- Challenge expiry, replay, concurrent replay, and revoked-device rejection.
- Cross-owner challenge/device lookup isolation.
- Emergency-stop and execution-lease fencing, including unavailable control store.
- Exact raw-body digest behavior across JSON whitespace, UTF-8, and content-type handling.
- Route allowlist rejects all non-memory paths and path normalization ambiguity.
- Android 10 Keystore signs the canonical challenge; JavaScript cannot invoke a generic raw-payload signing primitive.
- Writes require explicit native confirmation; cancellation produces no signature.

## Rollout order

1. Implement challenge table/store and strict canonicalization.
2. Implement server challenge endpoint and transactionally verified encrypted-memory handlers.
3. Implement Android Keystore purpose-specific signing bridge and native confirmation for writes.
4. Add client request wrapper that obtains challenge, signs, and sends exact same request bytes.
5. Run unit, database integration, Android 10 instrumentation, replay, and emergency-stop tests.
6. Keep legacy plaintext path read-only for migration; do not enable encrypted sync until all gates pass.
