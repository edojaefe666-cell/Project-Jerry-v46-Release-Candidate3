# Jerry Isolated Self-Upgrade Test Runner Protocol

## Security posture

The runner is a separate execution service. Jerry's API server does not execute owner- or model-supplied upgrade code. If the runner URL or HMAC secret is absent, malformed, unavailable, or produces an unverifiable response, Jerry records the verification as `pending` and keeps owner approval blocked.

Configure these server-side secrets only in the deployment secret manager:

- `JERRY_TEST_RUNNER_URL`: credential-free HTTPS endpoint for the isolated runner.
- `JERRY_TEST_RUNNER_HMAC_SECRET`: random shared secret of at least 32 characters.

Never place either value in the Android app, browser bundle, repository, logs, or user-visible output.

## Request

Jerry sends a POST JSON request. The request body is signed with HMAC-SHA256 in `x-jerry-runner-request-signature`. The runner must verify this signature before processing.

Fields:

- `protocolVersion`: integer 1.
- `requestId`: unique request identifier.
- `language`, `source`, `testCode`: exact proposal inputs.
- `sourceSha256`, `testSha256`: SHA-256 hashes of the exact UTF-8 source and test strings.
- `limits`: requested maximum execution time (<=15 seconds), memory (128 MB), no network, ephemeral-only filesystem, no subprocesses, and no credentials.

The request is untrusted code. The runner MUST enforce controls independently; it must not trust the requested limits merely because they are present.

## Required runner isolation

Before a runner can be considered production-ready, its implementation must demonstrate:

1. Per-request disposable container or microVM isolation, with no shared writable host mounts.
2. Network disabled at the OS/container boundary, including DNS and metadata-service access.
3. No inherited environment secrets, cloud credentials, SSH agents, Docker socket, host PID namespace, or privileged capabilities.
4. Read-only base filesystem and a size-limited ephemeral workspace.
5. CPU, memory, process-count, file-size, output-size, and wall-clock limits.
6. Process-tree termination on timeout and complete workspace destruction after every request.
7. A fixed test harness that executes the submitted tests against the exact source; do not run arbitrary shell commands from proposal metadata.
8. No package installation or dependency download during execution. Only prebuilt, pinned language runtimes and approved dependencies may be used.
9. Structured output only; cap summaries and never include environment values or secrets.
10. Independent security testing of container escape, network egress, resource exhaustion, and cross-request data leakage.

A `sandboxed: true` response is an assertion, not proof. Deployment approval requires an independent audit of the runner implementation and its infrastructure controls.

## Response

The runner returns JSON signed over the exact raw response body using HMAC-SHA256 in `x-jerry-runner-response-signature`.

Required response fields:

- `protocolVersion`: 1.
- `requestId`: exact request identifier.
- `sourceSha256`, `testSha256`: exact request hashes.
- `sandboxed`: true.
- `networkDisabled`: true.
- `status`: `passed` or `failed`.
- `exitCode`: integer; a pass requires zero.
- `durationMs`: finite duration no greater than 15,000.
- `summary`: plain-text summary no longer than 1,000 characters.

Jerry rejects unsigned, mismatched, malformed, oversized, redirected, timed-out, or incorrectly attested responses. It also rejects responses that do not assert network isolation. Rejected or unavailable results never become a pass.

## Current implementation status

Jerry's server-side adapter and tests implement the signed request/response protocol and fail-closed handling. This repository does not yet include or deploy the separate sandbox service. Therefore, without separately audited runner infrastructure and configured secrets, self-upgrade tests remain pending and deployment remains blocked.
