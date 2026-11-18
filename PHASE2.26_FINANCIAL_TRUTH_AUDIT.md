# Phase 2.26 — Financial Truth Audit

## Scope
Audited the reconciled Phase 2.25 source for remaining BTC/USD accounting ambiguity and wallet UI paths that could imply unsupported custody/signing capability.

## Changes
- Confirmed protected Cloud SQL workspace fields remain server-authoritative.
- Tightened profit calculations so a confirmed BTC business-revenue transaction without an authoritative `usdValue` is **not** interpreted as USD.
- Preserved compatibility fallback for non-BTC legacy records in the calculation helper, while the canonical wallet policy accepts BTC/Bitcoin Mainnet only.
- Removed the external-wallet Connect/Disconnect UI action because it only toggled protected client state and did not perform real Bitcoin wallet linking or signing.
- External wallet panel now directs the owner to the real Bitcoin public-address linking flow.
- Removed a stale USDC reference from a financial test fixture description.
- Added regression coverage proving unvalued confirmed BTC revenue contributes `$0` to USD profit totals.
- Updated financial test fixtures to use the canonical BTC/Bitcoin Mainnet model and explicit USD valuations.

## Verification status
Static source audit completed. Full TypeScript/build/test execution remains pending because the current environment does not have Bun installed and dependency installation has previously timed out.
