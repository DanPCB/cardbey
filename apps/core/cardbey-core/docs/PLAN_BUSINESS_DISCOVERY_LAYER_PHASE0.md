# Business Discovery Layer (BDL) — Architecture Plan

**Status:** Phase 4 foundation implemented (lib-only, non-authoritative).  
**Date:** 2026-08-06  
**Renamed from:** Stage 5B “Multilingual SEO Architecture”  
**Governing principle:** Every external discovery consumer reads `BusinessDiscoveryProjection` — never raw Business / Store / Product / Translation entities.

---

## Why this layer exists

Pipeline without BDL (risk):

```text
Database → Language Intelligence → Storefront Renderer
                                      ↘ SEO / AI / social / directory (duplicated logic)
```

Target:

```text
Database
    │
    ▼
Business Discovery Projection
    │
    ├─► Storefront Renderer
    ├─► SEO (Phase 5)
    ├─► AI Search (Phase 6)
    ├─► Social Cards
    ├─► Cardbey Directory
    ├─► APIs
    └─► Future channels
```

SEO becomes one **consumer** of discovery, not the architecture.

---

## Naming / package boundary

| Package | Role |
|---------|------|
| `lib/businessDiscovery/` | Acquisition / claim / ingest (existing) |
| `lib/businessDiscoveryLayer/` | **Published-business discovery projection** (this plan) |

Do not conflate. Routes for BDL (later) should avoid colliding with `/api/discovery`.

---

## Roadmap (reorganized platform layers)

| Phase | Name | Status |
|------|------|--------|
| 1 | Language Intelligence | ✅ |
| 2 | Storefront Consumption | ✅ |
| 3 | Translation Operations | ✅ |
| **4** | **Business Discovery Layer** | **Foundation (this stage)** |
| 5 | Multilingual SEO | Deferred — after BDL stable |
| 6 | AI Discovery | Deferred |
| 7 | Business Distribution | Deferred |
| 8 | Business Reputation | Deferred |
| 9 | Business Growth | Deferred |

Legacy Stage numbers (5B→10) map onto Phases 4–9 above.

---

## Phase 4 deliverables

1. **Discovery Projection Engine** — `buildDiscoveryProjection` / `generateDiscoveryProjection`
2. **Discovery Validation** — business → language → translation → fields → slug → media → publishable?
3. **Discovery Events** — `business.discovery.{generated,updated,invalidated,published}`
4. **Discovery Cache** — separate namespaces: projection, metadata, schema, social, ai, directory, sitemap
5. **Discovery Contracts** — `BusinessDiscoveryProjection` as consumer SSOT

---

## Explicit non-goals (Phase 4)

- Localized routes / hreflang / multilingual sitemap
- Search Console / robots product policy changes
- Storefront renderer cutover to BDL
- Wiring publish hook to auto-emit (optional later, gated)
- Google Business / social distribution
- Replacing `lib/businessDiscovery` acquisition flows

---

## Authority

`isBusinessDiscoveryAuthoritative() === false`  
Public APIs and storefront continue on existing publish/public paths until a later gated cutover.
