# CTA Engine Phase 2 — Staging Runbook

## Environment variables

| Variable | Where | Staging | Production |
|----------|--------|---------|------------|
| `ENABLE_CTA_ENGINE_V1` | Core runtime | `true` | `true` (library) |
| `ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` | Core runtime | `true` (also default when `CARDEY_DEPLOY_ENV=staging`) | **unset / false** |
| `VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` | Dashboard **build-time** | `true` in `.env.staging` **and** Render env | **unset** |
| `CARDEY_DEPLOY_ENV` | Core | `staging` | unset |

**Important:** Vite prefers `process.env` over `.env.staging`. Setting the flag only in git is insufficient if Render Environment already has a value.

Vite flag is **not** a runtime toggle — changing it requires rebuild + redeploy.

## Deployment order

1. Deploy core staging; confirm health `ctaEngine.platformMarketingV1: true`.  
2. Confirm `POST /api/cta/evaluate` for `LOYALTY` → `launch_loyalty`.  
3. Deploy dashboard staging with Vite flag **true** in Render env + `.env.staging`.  
4. Hard-refresh `/for-business` (block SW if validating rollback).

## Overlay coordination

- Registry: `src/lib/ctaEngine/bottomOverlayRegistry.ts`  
- Narrow ≤390px: stack orb above CTA  
- 391–1023: side-by-side with 100px right gutter  
- Desktop: existing desktop offsets  

Smoke: `DASHBOARD_BASE_URL=… node scripts/cta-phase2c-overlay-smoke.mjs`

## Rollback rehearsal

```bash
# Local browser proof (authoritative for build-time semantics)
# 1) Set VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1=false in .env.staging
pnpm run build:staging
pnpm exec vite preview --host 127.0.0.1 --port 4173
CTA_EXPECT_HOST=0 DASHBOARD_BASE_URL=http://127.0.0.1:4173 node scripts/cta-phase2c-flag-smoke.mjs
# Expect host=0, hero>=1

# Staging Render: also set the same key to false in Render Dashboard → Environment, then redeploy.
```

## Canonical test commands

```bash
# Dashboard
pnpm exec vitest run src/lib/ctaEngine src/lib/performer/performerOrbLayout.test.ts
pnpm exec playwright test \
  tests/e2e/cta-engine-platform-marketing.spec.ts \
  tests/e2e/cta-engine-auth-next.spec.ts \
  tests/e2e/cta-engine-bounded-regression.spec.ts \
  --config=playwright.cta.config.ts --project=chromium

# Core
pnpm exec vitest run src/lib/ctaEngine/__tests__ src/config/__tests__/ctaEngineFlags.test.js
```

## Evidence checklist

- [x] Overlay viewport matrix  
- [x] Vite flag-off browser proof (local staging build)  
- [x] Auth returnTo Playwright  
- [x] Bounded regression Playwright  
- [x] Production flags off  
- [x] Build Artifact classified unrelated  
