# Jerry Phase 2.15 — Security Controls Integration

## Preserved architecture

The newer Firebase/Cloud SQL Jerry application remains the application base. Foundation security capabilities were integrated incrementally instead of replacing the UI/data architecture.

## Implemented

- Encrypted backup/recovery using AES-256-GCM with scrypt-derived keys.
- Backup includes local Jerry state, Cloud SQL workspace state when available, approvals, approved contacts, and the tamper-evident audit chain.
- Recovery validates the embedded audit chain before replacing security records.
- Idempotency history is intentionally cleared during recovery so old mutations cannot be replayed.
- Recovery requires an explicit `RESTORE_JERRY` confirmation token in addition to the backup passphrase.
- Approved external-share contacts with active/revoked status and purpose metadata.
- External-share authorization boundary requiring BOTH an active approved contact and an approved `confidential_external_share` approval ID.
- Firebase session inspection and all-refresh-session revocation.
- Firebase email/password credential rotation UI with re-authentication and a 14-character minimum for new passwords. Google-managed credentials are directed to Google.
- Audit viewer plus live audit-chain integrity verification.
- Financial task execution UI now carries an approval ID from the Approval Center to the server execution boundary.
- Self-growth API mutations now use the centralized `apiFetch()` helper and therefore receive automatic idempotency protection.
- Approval IDs are displayed explicitly in the Approval Center so they can be attached to high-impact execution requests.

## Verification

- TypeScript parser checks reached project code without syntax errors after the integration.
- Full project type-check/build remains environment-blocked because this source archive does not contain installed dependencies (`node_modules`), and dependency acquisition previously timed out.
- Existing unrelated source warnings/regressions are not silently represented as resolved.

## Important operational boundary

Credential rotation changes the Firebase email/password credential directly from the authenticated browser using Firebase re-authentication. Google sign-in credentials remain Google-managed.

Session revocation uses Firebase Admin `revokeRefreshTokens`; production deployment must provide the Firebase Admin credentials required for that operation.

Backup passphrases are never persisted by Jerry. Users must retain the passphrase independently; an encrypted backup without its passphrase cannot be recovered by the application.
