# BUSINESS SPACE FULL STORE CONVERGENCE V1

**Status:** SUPERSEDED for delivery by **SIMPLE STORE STREAM** — see `docs/reports/IMPLEMENTATION_REPORT_BUSINESS_SPACE_SIMPLE_STORE_STREAM.md`  
**Date:** 2026-09-05  
**Mission:** `BUSINESS_SPACE_FULL_STORE_CONVERGENCE_V1` (plan) → `BUSINESS_SPACE_SIMPLE_STORE_STREAM` (shipped)  
**Related impact:** `docs/reports/IMPACT_REPORT_BUSINESS_SPACE_FULL_STORE_CONVERGENCE_V1.md`

---

## Locked product model

```
CARDBEY GLOBAL (/)
      ↓  business identity click
BUSINESS SPACE (/space/:storeId)     ← PRIMARY Cardbey-native store experience
      ↓  optional
FULL WEBSITE (/s/:slug)              ← SECONDARY traditional / custom-domain surface
```

Business Space must project the **same Store SSOT** (catalog, services, shows, posts, promotions).  
Do **not** create a second catalog domain. Do **not** iframe `/s/:slug`. Do **not** delete the website renderer.

---

## Old journey vs new journey

| Step | Old | New |
|------|-----|-----|
| Global identity click | `/space/:id` (already) | `/space/:id` (keep) |
| Browse full menu | Forced to `/s/:slug` (“Visit store”) | In-space commerce zones |
| Content tab | Timeline + ≤2 offerings → RELATED early | Own commerce completes first |
| Long-tail | Always after thin own stream | After `ownBusinessContentComplete` |
| Full website | Required for real store | Optional “View Full Website” |

---

## Route responsibilities (final)

| Route | Responsibility |
|-------|----------------|
| `/` | Cardbey Global discovery stream |
| `/space/:storeId` | **PRIMARY** Cardbey-native business / store experience |
| `/s/:slug` | **OPTIONAL** full website / traditional storefront / future custom domain |
| `/app/...` | Owner / admin / Performer tools |

---

## Phase 26 — Implementation plan (A–G)

### A. CURRENT ROUTE MAP

```
GLOBAL `/`
  PublicHomeFeed → PublicFeedShell → ArtifactCard
       │ identity / open                 │ primary commerce CTA
       ▼                                 ▼
  `/space/:storeId`                 `/s/:slug`
  SpacePage                         PublicStoreSlugRoute
       │                                 │
       ▼                                 ▼
  BusinessSpaceTheatreCanvas        CanonicalStorefrontRenderer
  (+ PublicFeedShell scoped)        → WebsitePreviewPage
```

| Action | Destination | Owner |
|--------|-------------|--------|
| Feed identity / Open | `/space/:storeId?from=feed…` | `buildFeedBusinessSpaceHref`, `storeHref` |
| Order / Menu / Book CTA | `/s/:slug?from=feed&action=…` | `buildFeedStorefrontHref` |
| “Visit store” | `/s/:slug` | `visitStoreHref`, Space panels |
| Space left categories | **In-space** `setActiveTab('services')` | `SpacePage` / theatre left rail |
| Space → full site | “Visit store” (no “View Full Website” label yet) | `BusinessSpaceTabPanels`, `storeUrl` |

**Finding:** Global identity already lands on Business Space. The gap is **commerce depth inside Space**, not the first hop.

---

### B. CURRENT DATA OWNERS

| Concern | Owner | Notes |
|---------|--------|------|
| Space resolve | `resolveBusinessSpaceData` | preview + context + `getPublicStore` merge |
| Offerings projection | `projectSpaceOfferings` (`spaceCatalogProjection.ts`) | Cap **8** for Services tab; Content stream fill **≤2** |
| Categories | `projectSpaceCatalogCategories` | Left rail; switches to Services tab only |
| Shows | Space + `projectShowsToFeedArtifacts` | Content stream fill ≤5 |
| Timeline / posts | Business timeline → FeedArtifacts | Activity-first Content tab |
| Own Content stream | `composeBusinessSpaceContentStream` | Timeline → shows/live/offerings fill → hero |
| Full stream + long-tail | `composeBusinessSpaceStream` | OWN → PARTNER → RELATED → GLOBAL → terminal |
| Long-tail gate | **`includeLongTail !== false` only** | **No `ownBusinessContentComplete`** |
| Full catalog UI | `WebsitePreviewPage` + storefront catalog | Only on `/s/:slug` |
| Public store API | `GET /api/public/stores/:slug` | Shared by Space merge + website |

**Root cause of premature RELATED:** Content stream treats catalog as shallow fill (≤2), then always appends long-tail. Full menu lives on Services tab / `/s/:slug`, so visitors scrolling Content hit “RELATED ON CARDBEY” before seeing the real store.

---

### C. COMPONENTS TO REUSE

| Reuse | Do not |
|-------|--------|
| `projectSpaceOfferings` / categories (expand caps + presentation) | New `BusinessSpaceCatalog` backend |
| Storefront catalog section / service catalog adapters (extract shared presenters) | Iframe `WebsitePreviewPage` |
| `BusinessSpaceTheatreCanvas` + `PublicFeedShell` | Rewrite theatre canvas from scratch |
| `composeBusinessSpaceStream` (add completeness gate) | Duplicate long-tail composer |
| `CanonicalStorefrontRenderer` for Full Website only | Force website layout inside Space |
| Existing book/order/quote handlers | New Space payment/booking systems |
| Adaptive presentation (media stage vs commerce grid) | TikTok geometry for every menu row |

---

### D. DUPLICATION RISKS

1. **Second catalog DTO** — forbidden; project Store SSOT only.  
2. **Iframe `/s/:slug`** — forbidden.  
3. **Forcing every SKU into `FeedArtifact`** — prefer section composition for Zone 4 commerce.  
4. **Removing `/s/:slug`** — forbidden; secondary + custom-domain boundary.  
5. **Rewriting `BusinessSpaceTheatreCanvas`** — out of scope for minimum refactor.  
6. **Touching store creation / payments / Content Studio** — regression-only.

---

### E. MINIMUM REFACTOR STEPS

1. **Define `ownBusinessContentComplete`**  
   True when projected own zones are exhausted: timeline/shows/live (as available) **and** commerce section rendered (or empty-by-truth), not merely stream depth ≥ 2.

2. **Gate long-tail** in `composeBusinessSpaceStream`  
   PARTNER / RELATED / GLOBAL / terminal only after own complete.

3. **Project Zone 4 commerce into Content (and keep Services tab as filter)**  
   Native section: categories + full offerings grid/list using expanded `projectSpaceOfferings` (or shared storefront presenter).  
   Cap removal or raise well above 2 for Content inclusion.  
   Presentation: grid/list — not full-stage video per item.

4. **Category clicks**  
   Stay in-space: scroll/filter Zone 4 (and/or Services tab with category query). Never force `/s/:slug`.

5. **Commerce CTAs in Space**  
   Wire Order/Book/Quote/Contact to existing handlers; avoid dead “Visit store”-only for primary browse.

6. **Secondary Full Website CTA**  
   Label: “View Full Website” (or localized equivalent).  
   Href: `/s/:slug?from=space&spaceId=:id` + return chrome to Space.

7. **Docs + French Baguette Cafe acceptance**  
   Browser evidence only after above.

**Do not start by rewriting BusinessSpaceTheatreCanvas.**

---

### F. FILES EXPECTED TO CHANGE

| Area | Likely files |
|------|----------------|
| Own-complete + long-tail | `composeBusinessSpaceStream.ts`, `composeBusinessSpaceContentStream.ts`, tests |
| Commerce projection | `spaceCatalogProjection.ts`, `BusinessSpaceTabPanels.tsx`, theatre Content composition (section slot) |
| Category → in-space filter | `SpacePage.tsx`, `BusinessSpaceTheatreCanvas.tsx`, `SpaceNavRail.tsx` |
| Full website CTA | `BusinessSpaceTabPanels.tsx`, `spaceAdapter.ts` / `storeUrl` helpers, i18n |
| Feed CTA polish (optional) | `feedActionRouter.ts` — keep identity→Space; commerce may stay on Space action |
| Shared presenters (if extract) | thin adapters from storefront catalog — only if needed |
| Docs | this file + impact report |

---

### G. TEST MATRIX

| ID | Case | Pass criteria |
|----|------|----------------|
| T1 | Global → French Baguette identity | Lands `/space/:id` |
| T2 | Content scroll | Hero → Shows → Featured → **Menu/catalog** before RELATED |
| T3 | Categories | Filter/scroll in-space; no `/s` navigation |
| T4 | Commerce CTA | ≥1 live Order/Book/Quote/Contact from Space |
| T5 | Long-tail | RELATED/GLOBAL only after own complete |
| T6 | View Full Website | `/s/:slug?from=space&spaceId=…` + return |
| T7 | `/s/:slug` regression | Full website unchanged |
| T8 | Global `/` regression | Discovery unchanged |
| T9 | Mobile | Same zone order; chips not desktop rails |
| T10 | No duplicate catalog domain | Grep: no new BusinessSpaceProduct service |

---

## Own-content ordering (target)

1. ZONE 1 — Business presence / hero  
2. ZONE 2 — Current activity (posts, promos, Shows, Live)  
3. ZONE 3 — Featured  
4. ZONE 4 — Store / commerce (menu, catalog, services, categories)  
5. ZONE 5 — Social / interaction  
6. ZONE 6 — Own continuation  
7. ZONE 7 — Partner long-tail  
8. ZONE 8 — Related businesses  
9. ZONE 9 — Global Cardbey discovery  
10. ZONE 10 — Terminal  

---

## Custom-domain boundary

`/s/:slug` remains the conventional / SEO / custom-domain publishing surface.  
Business Space never replaces it; it stops being required for normal Cardbey-native browsing.

---

## Verdict gate (implementation later)

Return `BUSINESS_SPACE_FULL_STORE_CONVERGENCE_V1_READY` only when acceptance items 1–14 in the mission brief pass.

Until then: **PLAN complete; implementation not started.**

**Current architectural blocker (if implementing naively):** Content stream long-tail has no own-commerce completeness gate, and full catalog UI exists only on `/s/:slug` / Services tab — not in the continuous Content spine.
