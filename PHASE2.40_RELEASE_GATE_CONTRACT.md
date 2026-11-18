# Phase 2.40 Release Gate Contract

The canonical release gate is:

1. `bun install --frozen-lockfile`
2. `bun run verify:release`

`verify:release` explicitly runs:
- `bun run lint`
- `bun run build`
- `bun run test`

The `test` script is the currently executable Jerry regression suite. It includes tenant isolation, authentication, capability regression, client-state resurrection, ledger reconciliation, and release-security regressions. Historical financial-command, migration, deployment, and production-startup suites are not claimed here because those test files are not present in this artifact.

The CI workflow provisions disposable PostgreSQL and runs `bun run db:test:push` with the repository's explicit Drizzle config at `src/db/drizzle.config.ts` before release verification. This prevents the database-preparation step from depending on implicit config discovery.

A release cannot be accepted while the PostgreSQL tenant-isolation integration test is skipped. That test requires a disposable PostgreSQL database and must be run with the documented test-database environment variables. Real Firebase authentication/revocation verification also remains a deployment-environment gate.

No release-ready claim is valid from source-only or dependency-free execution.

## Firebase runtime gate

`bun run test:firebase` is the real Firebase deployment check. With `JERRY_FIREBASE_INTEGRATION=1` and disposable Firebase test credentials, it signs in through Firebase Identity Toolkit, passes the resulting ID token through Jerry's `requireAuth` middleware, revokes the user's refresh tokens through Firebase Admin, and verifies that the same token is rejected with HTTP 401 at Jerry's bearer-token boundary.
