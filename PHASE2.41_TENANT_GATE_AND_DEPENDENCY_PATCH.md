# Phase 2.41 — Tenant Gate and Dependency Contract Patch

Baseline inspected: Project-Jerry-Step7-Verification-2026-11-17-v33.zip.

## Changes
- Align the root `esbuild` development dependency with Vite 8's declared peer range: `^0.28.2`.
- Add `test:tenant` as a dedicated PostgreSQL tenant-isolation test command.
- Add a dedicated PostgreSQL tenant-isolation step to `.github/workflows/ci.yml` after disposable schema provisioning and before full release verification.
- Make the integration test fail closed when `JERRY_TENANT_TEST_DATABASE=1` is set but the environment is production or the required safe test database configuration is missing. Without explicit opt-in, it remains skipped for ordinary local test runs.

## Verification performed in this environment
- `package.json` parses and the expected dependency/script values validate.
- Tenant test without explicit opt-in: passes as an intentional skip.
- Tenant test with opt-in but missing safe SQL configuration: fails as intended (fail-closed guard).

## Still outstanding
- `bun.lock` has NOT been regenerated. This must be done with Bun in a network-enabled environment using `bun add -d esbuild@^0.28.2`, followed by `bun install --frozen-lockfile`.
- PostgreSQL-backed tenant test has NOT been run here; no PostgreSQL server/client is available in this runtime.
- Full `bun run verify:release` has NOT been run here; Bun and installed dependencies are unavailable.
- GitHub Actions CI and Firebase release workflow have NOT been observed running. Their results must be checked after the archive is committed/pushed and required Firebase secrets are configured.


## Phase 2.42 — Firebase gate hardening (2026-11-17)

- Removed the unused `JERRY_FIREBASE_TEST_PASSWORD` secret requirement: the integration test creates a disposable random-password identity and never reads that secret. `JERRY_FIREBASE_TEST_EMAIL` is only used as the domain source for that disposable identity.
- Restricted the Firebase workflow token permissions to `contents: read`.
- Added strict shell failure handling, a non-empty service-account-secret check, JSON validation, restrictive credential-file permissions (`umask 077`), and guaranteed cleanup via `trap`.
- Static contract checks confirm the workflow supplies the project/API-key/base-email/service-account inputs, enables the real integration test, invokes `bun run test:firebase`, verifies token revocation, and deletes the disposable Firebase user.
- **Not runtime-verified:** Firebase Admin dependencies are not installed in this environment; the real Firebase test cannot run without dependency installation, network access, and configured GitHub secrets.
