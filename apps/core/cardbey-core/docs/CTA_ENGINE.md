# CTA Engine

**Bounded context:** `apps/core/cardbey-core/src/lib/ctaEngine/`  
**Status:** Phase 2 — first production consumer (platform marketing)  
**Impact:** `docs/IMPACT_REPORT_CTA_ENGINE_PHASE_1.md`, `docs/IMPACT_REPORT_CTA_ENGINE_PHASE_2.md`

## Product vision

Cardbey has two storefronts that share one engine:

| Storefront | Sells | Provider |
|------------|-------|----------|
| Store | The merchant | `store` |
| Platform | Cardbey capabilities | `platform` |

Plus Performer, Discovery, and Campaign providers over the same interface.

## Non-negotiables

1. **Wrap, don’t rewrite** — commerce labels stay in `storeTransactionMode` / catalog classification.  
2. **Engine owns selection** — products register capabilities; they do not invent local ranking.  
3. **Rendering ≠ ranking** — UI hosts consume a `CtaRenderModel`; chrome layout stays in the dashboard.  
4. **Execution stays governed** — high-impact actions still use `safeExecutionGovernance` / Performer handoffs (`autoSubmit: false`).  
5. **No parallel CTA SSOT** — one Capability Registry + CTA Registry.

## Module map

```
ctaEngine/
  sharedTypes/     Capability, CtaVariant, Context, RankedSlot, RenderModel
  capabilityRegistry/
  ctaRegistry/
  providers/       platform, store, (performer/discovery/campaign stubs)
  contextResolver/
  eligibility/
  ranking/
  triggerEngine/   scroll / section semantic triggers
  renderModel/
  analytics/
  experiments/
  personalisation/
  api/             public surface
  bootstrap.js     seed default capabilities
  index.js
```

## Public API

```js
import {
  registerCapability,
  registerCtaVariant,
  registerProvider,
  evaluateContext,
  getActiveCta,
  dismissCta,
  recordInteraction,
  recordConversion,
  buildRenderModel,
  resolveStorefrontPrimaryCta,
} from '../lib/ctaEngine/index.js';
```

| Method | Role |
|--------|------|
| `registerCapability` | Add a discoverable capability |
| `registerCtaVariant` | Marketing/copy variant for a capability |
| `registerProvider` | Platform / Store / Performer / … source |
| `evaluateContext` | Semantic context → eligible ranked CTAs |
| `getActiveCta` | Primary (+ secondary) for a surface |
| `dismissCta` | Frequency + dismiss memory |
| `recordInteraction` / `recordConversion` | Analytics events |
| `buildRenderModel` | Placement-agnostic UI contract |
| `resolveStorefrontPrimaryCta` | Parity path over `resolveStoreCommerce` |

## Ranking output

- **Primary** — normally one visible commercial CTA  
- **Secondary** — optional supporting actions  
- **Hidden** — eligible but suppressed (frequency / dismiss / completion)  
- **Deferred** — wait for scroll/section trigger  

## Context (semantic, not route-only)

Route, page kind, scroll/section, mission, store state, auth, business type, recent activity, dismiss history, feature flags, device, language, journey stage.

## Phase 2 — first consumer

| Field | Value |
|-------|--------|
| Surface | `/for-business` (+ `/for-sellers`) — `BusinessEntryRuntimePage` |
| Selection | `POST /api/cta/evaluate` → `evaluatePlatformMarketingCta` (platform provider only) |
| Renderer | `PlatformCapabilityCta` / `PlatformMarketingCtaHost` |
| Semantic sections | `STORE_CREATION`, `PROFILE_IDENTITY`, `PRODUCTS_SERVICES`, `MENU_IMPORT`, `LOYALTY`, `PLATFORM_OVERVIEW` via `data-cta-section` + IntersectionObserver |
| Execution | `activatePlatformMarketingCta` → existing `launchBusinessEntryFromMarketing` / login resume / scroll — **not** direct mutations |
| Overlay slots | `overlaySlots.ts` — platform CTA z-40; support orb raised on runway |

### Feature flags

| Flag | Default |
|------|---------|
| `ENABLE_CTA_ENGINE_V1` | on |
| `ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` | on when `CARDEY_DEPLOY_ENV` includes `staging` or `NODE_ENV!=='production'`; **off** in live production unless explicitly set |
| `VITE_ENABLE_CTA_ENGINE_PLATFORM_MARKETING_V1` | on in Vite `dev`; **off** in staging/prod builds unless set (`true` in dashboard `.env.staging`) |

Rollback: Vite flag = **build-time** (rebuild required). Core flag = **runtime**. Hero Start with AI unchanged; floating engine CTA unmounts.

Phase 2B/2C validation: see `docs/IMPACT_REPORT_CTA_ENGINE_PHASE_2C.md` and `docs/CTA_ENGINE_PHASE_2_STAGING_RUNBOOK.md`.

Overlay: `BottomOverlayRegistry` CSS vars coordinate platform CTA + Need help orb (stack ≤390px; side-by-side with reserved gutter otherwise).

### Analytics

**EMITTED_ONLY** — `POST /api/cta/events` + in-memory sink. Not durable warehouse.

## Phase roadmap

| Phase | Scope |
|-------|--------|
| 1 | Engine foundation + storefront primary resolve wrap |
| **2** | Platform marketing floating CTA on `/for-business` |
| 3 | Storefront sticky chrome → render model (store provider) |
| 4 | Feed / discovery adapters |
| 5 | Performer provider + durable analytics |

## Mobile-first rendering contract

`CtaRenderModel.placement` supports: `sticky` | `floating` | `inline` | `section` | `hero` | `bottom_sheet` | `drawer` | `notification`.

Hosts must respect safe-area, nav, support orb, and composer clearance. Engine does not own DOM layout. Use `OVERLAY_Z` / `overlaySlots` — do not escalate page-local `z-index`.

## Success criteria

Every new commercial or capability-discovery CTA registers with the engine. No product ships independent ranking or dismiss logic.
