# CTA Engine Phase 2 — Staging Runbook

## Environment variables

| Variable | Where | Staging | Production |
|----------|--------|---------|------------|
| `ENABLE_CTA_ENGINE_V1` | Core runtime | `true` | `true` (library) |
| `ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` | Core runtime | `true` (also default when `CARDEY_DEPLOY_ENV=staging`) | **`false` / unset** |
| `VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` | Dashboard **build-time** | `true` in `.env.staging` | **unset** |
| `CARDEY_DEPLOY_ENV` | Core | `staging` | unset / production |

Vite flag is **not** a runtime toggle — changing it requires rebuild + redeploy.

## Deployment order

1. Push monorepo `staging` (core + submodule). Confirm Render `cardbey-core-staging` redeploys (health uptime resets).  
2. Confirm `POST /api/cta/evaluate` returns `{ ok: true, primary: … }` and health includes `"ctaEngine":{"platformMarketingV1":true}`.  
3. Push dashboard `staging` with `VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1=true`.  
4. Hard-refresh `/for-business` (clear SW if needed).

## Expected API sample

```http
POST /api/cta/evaluate
{ "surface": "platform_marketing", "section": "LOYALTY", "route": "/for-business" }
```

When flag off: `404` with `PLATFORM_MARKETING_CTA_DISABLED` (page still works; no floating CTA).

## Smoke steps

1. Signed-out visitor → `/for-business`  
2. One platform CTA visible; hero Start with AI still present  
3. Scroll semantic sections / dispatch `cardbey:cta-set-section`  
4. Click create_store → marketing Performer handoff (no auto store create)  
5. `/for-sellers` same behaviour  
6. Mobile 390×844: no horizontal overflow; orb cleared beside CTA  

### Scripted smoke

```bash
cd apps/dashboard/cardbey-marketing-dashboard
DASHBOARD_BASE_URL=https://cardbey-dashboard-staging.onrender.com node scripts/cta-phase2b-staging-smoke.mjs
```

## Rollback

1. Rebuild dashboard with `VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1=false` (or unset) → floating host unmounts.  
2. Set core `ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1=false` → API disabled safely (wins over staging deploy-env default).  
3. Hero Start with AI / chips unchanged.

## Evidence checklist

- [x] Core commit + staging API live  
- [x] Dashboard commit + host in staging bundle  
- [x] Flag values recorded  
- [x] Desktop screenshots (local `test-results/cta-phase2b-staging/`)  
- [x] Mobile screenshots (iPhone + Android + short + landscape)  
- [x] Playwright mocked suite green (5/5)  
- [ ] Vite flag-off rebuild rollback browser proof  
- [ ] Need help overlap visual sign-off  

## Canonical test commands

```bash
# Dashboard (from apps/dashboard/cardbey-marketing-dashboard)
pnpm exec vitest run src/lib/ctaEngine
pnpm exec playwright test tests/e2e/cta-engine-platform-marketing.spec.ts --config=playwright.cta.config.ts --project=chromium

# Live staging (no local webServer) — use smoke script or:
# CTA_E2E_LIVE=1 DASHBOARD_BASE_URL=https://cardbey-dashboard-staging.onrender.com \
#   pnpm exec playwright test tests/e2e/cta-engine-platform-marketing.live.spec.ts
# (requires a Playwright config without forcing local webServer)

# Core
pnpm exec vitest run src/lib/ctaEngine/__tests__ src/config/__tests__/ctaEngineFlags.test.js
```
