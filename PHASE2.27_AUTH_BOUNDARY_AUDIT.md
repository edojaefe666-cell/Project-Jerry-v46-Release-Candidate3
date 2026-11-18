# Phase 2.27 — Authentication Boundary Audit

## Scope
Audited the reconciled Phase 2.26 server routes for unauthenticated access to Jerry owner/workspace state and private AI capabilities.

## Findings fixed
- `/api/state` GET now requires Firebase authentication. Previously it could expose the persisted Jerry workspace without a token.
- Private Jerry AI routes now require Firebase authentication:
  - chat
  - goal planning
  - opportunity assessment
  - vision analysis
  - TTS
  - transcription
  - opportunity scanning
  - owner teaching
  - human-insight learning
  - internet-growth learning
  - daily summary generation
- The existing high-impact routes remain approval-gated in addition to authentication.
- The App state-loading effect now waits for an authenticated Firebase ID token before requesting `/api/state`. This avoids an initial unauthenticated request racing Firebase initialization and incorrectly falling back to seed state.
- Public market-price and health endpoints remain intentionally unauthenticated because they do not expose owner workspace data or mutate financial state.

## Verification
Static route inventory and frontend call-site audit completed. Full TypeScript/build/test execution remains pending because Bun is unavailable in the current environment and dependency installation previously timed out.
