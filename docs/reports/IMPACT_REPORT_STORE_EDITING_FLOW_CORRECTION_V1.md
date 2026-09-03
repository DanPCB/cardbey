# IMPACT — Store Editing Flow Correction V1

**Date:** 2026-09-03  
**Mission:** `STORE_EDITING_FLOW_CORRECTION_V1`  
**Verdict:** `STORE_EDITING_FLOW_CORRECTION_V1_PARTIAL` (unit tests green; MSD browser acceptance still required on local Draft Preview)

## Phase 0 — Audit classification

| Area | Class | Notes |
|------|-------|-------|
| ShowQuickEditDrawer / ServiceQuickEditDrawer | KEEP | Shared Quick Edit shell |
| websiteItemEditTarget | KEEP | Canonical identity |
| Show primary Edit → drawer | KEEP | Quick Edit |
| Advanced only inside drawer | CORRECTED | On-card **Advanced** + drawer link |
| Edit only FixedServiceCard | CORRECTED | Quote + product + featured |
| My Stores Store Edit → `/preview/website` | KEEP | Canonical Draft Preview |
| View storefront → `/preview/store?view=public` | KEEP | Public / live view (not Edit entry) |
| Docs “Studio = new only” | CORRECTED | Studio = new + advanced |

## Entity matrix

| ENTITY | QUICK EDIT | ADVANCED EDIT | PERSISTENCE |
|--------|------------|---------------|-------------|
| Service | Yes (fixed + quote cards) | N/A | `PATCH …/products/:id` |
| Product | Yes (catalog grid + ServiceCatalog products) | N/A | Same product PATCH |
| Show | Yes (drawer) | Yes (on-card Advanced → Content Studio) | `updateStoreShow` + Studio |
| Promotion | Deferred (prior Studio path) | Studio | Unchanged |
| Featured | Yes when canonical product id | N/A | Product PATCH |
| Hero | Existing hero tools | Existing | Unchanged |

## Route matrix

| ROUTE / ACTION | BEFORE | AFTER |
|----------------|--------|-------|
| Owner Edit Store (My Stores / Catalog) | `/preview/website` | Unchanged (direct Draft Preview) |
| View storefront | `/preview/store?view=public` | Unchanged (not Edit entry) |
| Edit store on live gateway | → website editor | Unchanged (`handleBackToEdit`) |
| Public `/s/:slug` | Public storefront | Unchanged |
| Show Edit | Quick drawer | Quick drawer |
| Show Advanced | Drawer link only | **On-card Advanced** + drawer link |
| New Show | Content Studio / upload | Unchanged |
| Service / Product / Featured Edit | Missing or partial | Quick drawer on Draft Preview |

## What was corrected (smallest safe patch)

1. Show cards: **Edit** (drawer) + **Advanced** (Content Studio with `showWorkId`)  
2. QuoteServiceCard + FixedServiceCard top-right Edit  
3. Product cards in ServiceCatalog + Featured picks + draft catalog grid Edit  
4. Shared ServiceQuickEditDrawer with `entityLabel` service|product  
5. Docs: Content Studio ≠ new-only  

## Shipped

- Dashboard: [PR #293](https://github.com/DanPCB/cardbey-marketing-dashboard/pull/293) → `main`, [PR #294](https://github.com/DanPCB/cardbey-marketing-dashboard/pull/294) → `staging`
- Monorepo submodule bump: [PR #335](https://github.com/DanPCB/cardbey/pull/335) → tip `d425cbdf`

## Browser acceptance (required for READY)

- A Owner Edit Store → Draft Preview directly  
- B Service Quick Edit save in place  
- C Featured Quick Edit  
- D Show Quick Edit  
- E Show Advanced → Studio capabilities for that show  
- F Public storefront no owner Edit  

Until A–F pass on MSD local: keep **PARTIAL**.
