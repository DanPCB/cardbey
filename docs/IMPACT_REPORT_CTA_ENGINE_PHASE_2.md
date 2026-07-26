# IMPACT_REPORT — CTA Engine Phase 2

**Date:** 2026-07-26  
**Status:** First production consumer (platform marketing)  
**Consumer:** `/for-business` (+ alias `/for-sellers`) — `BusinessEntryRuntimePage`

## Target surface (canonical)

| Field | Value |
|-------|--------|
| Route | `/for-business` (alias `/for-sellers`; `/features` redirects here) |
| Page | `apps/dashboard/.../pages/business/BusinessEntryRuntimePage.tsx` |
| Layout | `MarketingLayout` |
| Why | Cardbey-owned seller runway; guest-safe; already hands off to Performer; does not disturb Living Canvas `/` marketplace or merchant storefront |

**Not selected:** `/` (artifact feed — not capability marketing), orphaned `Homepage.tsx` / `LandingPage.tsx`, `/app` (mission-critical).

## What could break

1. Floating CTA overlaps header / Need help orb / intake card  
2. Platform CTA routes invent a second onboarding path  
3. Store commerce CTAs leak onto marketing (or reverse)  
4. Flag-off fails to restore prior UI  
5. Evaluate API failure blanks the page  

## Why / mitigations

1. Shared overlay slots (`cta-overlay-slots`) + orb bottom offset on `/for-business`  
2. Actions map to existing `launchBusinessEntryFromMarketing` / Performer entry / learn-more anchors — no new execution engine  
3. Provider filter: marketing consumer only accepts `provider === 'platform'`  
4. Dedicated `ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` / `VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` — default **off** in production builds, **on** in local `dev` mode  
5. Error boundary + fallback = no floating CTA; hero Start with AI unchanged  

## Feature flags

| Flag | Owner | Default |
|------|--------|---------|
| `ENABLE_CTA_ENGINE_V1` | Core library | on |
| `ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` | Core (API gate) | off in live production; on for `CARDEY_DEPLOY_ENV=staging` or non-prod `NODE_ENV` unless explicitly false |
| `VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` | Dashboard consumer | **build-time**; off in staging/prod MODE unless set; on in Vite `dev`; staging `.env.staging` sets `true` |

**Phase 2B status:** `PHASE_2_PARTIAL` — see `docs/IMPACT_REPORT_CTA_ENGINE_PHASE_2B.md`.

Rollback: set Vite/env flag to `false` — previous runway UI (no engine floating CTA).

## Migration matrix

| Surface | Current CTA owner | Phase 2 | Provider | Execution owner | Risk |
|---------|-------------------|---------|----------|-----------------|------|
| Cardbey global marketing (`/for-business`) | Static chips + Start with AI | **Migrating floating primary** | platform | businessEntryBridge → Performer | Medium |
| Storefront | storeTransactionMode + chrome | Untouched | store | existing storefront handlers | None |
| Discovery/feed | feedCta* | Untouched | — | feed handlers | None |
| PIL/concierge | actionCatalog / concierge | Untouched | — | governance handoff | None |
| Partner Pass | PartnerPassDashboard | Untouched | — | partner routes | None |
| Performer continuation | intake ctaButtons | Untouched | performer stub | intake | None |
| Authenticated dashboard | various | Untouched | — | — | None |
| Loyalty management | loyalty UI | Untouched | — | loyalty tools | None |

## Analytics status

**EMITTED_ONLY** — events via CTA Engine in-memory sink + optional client beacon to `POST /api/cta/events`. Not claimed as durable warehouse analytics.

## Test status (local)

| Suite | Result |
|-------|--------|
| Core `ctaEngine.phase1` + `phase2.marketing` | **19/19 pass** |
| Dashboard vitest (`PlatformCapabilityCta`, actions) | Blocked by pre-existing harness `testPath` getter error (affects other dashboard unit tests too) |
| Playwright `tests/e2e/cta-engine-platform-marketing.spec.ts` | Written (mocks `/api/cta/evaluate`); not executed in this slice |
| Staging smoke | Pending deploy |

## Rollback

1. Set `VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1=false` (dashboard)  
2. Optionally set `ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1=false` (core API returns 404)  
3. Redeploy — hero Start with AI / chips unchanged; floating engine CTA unmounts  

## Phase 3 candidates

1. Migrate storefront sticky chrome to render model (store provider only)  
2. Durable analytics sink  
3. Performer provider registration for mission continuation CTAs  
4. Fix dashboard vitest harness `testPath` regression so frontend CTA tests run in CI  
