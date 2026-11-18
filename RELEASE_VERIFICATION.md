# Jerry Release Verification

The repository uses `bun.lock` as its dependency lockfile. The canonical verification command is:

```bash
bun install --frozen-lockfile
bun run verify:release
```

`verify:release` runs the TypeScript check, production Vite build, and Node test suite. CI uses the same frozen Bun dependency installation and verification sequence.

This repository must not declare a release-ready build until that sequence completes successfully in a dependency-provisioned environment.

## Phase 2.31 transaction integrity
- PostgreSQL transaction locking now protects wallet mutation against concurrent state races.
- Ledger transaction references are unique per owner.
- Pending outgoing BTC is reserved during available-balance checks.
- Full release verification remains pending until Bun/dependencies are provisioned.

## Phase 2.40B release-test coverage correction
- The `test` script enumerates the regression files that are actually present in this release artifact: tenant isolation, capability regression, client-state resurrection, ledger reconciliation, release security, and the core library/middleware suites.
- Release documentation must describe only tests that exist in the artifact; historical suites that are not present are not counted as executed release coverage.
- PostgreSQL tenant isolation remains intentionally skipped unless a qualified disposable test database is provisioned; release acceptance still requires that integration test to execute rather than remain skipped.

## Real Firebase authentication/revocation gate

The source-level auth tests use a deterministic verifier stub. The deployment gate is now also represented by `src/lib/firebase.integration.test.ts`. Run it only against a disposable/dedicated Firebase test account:

```sh
JERRY_FIREBASE_INTEGRATION=1 \
JERRY_FIREBASE_PROJECT_ID=... \
JERRY_FIREBASE_WEB_API_KEY=... \
JERRY_FIREBASE_TEST_EMAIL=... \
JERRY_FIREBASE_TEST_PASSWORD=... \
bun run test:firebase
```

The test signs in through Firebase Authentication, verifies the resulting ID token with the server's Firebase Admin boundary, revokes the user's refresh tokens, and requires the same token to fail revocation-aware verification afterward. Do not use a production account for this gate.
