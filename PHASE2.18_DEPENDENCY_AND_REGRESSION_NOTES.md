# Phase 2.18 — Dependency Provisioning & Capability Regression Audit

## Dependency provisioning status

The canonical project declares a Bun lockfile (`bun.lock`) and does not contain an npm `package-lock.json`.
The verification environment used for this pass does not have Bun installed. A fallback `npm install --ignore-scripts --no-audit --no-fund` was attempted, but dependency resolution exceeded the execution timeout. Therefore a complete dependency-backed Vite/TypeScript/test run is **not claimed** in this phase.

The project remains reproducibly anchored by the existing `bun.lock`; dependency provisioning should use the Bun version selected by the repository/toolchain rather than generating a second package-manager lockfile.

## Regression audit performed

- Audited all `/api/*` frontend call sites.
- Confirmed the central `apiFetch()` helper already supplies Firebase bearer authentication when available and automatic idempotency keys for mutating requests.
- Migrated remaining direct POST calls in `BrainConsole`, `GoalsPlanner`, `BusinessLab`, and `VoiceVisionStudio` to `apiFetch()` so mutation behavior is centralized.
- Confirmed protected high-impact routes remain server-authoritative: reset, restore, self-programming, financial execution, and external sharing.
- Confirmed the wallet path uses authenticated API calls for on-chain verification/synchronization.
- Confirmed the learned-discovery execution path records estimated profit only and does not create a wallet settlement.

## Verification boundary

Static source inspection completed. Full build/test verification remains pending successful dependency provisioning.
