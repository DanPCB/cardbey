# Impact Report: Storefront Projection Renderer Cutover V1

**Date:** 2026-08-02  
**Flag:** `ENABLE_STOREFRONT_PROJECTION_RENDER_CUTOVER_V1` (default **off** in production; on in non-prod/staging when unset; requires `ENABLE_DESIGN_LIBRARY_V1`)  
**Depends on:** Design Library V1 + Projection Acceptance V1 (accepted fingerprint)  
**Does not change:** Business Discovery, Canonical Business Truth, publish cutover (`ENABLE_STOREFRONT_PROJECTION_PUBLISH_V1`), global authority (`isDesignLibraryAuthoritative()` remains `false`)

**Status:** Implemented — accepted projection can drive the **draft storefront renderer** for one eligible draft when flags + acceptance gates pass. Automatic legacy fallback on any gate failure.

---

## 1. Renderer authority — before vs after

| Surface | Before | After (flag on + eligible) | After (flag off / ineligible) |
|---------|--------|----------------------------|-------------------------------|
| Draft website preview (`WebsitePreviewPage`) | Legacy `normalizeStorefrontSections` → fixed hero/show/catalog bands + Book heuristics | **`ProjectionCutoverStorefront`** consumes Core `viewModel` directly | Unchanged legacy path |
| Public `/s/:slug` | Legacy only | Unchanged in this phase (publish snapshot still legacy by default) | Legacy |
| Publish snapshot | Legacy / optional Phase 8B package | **Unchanged** — render cutover does not import publishCutover | Unchanged |
| Global DL authority | `false` | Still `false` | Still `false` |

**Authority rule:** Per-draft, fail-closed. Projection is primary only when:

1. `ENABLE_STOREFRONT_PROJECTION_RENDER_CUTOVER_V1` enabled  
2. Acceptance enabled + record `status === 'accepted'` + `applyToDraftPreview === true`  
3. Acceptance fingerprint matches current projection  
4. Projection package validates  
5. No unsupported *critical* section  

Otherwise → legacy + structured reason.

---

## 2. Legacy normalization bypass

| Path | Behaviour |
|------|-----------|
| Projection eligible | `bypassLegacyNormalize: true` — dashboard **does not** call `normalizeStorefrontSections` |
| Projection path | `normalizeProjectionSections` partitions by visibility only (preserves `semanticRole`) |
| Legacy | Existing `normalizeStorefrontSections` unchanged |

**Why:** `normalizeStorefrontSections` only retains `hero | usp_bar | show | featured | catalog | about | social_proof | contact` and synthesizes a flat catalog — that was the primary loss point for projection roles.

---

## 3. Supported semantic sections (cutover renderer)

Native roles (no flatten into a single catalogue / Other bucket):

| Role | Renderer type (preferred) | Visibility |
|------|---------------------------|------------|
| `service_categories` | `service-category-grid` | visible |
| `services` | `service-list` | visible |
| `products` | `product-grid` | visible |
| `menu` | `menu-list` | visible |
| `trust` | `trust-features` | visible |
| `testimonials` | `testimonial-list` | visible |
| `projects` | `portfolio-grid` | visible (omit UI when empty) |
| `gallery` | `gallery` | visible |
| `service_area` | `service-area` | visible |
| `quote` | `quote-cta` | visible |
| `contact` | `contact` | visible |
| `location` | `location` | visible |
| `policies` | `policy-links` | **footer_only** |
| `footer` | `footer` | footer |
| `hero` | `hero` | visible |

Capabilities object: `PROJECTION_CUTOVER_RENDERER_CAPABILITIES` (`rendererId: cardbey-projection-cutover-v1`)

- `supportsGroupedServices: true`  
- `supportsFooterOnly: true`  
- `supportsCollapsedSections: false` (collapsed → hidden, same public policy as legacy)

Unsupported types: explicit compatibility fallback via existing `SEMANTIC_TO_RENDERER_TYPE` / adapter — **preserve `semanticRole`**, record `compatibilityFallback`, never change commercial meaning. Critical failures → full legacy fallback.

---

## 4. CTA mapping (Phase 3 commerce policy)

Consumed from accepted projection / commerce policy (`primaryAction` / `secondaryActions`):

| Business model / evidence | Primary CTA |
|---------------------------|-------------|
| `service_quote` / quote signal | **Request a quote** (`request_quote`) |
| `service_booking` + booking evidence | **Book** |
| Retail + purchasable | **Buy** / **Add to cart** |
| Restaurant + order/reserve evidence | **Order** / **Reserve** |
| No booking evidence | **Never** show Book |

Hard rules enforced in cutover UI + tests:

- Never map `request_quote` → Book  
- Never map testimonial / policy / career → service/product  
- Never invent automatic **Other (N)** catalogue buckets  

---

## 5. Fallback reasons

| Reason | Meaning |
|--------|---------|
| `render_cutover_disabled` | Flag off |
| `no_acceptance` | Missing / not accepted / `applyToDraftPreview` false |
| `acceptance_stale` | Fingerprint mismatch |
| `projection_missing` | No projection package |
| `projection_invalid` | VM validation failed |
| `unsupported_critical_section` | Hero / offering-or-quote missing, or forbidden commerce mapping |
| `resolver_error` | Exception during build |
| `legacy_fallback` | Generic fail-closed |
| `accepted_projection_render` | Success — projection primary |

---

## 6. Structured events

| Event | When |
|-------|------|
| `storefront.render_source.selected` | Every resolve (legacy or projection) |
| `storefront.projection_render.completed` | Projection primary selected |
| `storefront.projection_render.fallback` | Legacy selected with reason |

Emitted from `emitRenderCutoverEvents.js` (non-prod console log).

---

## 7. Modern Security Doors — before / after

| Check | Before (legacy) | After (cutover eligible) |
|-------|-----------------|--------------------------|
| Section order | Flat catalog / Book bands | `trade-lead-generation` projection order retained |
| Service categories | Flattened / Other | Grouped `service_categories` |
| Specific services | Mixed into one list | Separate `services` |
| Why Choose Us | Catalog or dropped | `trust` |
| Testimonials | Catalog or social_proof | `testimonials` |
| Policies / careers | Catalog items or dropped | Footer (`footer_only` / footer) |
| Projects | N/A or empty clutter | Hidden / omitted when absent |
| Primary CTA | **Book** | **Request a quote** + Call |
| Other (17) | Possible | **Absent** |

Evidence: `renderCutoverV1.test.js` → “accepted MSD → projection VM…”

---

## 8. Data flow (actual render consume)

```text
GET /api/draft-store/:draftId
  → buildLiveRenderPayload (read-only over meta)
  → response.storefrontRender { primarySource, reason, viewModel, bypassLegacyNormalize }
        ↓
WebsitePreviewPage
  → if primarySource === 'projection' && viewModel
       → ProjectionCutoverStorefront(viewModel)   // NO normalizeStorefrontSections
     else
       → legacy normalizeStorefrontSections + existing bands
```

Draft / truth / projection / acceptance are **not mutated** by the resolver (asserted in tests).

---

## 9. Files touched

### Core

- `lib/storefrontDesignLibrary/flags.js` — cutover flag  
- `config/features.js` — `projectionRenderCutoverV1`  
- `.env.example` — documented  
- `rendering/renderCompatibility.js` — `PROJECTION_CUTOVER_RENDERER_CAPABILITIES`  
- `rendering/projectionSectionAdapter.js` — legacy-only trust/policies fallback (cutover keeps native types)  
- `renderCutover/*` — resolver, package, payload, events, critical check, fixtures, tests  
- `routes/draftStore.js` — ephemeral `storefrontRender` on GET  
- `lib/storefrontDesignLibrary/index.js` — diagnostics + flag export  

### Dashboard

- `components/storefront/ProjectionCutoverStorefront.tsx`  
- `lib/storefront/projectionCutoverTypes.ts`  
- `lib/storefront/projectionCutoverResolve.ts` (+ tests)  
- `lib/storefront/normalizeProjectionSections.ts`  
- `pages/public/WebsitePreviewPage.tsx` — branch before legacy body  

### Docs

- This report  

---

## 10. Tests

| Suite | Coverage |
|-------|----------|
| `renderCutover/__tests__/renderCutoverV1.test.js` | Resolver gates; MSD accept → quote/roles/footer; flag off; invalid fallback; beauty/restaurant/retail/portfolio/incomplete fixtures; publish isolation |
| `projectionCutoverResolve.test.ts` | Client bypass, partition, CTA, Other detection |
| Existing `shadowRenderPhase6.test.js` | Still green after adapter legacy/cutover split |

---

## 11. Fixtures added

`renderCutover/__fixtures__/renderCutoverBusinesses.js`:

- Beauty booking  
- Restaurant  
- Retail  
- Portfolio agency  
- Grounded incomplete  

Plus existing MSD nav fixture reused for acceptance.

---

## 12. Remaining blockers for publish consolidation

1. **Public published storefront** still uses legacy snapshot + `normalizeStorefrontSections` unless Phase 8B publish cutover is also enabled **and** the public React path learns projection section types (or reuses `ProjectionCutoverStorefront` from published meta).  
2. **Publish forks** (`/api/store/publish`, mission `commitDraft`, draft-store publish) remain separate — this phase intentionally does not unify them.  
3. **`isDesignLibraryAuthoritative()`** still false — no global cutover.  
4. **Theme / visualThemeId** carried on VM but not yet applied as live CSS in `ProjectionCutoverStorefront`.  
5. **Owner chrome** (hero editor, show reel, mobile nav) remains legacy-adjacent when cutover is active — cutover replaces main body sections only.  
6. **Canonical Business Truth** still not the single source — cutover consumes projection roles + commerce policy, not `businessTruth` stamps.

---

## 13. Production readiness for this phase

| Verdict | Scope |
|---------|--------|
| **PILOT_READY** | Staging / non-prod with DL + acceptance + render cutover flags; owner accepts projection; draft `/preview/website/:draftId` |
| **NOT_READY** | Production default (flag off); public live site cutover; publish consolidation |

**Do not mark overall Store Creation architecture complete** based on advisory metadata alone — this phase demonstrates the **rendered draft storefront** consumes the accepted projection when eligible.
