# Testing Plan

## Unit tests (`:core:*`, `:app`)

| Area | Cases |
|------|-------|
| API model mapping | LoginResponse, PingResponse, ApiError deserialization |
| Auth session | Token save/load/clear, 401 handling |
| Mission event reducer | Dedupe, ordering, terminal states |
| Deep-link parser | Store slug, mission id, promo paths |
| Upload validation | MIME, size cap |
| Space context | Personal vs business resolution |
| Offline retry | Safe vs unsafe replay classification |

## Integration tests (Robolectric + MockWebServer)

| Flow | Verification |
|------|--------------|
| Sign-in | POST login → token stored → GET me |
| Session restore | DataStore token → me succeeds |
| Health ping | GET /api/ping |
| Marketplace | Feed parse + cursor |
| Stream reconnect | Backoff + afterSeq resume |

## Compose UI tests

| Screen | Cases |
|--------|-------|
| Signed-out shell | Explore + Sign in tabs visible |
| Signed-in shell | Five bottom nav items |
| Developer | Environment label (debug) |
| Offline banner | Shown when connectivity false |
| Error card | Retry button visible |

## Device matrix

- Small phone (API 28+)
- Standard phone API 34
- Tablet sw600dp
- Slow network / airplane mode toggle
- Process death + restoration

## CI

`.github/workflows/android.yml`:

- `./gradlew lint detekt test assembleDevDebug`
- Compose tests on API 30 emulator (when runner supports)

## Coverage targets (Phase 1)

- Core model + auth + network: >80% on pure logic
- UI: smoke navigation tests only
