# Phase 8 — Legacy Intake V1 Removal

## Summary

Intake V1 (`POST /api/performer/intake`) is replaced by a thin deprecation shim that forwards all traffic to Intake V2. The dashboard now calls V2 directly.

## Changes

| Area | Change |
|------|--------|
| `performerIntakeRoutes.js` | Thin shim: deprecation headers + forward to `performerIntakeV2Routes` |
| `_deprecated/performerIntakeRoutes.v1.legacy.js` | Archived ~2000-line legacy implementation |
| `intakeV1Deprecation.js` | `Deprecation`, `X-API-Deprecated`, `Link` headers + `[intake-v1-deprecated]` logs |
| Dashboard | `API.performerIntake()` → v2 path; OCR path uses V2; `forceLegacyIntake` removed |
| `endpointRegistry.js` | v1 marked as deprecated shim |
| `rateLimitConfig.js` | Added `/api/performer/intake/v2` limit |
| `runwayLegacyGuard.js` | Unchanged — still logs `LEGACY_PERFORMER_INTAKE_V1` for v1 hits |

## Success criteria

- [x] Deprecation warnings in logs (`[intake-v1-deprecated]` + `[runway-legacy]`)
- [x] v1 routes forward to v2
- [x] Dashboard uses v2 (no direct v1 callers in app code)
- [x] Legacy v1 implementation removed from active router (archived)
- [x] Tests for shim + deprecation helpers

## Grace period / hard removal

Keep the v1 mount until telemetry shows zero external traffic to `POST /api/performer/intake`. Then:

1. Remove `app.use('/api/performer/intake', …)` from `server.js` / `createApp.js`
2. Delete `performerIntakeRoutes.js` shim
3. Delete `_deprecated/performerIntakeRoutes.v1.legacy.js`
4. Remove v1 rate limit entry

## Tests

```bash
cd apps/core/cardbey-core
npx vitest run src/routes/__tests__/performerIntakeV1Shim.test.js src/lib/intake/__tests__/intakeV1Deprecation.test.js
```
