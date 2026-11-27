# Ciphertext-only Jerry memory record design

Status: implementation in progress; this document does not authorize memory sync or production rollout.

## Security objective

The API, PostgreSQL, Neon operators, backups, and database readers must not receive readable memory titles, content, categories, areas, outcomes, tags, or logical timestamps. Encryption and decryption happen on an authenticated owner device. The server is a tenant-isolated ciphertext relay and cannot perform semantic or full-text search.

## Record format (v1)

The encrypted plaintext is a canonical JSON object containing schemaVersion, opaque id, category, memoryArea, title, content, outcome, tags, logical createdAt/updatedAt, and a logical deleted flag.

The transport envelope contains only schemaVersion, random recordId, keyVersion, monotonic revision, fresh 96-bit IV, and AES-256-GCM ciphertext with a 128-bit authentication tag.

AES-GCM additional authenticated data binds the ciphertext to the exact owner UID, opaque record ID, key version, revision, and wire schema version. Rebinding an envelope to another owner, record, key version, revision, or schema version must fail authentication.

## Server-visible fields and why

PostgreSQL may see owner UID / internal owner FK (tenant isolation and authorization), opaque record ID (lookup), keyVersion (envelope selection), revision (optimistic concurrency / replay-resistant update ordering), IV and ciphertext (storage), and transport createdAt/updatedAt (pagination and sync). These transport timestamps reveal activity timing; they are not the logical memory timestamps. If hiding activity timing becomes a requirement, use coarse sync epochs or opaque append-only sync cursors in a later protocol version.

The server must not see title, content, category, area, outcome, tags, logical timestamps, or logical deletion state. Do not add database full-text indexes, tag indexes, or category filters to ciphertext records.

## Search and sync

Download owner-scoped ciphertext pages, decrypt on-device, then filter/search all three memory areas locally. The API must never accept plaintext search terms for encrypted memory. A device with no matching key envelope cannot decrypt. Only active devices with owner-approved enrollment may receive a key envelope. A newly enrolled device remains pending until a different active device approves it.

## Writes, concurrency, and integrity

New records start at revision 1. Updates must use compare-and-swap with an expected revision and increment exactly once in a database transaction. Reject stale revisions; never silently last-write-wins. AES-GCM nonces are freshly generated for every encryption under a given key. The AAD binds revision to prevent moving ciphertext between revisions. Keep record IDs random and unrelated to content. Validate envelope sizes and encoding before persistence.

The server cannot detect a malicious rollback of a complete old database snapshot solely from AES-GCM. Strong rollback detection requires an independently anchored owner-signed checkpoint or append-only audit sequence. Do not claim rollback protection until that anchor exists.

## Deletion and retention

Represent logical deletion inside the encrypted payload (deleted: true) so the server cannot infer which records were deleted. Retain ciphertext tombstones long enough for approved devices to synchronize. Physical purge is a separate owner-authorized retention operation and must be coordinated with backup retention and key rotation.

## Migration from legacy plaintext

Do not silently convert plaintext rows on the server: the server does not possess the memory key. Migration must run on an authenticated owner device:
1. Read a legacy row over the owner-authenticated API.
2. Encrypt the complete record locally using the active memory key.
3. Upload the ciphertext record with a stable opaque ID and revision 1.
4. Read it back and decrypt/compare locally.
5. Mark the legacy row migrated only after successful verification.
6. After all devices and records are reconciled, run a separately authorized purge of legacy plaintext rows and backups according to retention policy.

Until the migration and purge are complete, legacy plaintext endpoints must be explicitly marked legacy and encrypted-memory sync must remain disabled. Never claim the database is ciphertext-only while legacy plaintext rows or backups remain.

## Key lifecycle and failure behavior

The 256-bit memory data key is generated client-side and wrapped separately for each approved device using the existing P-256 ECDH + HKDF-SHA-256 + AES-256-GCM envelope primitive. Private device keys never reach the server. Key rotation creates a new key version and new per-device envelopes; old versions remain decryptable only during a bounded migration window. Revoking a device stops future envelope delivery and requires rotation if the device may have retained a prior key. Recovery requires a separately designed owner-controlled recovery mechanism; do not invent a server-side escrow key.

The emergency stop must block memory writes, envelope delivery, and key lifecycle mutations while preserving encrypted records and audit evidence. Failure to load a key, verify authentication, or validate a record must fail closed; never fall back to plaintext writes or server-side search.

## Implementation gates

- Unit tests: round trip, every AAD binding field, tamper, wrong key, malformed/oversized input, metadata confidentiality, random nonce, revision handling.
- API/database tests: owner isolation, active-device checks, compare-and-swap, rate limiting, emergency-stop fencing, no plaintext columns or logs.
- Migration tests: interruption/retry/idempotency, readback verification, legacy purge authorization.
- Release gate: source audit confirms no encrypted-memory endpoint returns plaintext and no sync path falls back to legacy plaintext.
