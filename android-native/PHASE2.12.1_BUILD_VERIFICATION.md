# Project Jerry Phase 2.12.1 — Android-native foundation

## Scope delivered
- Isolated Android application module (`android-native/`) with Kotlin/Gradle project structure.
- Android 10 / API 29 minimum baseline; compile/target SDK 35.
- Manifest declarations for a screening service and an observation-only `InCallService` placeholder.
- Central permission status and user-mediated `ROLE_CALL_SCREENING` / `ROLE_DIALER` request-intent helpers.
- Local policy snapshot schema aligned with Phase 2.10 Approved Contacts and Phase 2.11 Hands-Free policy fields.
- Snapshot validation contract (schema, signature, freshness and future-dated checks) and Android Keystore AES-GCM encrypted blob storage.
- Screening service is pass-through only. In-call service only observes lifecycle callbacks.

## Critical non-capabilities
- No `Call.answer()`, reject, disconnect, call audio capture, recording, transcription, or call handoff implementation.
- No server signature public key or snapshot download endpoint is wired yet. The verifier is injected and must be backed by a pinned public key before snapshots can be trusted.
- No call decision adapter is connected to the Phase 2.11 engine.
- No role or runtime permission is automatically requested or granted.
- This foundation does not activate call answering and has not been installed on a device.

## Permission/role flow to implement in the app UI
1. Explain each feature and its data use before requesting permission.
2. Request `READ_CONTACTS` only if contact display-name resolution is enabled; the policy registry itself remains authoritative.
3. Request `RECORD_AUDIO` only when voice interaction is explicitly enabled.
4. Request `READ_PHONE_STATE` only if a later supported API requires it; do not treat it as answer permission.
5. Request `ROLE_CALL_SCREENING` only for call-screening functionality.
6. Request `ROLE_DIALER` only after the complete dialer UI and Telecom requirements are implemented and Joshua explicitly chooses Jerry as default dialer.
7. Re-check role/permission state on resume; revocation must immediately disable related features.
8. If permission, role, signature, freshness, registry or security state is unavailable, no Jerry auto-answer action is permitted.

## Build-verification checklist
- [ ] Open `android-native/` in a compatible Android Studio installation.
- [ ] Resolve Android Gradle Plugin 8.7.3, Kotlin 2.0.21 and AndroidX dependencies.
- [ ] Run `./gradlew :app:assembleDebug`.
- [ ] Run `./gradlew :app:testDebugUnitTest`.
- [ ] Run `./gradlew :app:lintDebug` and resolve manifest/API warnings.
- [ ] Inspect merged manifest and verify service binding permissions are system-protected.
- [ ] Verify app launches on API 29 and a current Android version.
- [ ] Verify permission denial/revocation states are reflected accurately.
- [ ] Verify RoleManager availability and user-mediated role request/cancel paths.
- [ ] Implement and test pinned server-signature verification before accepting snapshots.
- [ ] Test Keystore encrypted save/read/tamper failure on physical devices.
- [ ] Only in a later phase, implement the decision adapter and call control; test allow/deny paths using test SIM/controlled calls.
- [ ] Verify Joshua takeover, audio routing, background behavior and OEM restrictions on the actual Infinix device.

## Current validation status
- Source and manifest structure reviewed locally.
- Unit tests authored for six snapshot validation paths.
- The source has now been reconciled into the canonical v46 PR branch under `android-native/` and a dedicated GitHub Actions workflow builds the debug APK, runs unit tests and runs lint.
- The first Android CI attempts failed during SDK bootstrap because the setup action requested the removed legacy `tools` package. The workflow has been corrected to request `platform-tools`, Android 35 and build-tools 35.0.0 directly; a successful build is still pending.
- No APK is claimed as built; no phone settings changed; no production deployment performed.


## v46 integration increment — native shell and cloud API routing

- The native launcher now hosts the canonical React/Jerry UI through AndroidX WebViewAssetLoader at the HTTPS origin `https://localhost`; it does not load remote executable HTML.
- Android CI builds the web bundle with `VITE_BASE_PATH=/public/`, copies it into the app's packaged assets, then builds the Android APK and runs native JVM tests and lint.
- `VITE_API_BASE_URL` is compiled as an HTTPS origin. The shared web API client routes only `/api/*` requests to that origin and continues to attach the Firebase ID token and idempotency key.
- The build uses a deliberately invalid placeholder backend origin. A real HTTPS backend origin must be configured for an installable connected release; no API key or server secret belongs in the APK.
- The WebView blocks cleartext traffic, file access, mixed content and non-HTTPS navigation. External HTTPS navigation is handed to the Android browser.
- No Android runtime permission is automatically requested. Native permission/role checks remain user-mediated and informational.
- Android CI has been expanded to build the web bundle before Gradle. The latest run must pass before this integration is considered build-verified.
