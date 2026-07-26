# CTA Engine Phase 2 — Staging Runbook

## Environment variables

| Variable | Where | Staging | Production |
|----------|--------|---------|------------|
| `ENABLE_CTA_ENGINE_V1` | Core runtime | `true` | `true` (library) |
| `ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` | Core runtime | `true` | **`false`** until approval |
| `VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` | Dashboard **build-time** | `true` (rebuild required) | **unset/false** |

Vite flag is **not** a runtime toggle — changing it requires rebuild + redeploy.

## Deployment order

1. Deploy **core** with `ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1=true` on staging.  
2. Confirm `POST /api/cta/evaluate` returns `{ ok: true, primary: … }` for `surface=platform_marketing`.  
3. Build/deploy **dashboard** with `VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1=true`.  
4. Hard-refresh `/for-business` (clear SW if needed).

## Expected API sample

```http
POST /api/cta/evaluate
{ "surface": "platform_marketing", "section": "LOYALTY", "route": "/for-business" }
```

```json
{
  "ok": true,
  "primary": {
    "capabilityId": "launch_loyalty",
    "provider": "platform",
    "label": "Launch a loyalty program"
  },
  "secondary": [],
  "engineVersion": "cta-engine-phase2",
  "consumerVersion": "platform-marketing-v1"
}
```

When flag off: `404` with `PLATFORM_MARKETING_CTA_DISABLED` (page still works; no floating CTA).

## Smoke steps

1. Signed-out visitor → `/for-business`  
2. One platform CTA visible; hero Start with AI still present  
3. Scroll semantic sections / use section cards  
4. Click create_store → marketing Performer handoff (no auto store create)  
5. `/for-sellers` same behaviour  
6. Mobile 390×844: no horizontal overflow; orb cleared above CTA  

## Rollback

1. Rebuild dashboard with `VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1=false` (or unset) → floating host unmounts.  
2. Set core `ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1=false` → API disabled safely.  
3. Hero Start with AI / chips unchanged.

## Evidence checklist

- [ ] Core commit + deploy ID  
- [ ] Dashboard commit + deploy ID  
- [ ] Flag values recorded  
- [ ] Desktop screenshots (initial, loyalty, flag-off)  
- [ ] Mobile screenshots (iPhone + Android viewports)  
- [ ] Playwright `cta-engine-platform-marketing.spec.ts` green  
- [ ] `pnpm test:run` / vitest CTA + isolation suites green  

## Canonical test commands

```bash
# Dashboard (from apps/dashboard/cardbey-marketing-dashboard)
pnpm exec vitest run src/lib/ctaEngine src/lib/businessEntryRouting.test.ts
pnpm exec playwright test tests/e2e/cta-engine-platform-marketing.spec.ts --project=chromium

# Core
pnpm exec vitest run src/lib/ctaEngine/__tests__ src/config/__tests__/ctaEngineFlags.test.js
```
