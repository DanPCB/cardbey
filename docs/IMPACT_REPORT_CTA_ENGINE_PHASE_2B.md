# IMPACT_REPORT — CTA Engine Phase 2B (Validation)

**Date:** 2026-07-26  
**Verdict:** `PHASE_2_PARTIAL`

## Vitest harness

| Field | Value |
|-------|--------|
| Status | **FIXED** |
| Root cause | `@testing-library/jest-dom` `/vitest` bridge + Vitest **1.6.1** → `Cannot set property testPath … getter` |
| Fix | `src/test/setup.ts` uses `expect.extend(matchers)` from `@testing-library/jest-dom/matchers` |
| Canonical command | From `apps/dashboard/cardbey-marketing-dashboard`: `pnpm exec vitest run` |
| Results | CTA unit/isolation + flag parsing green on repaired harness |

## Playwright

| Field | Value |
|-------|--------|
| Mocked API | **PASS** — 5/5 `tests/e2e/cta-engine-platform-marketing.spec.ts` (fresh Vite `--mode development`) |
| Integration API | **PASS (scripted)** — `scripts/cta-phase2b-staging-smoke.mjs` against staging dashboard + live `/api/cta/evaluate`; gated Playwright live spec exists (`CTA_E2E_LIVE=1`) but default config webServer is unsuitable for remote BASE_URL |

## API race protection

`evaluateRaceGuard.ts` — generation token + AbortSignal; unit-covered. Older STORE_CREATION cannot replace newer LOYALTY.

## Staging deployment

| Item | Value |
|------|--------|
| Core commit | `1b346c60a` (+ `bbde086cc` gitlink cleanup) on `staging` |
| Dashboard commit | `922915b` on `staging` (`97feb55` flag enable, then section-lock fix) |
| Core staging | `https://cardbey-core-staging.onrender.com` — health `ctaEngine.platformMarketingV1: true`, uptime reset after deploy |
| Dashboard staging | `https://cardbey-dashboard-staging.onrender.com` |
| Deploy note | Orphan `.development-workspaces/dev-*` gitlinks broke `git submodule update` in CI; removed. Render still auto-deployed core once graph cleaned / commit landed. |
| Vite staging flag | `VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1=true` in `.env.staging` + `render.yaml` staging service |
| Core staging flag | `CARDEY_DEPLOY_ENV=staging` treated as non-prod; `ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1=true` in staging `render.yaml` |

### Live API section matrix (2026-07-26)

| Section | Primary capability |
|---------|-------------------|
| PLATFORM_OVERVIEW | learn_more |
| STORE_CREATION | create_store |
| PROFILE_IDENTITY | create_profile |
| PRODUCTS_SERVICES | list_catalog |
| MENU_IMPORT | import_menu |
| LOYALTY | launch_loyalty |

## Desktop smoke

- Signed-out `/for-business`: host mounted, hero **Start with AI** present, evaluate OK (`create_store` default).
- `/for-sellers`: host mounts.
- create_store click: marketing handoff path; no checkout/payment success.
- Screenshots: `test-results/cta-phase2b-staging/desktop-*.png` (local agent run; not committed).

## Mobile validation

| Viewport | Host | Horizontal overflow |
|----------|------|---------------------|
| 390×844 | yes (bottom ~y=664) | none |
| 412×915 | yes | none |
| 375×667 | yes | none |
| landscape | captured | — |

## Need help overlap

**OPEN (improved, not fully signed off)**  
Desktop: CTA left of orb, no hard occlusion. Mobile initial: CTA and orb share bottom runway — close proximity / shadow contact possible. Layout uses reserved bottom occupancy / raised orb on runway; do not raise z-index further. Visual sign-off still required after section-lock deploy (`922915b`).

## Analytics

**EMITTED_ONLY**  
Events post to `/api/cta/events` with capability/placement/section dimensions; no durable warehouse claim. Impression dedupe by capability:variant in host. Not claiming analytics storage.

## Regression evidence

Code-path isolation tests (`phase2Isolation.regression.test.ts`) — storefront/feed/PIL/Partner Pass do not import Phase 2 host/API. **Non-E2E.** Full browser suites for those surfaces not re-run in this phase.

## Rollback

| Flag | Semantics | Staging rollback |
|------|-----------|------------------|
| `VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` | **Build-time** | Unset/false → rebuild/redeploy dashboard |
| `ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` | **Runtime** | `false` → API `404 PLATFORM_MARKETING_CTA_DISABLED` |
| `CARDEY_DEPLOY_ENV=staging` default | Runtime default on when unset | Explicit `ENABLE_…=false` wins |

Browser rebuild with Vite flag off **not** executed in this session (would require a second staging build). Production defaults remain off.

## Production flags

- Core production service: no staging deploy-env; unset → **off**.
- Dashboard production `render.yaml`: Vite CTA flag **not** set → **off**.
- Strict parse tests: undefined / true / false / `"true"` / `"false"` / `"1"` / `"0"`.

## Remaining risks

1. Need help + CTA proximity on small viewports (OPEN).  
2. Vite flag-off rollback not browser-proved on staging.  
3. Auth `next` preservation not exercised in staging smoke script.  
4. Build Artifact GH workflow still fails (other jobs); Render deploy path used instead.  
5. Section IO can still fight rapid scroll; e2e seam now locks until scroll idle.

## Recommended next

1. Visual sign-off Need help vs CTA after `922915b` deploy.  
2. Staging rebuild with Vite flag false → confirm host unmount (rollback proof).  
3. Auth-required CTA `next` smoke.  
4. Then Phase 3 storefront chrome migration (only after COMPLETE).
