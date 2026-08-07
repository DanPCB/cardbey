# Impact Report — Business Discovery Layer Phase 4 Foundation

**Date:** 2026-08-06  
**Stage rename:** Stage 5B “Multilingual SEO Architecture” → **Business Discovery Layer (BDL) Foundation**  
**Package:** `apps/core/cardbey-core/src/lib/businessDiscoveryLayer/`  
**Authority:** `isBusinessDiscoveryAuthoritative() === false`

---

## VERDICT

**BUSINESS_DISCOVERY_LAYER_FOUNDATION_READY** — contracts, projection engine, validation gate, in-process events, and namespaced caches are in place. No SEO implementation, no public consumer cutover, no publish-path mutation.

---

## (1) What could break

| Risk | Mitigation in this stage |
|------|--------------------------|
| Confuse with acquisition `lib/businessDiscovery` | New sibling package `businessDiscoveryLayer`; docs call out naming |
| Accidental SEO/public cutover | Consumer cutover + SEO consumer flags fail-closed; authoritative locked false |
| Publish / public store regressions | No wire into `publishProjectionHooks`, `publicUsers.js`, or storefront render |
| LI storefront cutover conflict | BDL only *reads* optional `storefrontLocalization`; does not reimplement cutover |
| Cache pollution across consumers | Separate namespaces (projection / metadata / schema / social / ai / directory / sitemap) |

---

## (2) Why

Building multilingual SEO directly on Database → LI → Storefront would duplicate metadata, schema, sitemap, canonical, OG, AI facts, and directory cards. A canonical discovery projection is the missing platform layer.

---

## (3) Impact scope

| Area | Impact |
|------|--------|
| Core lib | Additive package only |
| Features snapshot | Additive `businessDiscoveryLayer` keys |
| Public `/s/:slug` | Untouched |
| Publish artifact path | Untouched (adapter *reads* artifact shape) |
| Language Intelligence | Untouched |
| Dashboard | Untouched |
| robots.txt / sitemap | Untouched |

---

## (4) Smallest safe patch

1. Add `businessDiscoveryLayer` with contracts + engine + validation + events + cache  
2. Fail-closed flags + `isBusinessDiscoveryAuthoritative() === false`  
3. Unit tests; no route/publish cutover  
4. Plan + impact docs locking Phase 5 SEO as *consumer*, not next implementation target without BDL stability

---

## DELIVERABLES

| # | Deliverable | Location |
|---|-------------|----------|
| 1 | Projection engine | `projection/`, `generateDiscoveryProjection.js` |
| 2 | Validation | `validation/validateDiscoveryProjection.js` |
| 3 | Events | `events/discoveryEventBus.js` + `DISCOVERY_EVENT_TYPES` |
| 4 | Cache namespaces | `cache/` |
| 5 | Contracts | `contracts/discoveryProjection.js` et al. |

---

## ARCHITECTURE

```text
PublishedArtifactProjection / public store DTO
        │
        ▼
buildDiscoveryProjection → BusinessDiscoveryProjection
        │
        ├─ validateDiscoveryProjection
        ├─ namespaced caches
        └─ discovery events (in-process)
                │
                ▼ (later phases — NOT this stage)
        SEO | AI | Social | Directory | APIs
```

---

## FLAGS

| Env | Default |
|-----|---------|
| `ENABLE_BUSINESS_DISCOVERY_LAYER_V1` | non-prod on / prod off |
| `ENABLE_BUSINESS_DISCOVERY_PROJECTION_V1` | follows layer |
| `ENABLE_BUSINESS_DISCOVERY_VALIDATION_V1` | follows projection |
| `ENABLE_BUSINESS_DISCOVERY_EVENTS_V1` | follows layer |
| `ENABLE_BUSINESS_DISCOVERY_CACHE_V1` | follows projection |
| `ENABLE_BUSINESS_DISCOVERY_CONSUMER_CUTOVER_V1` | **fail-closed** |
| `ENABLE_BUSINESS_DISCOVERY_SEO_CONSUMER_V1` | **fail-closed** |

---

## ROADMAP LOCK

| Next | Name | Gate |
|------|------|------|
| Phase 5 | Multilingual SEO | BDL stable + consumer cutover design |
| Phase 6 | AI Discovery | After SEO consumer or parallel behind own flag |
| Phase 7–9 | Distribution / Reputation / Growth | After discovery projection is durable |

**Do not proceed to multilingual SEO implementation until BDL projection + validation are consumed by a gated shadow path.**

---

## TESTS

`src/lib/businessDiscoveryLayer/__tests__/businessDiscoveryLayerPhase4.test.js`

---

## EXPLICITLY NOT DONE

- Localized routes / hreflang / multilingual sitemap  
- OpenGraph / JSON-LD emit on `/s/:slug`  
- Publish-hook auto-generation  
- Directory or AI API surfaces  
- Consumer authority cutover  
