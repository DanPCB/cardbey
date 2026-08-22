# Impact Report — My Stores Edit Entry Cleanup (Phase A)

**Auth:** `ACK MY_STORES_EDIT_ENTRY_CLEANUP_PHASE_A`  
**Date:** 2026-08-21  
**Scope:** My Stores card actions only. No preview merge, publish changes, Performer/Admin changes, telemetry, or legacy-route redirects.

## Previous three-entry structure

| Label | Handler / route | Resolver |
|-------|-----------------|----------|
| Website Editing | `openWebsiteEditingForStore` | `resolveWebsiteEditingTarget` → store-scoped Draft Review |
| Quick edit | `openQuickEditForStore` | `buildDraftReviewUrl` → `/app/store/draft/review` (create-store lineage) |
| Store Edit | `openStoreEditForStore` | `resolveCommittedStoreWebsiteEditorTarget` → preview/style |
| Manage catalog | Link | `/catalog?storeId=…` (separate operational surface) |

## Root cause

Quick edit used the **create-store draft restore** URL builder for an **existing Business**. `StoreReviewPage` then applied exact-lineage recovery and showed “We couldn't reopen the exact store editing session.” Product IA also presented three “edit” verbs for two different products (Draft Review vs style preview).

## New entry structure (Phase A)

| Visible action | Resolver / destination |
|----------------|------------------------|
| **Edit website** (primary) | `resolveWebsiteEditingTarget` → `/app/store/{storeId}/review?websiteEditing=1&…` |
| **Style & preview** | `resolveCommittedStoreWebsiteEditorTarget` → preview/style (unavailable toast if no draft) |
| **Open dashboard** | `getOverviewRoute(storeId)` |
| **View live** | `/preview/store/{storeId}?view=public` |

Removed from My Stores UI:

- Quick edit  
- Store Edit (label)  
- Manage catalog (catalog remains inside Edit website → Catalog)

## Resolver ownership

- **Edit website:** only `resolveWebsiteEditingTarget` (Phase 0). Never `buildDraftReviewUrl` from My Stores.  
- **Style & preview:** only `resolveCommittedStoreWebsiteEditorTarget`. Does not use Website Editing resolver. Does not publish on open.  
- **Publish / Republish:** unchanged; not in Phase A.

## Remaining legitimate legacy restore path

`/app/store/draft/review` + `buildDraftReviewUrl` remain for:

- Create-store mission continuation  
- Exact draft/generation lineage restoration  
- Other existing recovery contexts (Performer flows, CatalogPage still has its own Quick edit / Store Edit — **out of Phase A**)

`openQuickEditForStore` lived **only** on My Stores; it was removed with that page rewrite. CatalogPage still has separate Quick edit / Store Edit copy and handlers — deferred.

`StoreReviewPage` exact-lineage failure guard was **not** weakened.

## Tests

- `src/pages/myStores/MyStoresPage.test.tsx` — CTA set, resolvers, no legacy labels, EN/VI copy  
- `src/test/i18nContract.test.ts` — `myStoresPage.*` keys en+vi  

## Browser verification

(Completed against disposable local fixture if servers available; CAPITAL GROUP only if disposable.)

Checklist:

1. My Stores shows one primary **Edit website**  
2. Quick edit / Store Edit / Manage catalog absent  
3. Edit website → store-scoped Draft Review with Catalog + Shows  
4. Style & preview → presentation surface; no publish on open  
5. View live → public preview of same store  
6. No new Business/store/draft from these CTAs  
7. Normal My Stores path cannot reach exact-lineage restore error  

## Explicitly deferred

- Broader route convergence / redirects for bookmarked Quick edit URLs  
- Merging Style & preview into Draft Review  
- CatalogPage Quick edit / Store Edit cleanup  
- Telemetry  
- Publish/republish contract changes  
- Performer Automation/Manual  
- Admin Account Management changes (regression-only)  
