# IMPACT_REPORT — CTA Engine Phase 1

**Date:** 2026-07-26  
**Status:** Foundation slice (architecture + core resolve path)  
**Flag:** `ENABLE_CTA_ENGINE_V1` (default **on** for evaluate/ranking APIs; storefront primary resolve is always parity-safe)

## Executive verdict

**SAFE TO SHIP (Phase 1)** — introduces a bounded context that **wraps** existing commerce CTA SSOT. Does not migrate floating chrome, feed, PIL, or Partner Pass. No publish/label behavior change intended.

## What could break

1. Draft preview / publish CTA labels diverge from today  
2. Products start inventing parallel CTA registries  
3. Storefront UI layout regressions if chrome is rewritten early  
4. PIL / governance handoffs if action keys are remapped carelessly  

## Why

1. `resolveGeneratedCTA` will call `ctaEngine.resolveStorefrontPrimaryCta`, which delegates to `resolveStoreCommerce` — same labels if wrap is pure.  
2. Phase 1 ships one Capability/CTA registry; products must register, not fork.  
3. Phase 1 does **not** touch `StorefrontPersistentMobileChrome` / feed CTA buttons.  
4. Engine returns action keys; execution still goes through existing handlers + `safeExecutionGovernance`.

## Impact scope

| Area | Phase 1 |
|------|---------|
| `lib/ctaEngine/**` | New |
| `draftStoreService.resolveGeneratedCTA` | Thin redirect |
| `features.js` | Flag |
| Storefront chrome / feed / PIL / Partner | Untouched |
| HTTP API | Deferred (JS API only) |

## Smallest safe patch

1. Add `apps/core/cardbey-core/src/lib/ctaEngine/` with registries, context, eligibility, ranking, render model, analytics shapes, provider interface.  
2. Seed Platform + Store provider capabilities.  
3. `resolveStorefrontPrimaryCta` → existing `resolveStoreCommerce`.  
4. Wire `resolveGeneratedCTA` through engine.  
5. Dashboard thin client types + `CtaHost` stub (opt-in, unused by default routes).  
6. Docs: `CTA_ENGINE.md` + this impact report.  
7. Unit tests for resolve parity + ranking.

## No-parallel-stack proof

- Commerce labels: still `storeTransactionMode.js` / `catalogItemClassification.js`.  
- Intelligence actions: still `actionCatalog.ts` (engine may reference ids later; Phase 1 does not replace).  
- Consequence gating: still `safeExecutionGovernance.ts`.  
- CTA Engine owns **selection + render model**, not click execution or layout chrome.

## Rollout phases (locked)

| Phase | Scope |
|-------|--------|
| **1 (this)** | Core engine + storefront primary resolve wrap + docs/tests |
| **2** | Platform CTA evaluate on one marketing/homepage surface |
| **3** | Migrate storefront sticky/floating chrome to `renderModel` |
| **4** | Feed / discovery adapters |
| **5** | Performer / PIL provider registration |
| **6** | Full analytics + experiments + personalisation persistence |

## Autonomy / agent-first

Platform CTAs that create/publish/bill remain Level 3+ via existing governance. Engine ranking never sets `autoSubmit: true`.
