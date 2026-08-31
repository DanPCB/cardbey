# IMPACT REPORT — Single Owner Website Editing Entry (Phase B)

**Authorization:** `ACK SINGLE_OWNER_WEBSITE_EDITING_ENTRY_PHASE_B`  
**Date:** 2026-08-21  
**Scope:** Dashboard owner-facing content-edit entry consolidation  
**Explicit exclusions honored:** No Style & preview merge into Draft Review; no publish/republish changes; no Performer kernel/blackboard changes; exact-lineage recovery retained; no push/deploy/live data; BB Flowers untouched.

---

## Verdict

`SINGLE_OWNER_WEBSITE_EDITING_ENTRY_PHASE_B_READY`

---

## A. Owner entry inventory

| Surface | Label (before → after) | Previous helper | Destination | Intent | Canonical action |
| ------- | ---------------------- | --------------- | ----------- | ------ | ---------------- |
| My Stores | Edit website | `resolveWebsiteEditingTarget` → now `openWebsiteEditing` | Store-scoped `/app/store/:id/review?websiteEditing=1` | Content edit | Website Editing |
| My Stores | Style & preview | `resolveCommittedStoreWebsiteEditorTarget` | Preview/website editor | Presentation | Style & preview |
| My Stores | Open dashboard | `getOverviewRoute` | Overview | Ops | Open dashboard |
| My Stores | View live | public preview URL | Live storefront | View | View live |
| CatalogPage | Quick edit → **Edit catalog** | `buildDraftReviewUrl` → **`openWebsiteEditing`** | WE `section=catalog` | Catalog content | Website Editing |
| CatalogPage | Store Edit → **Style & preview** | `resolveCommittedStoreWebsiteEditorTarget` | Preview surface | Presentation | Style & preview |
| CatalogPage | Edit → **Edit item** + **Adjust listing** | Inventory panel only → WE item + inventory panel | WE `section=catalog&itemId` / local inventory | Content vs ops | Split |
| Business Overview | Open Website Editing → **Edit website** (+ catalog/Shows/style) | `resolveWebsiteEditingTarget` → `openWebsiteEditing` | WE (+ sections) | Content | Website Editing |
| Admin Account Management | Edit Website → **Edit website** | `resolveWebsiteEditingTarget` → `openWebsiteEditing` (`entry=admin`) | Admin WE | Support edit | Website Editing (admin) |
| Performer ContentEditForkCard | Edit manually / Review all | Bridge URL string → bridge resolve + **`openWebsiteEditing`** | WE `section=shows` (+ itemId) | Content | Website Editing |
| Public store (owner) | Edit website | Performer intent deep-link → **`openWebsiteEditing`** | Store-scoped WE | Content | Website Editing |
| Website / Store preview toolbar | Edit website / Edit store → **Style & preview** | `resolveCommittedStoreWebsiteEditorTarget` (unchanged) | Presentation | Presentation | Style & preview |
| Create-store / QuickStart / missions | Resume / Open Draft Review | `buildDraftReviewUrl` | Exact lineage `/app/store/draft|temp/review` | Creation recovery | **Legacy restore only** |
| StoreReviewPage internal | Continue / restore | `buildDraftReviewUrl` | Exact lineage | Recovery | Legacy restore |
| Manual Store Editor (Performer Manual) | Manual Store Editor | `resolveCommittedStoreWebsiteEditorTarget` | Preview editor host | Manual presentation path | Style & preview (unchanged product) |
| OwnerProfileSection | Manage on store page | Raw `/review?mode=draft` | Draft review without WE flags | Profile manage | **Deferred** (not website content rail; not rewired this phase) |
| Onboarding WelcomeCreateStore | Continue setup | Direct review URL | Create flow | Creation | Legacy create |

### Classification rules applied

- Label containing “edit” alone does **not** force Website Editing (e.g. Style & preview, inventory Adjust listing, create-store resume).
- Known Business/store content edit → `openWebsiteEditing` only.
- Exact `draftId + generationRunId` restore remains for create-store / interrupted generation only.

---

## B. Shared helper contract

**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/websiteEditing/openWebsiteEditing.ts`

```ts
openWebsiteEditing({
  storeId?, draftId?, section?, itemId?, returnTo?,
  entrySource?, entry?: 'owner' | 'admin',
  navigate, onError?
})
```

**Behaviour:**

1. Calls existing `resolveWebsiteEditingTarget` (no new server resolver).
2. Navigates only after successful resolve.
3. Preserves safe `section` / `itemId` / `returnTo`.
4. Attaches privacy-safe `weSource` via `buildWebsiteEditingReviewUrl` (`entrySource`).
5. Toasts on failure; never wrong-store fallback; never publish; never `buildDraftReviewUrl`.
6. Dedupes concurrent identical in-flight calls.
7. Refuses destination `/app/store/draft/review` if accidentally returned.

`catalog` added to allowed sections; `weSource` allow-list: `my_stores | catalog | store_overview | performer | shows | admin | preview | other`.

---

## C. CatalogPage behaviour

- **Edit catalog** → `openWebsiteEditing({ section: 'catalog', entrySource: 'catalog' })`.
- **Edit item** → same with `itemId`.
- **Style & preview** → `resolveCommittedStoreWebsiteEditorTarget` (no wrong-store navigate; unavailable toast when fallback).
- **Adjust listing** → existing `InventoryQuickEditPanel` (operational inventory patch on CatalogPage; distinct from Website Editing).
- Removed: Quick edit, Store Edit, and known-store `buildDraftReviewUrl` usage.

---

## D–G. Boundaries

| Boundary | Status |
| -------- | ------ |
| Overview / admin / public owner Edit website | Shared helper |
| Performer bridge Edit manually / Review all | Bridge resolve retained; navigation via helper |
| Create-store exact lineage | Preserved (`buildDraftReviewUrl`, StoreReviewPage comments) |
| Style & preview product | Unchanged resolver; labels standardized |
| Publish / Republish | Untouched |

---

## H. Entry-source diagnostics

Query param `weSource` on Website Editing URLs. Does not affect auth.

---

## I. UI language (EN + VI)

`dashboard` namespace keys: `catalogPage.*`; My Stores Phase A keys retained. Avoided Quick edit / Store Edit / Draft Review in owner-facing Catalog/Overview copy.

---

## J. Tests

| Suite | Result |
| ----- | ------ |
| `openWebsiteEditing.test.ts` | 4 passed |
| `websiteEditingPhase0.test.ts` | 8 passed |
| `MyStoresPage.test.tsx` | 4 passed |
| `myStoresPage.i18n.test.ts` | 4 passed |
| `CatalogPage.test.tsx` | 5 passed |
| **Total** | **25/25** |

Contract coverage: shared helper → `resolveWebsiteEditingTarget`; store-scoped URL; no `generationRunId` required; no navigate on failure; no legacy draft restore destination; Catalog labels; `section=catalog` / `itemId`; Style & preview uses committed resolver.

---

## K. Browser verification

Local Core `:3001` and Dashboard `:5191` were used with a disposable owner fixture (gitignored under `apps/core/cardbey-core/tmp/phase3-browser-evidence/`).

**Playwright:** `tests/e2e/phase-b-website-editing-entry.spec.ts` via `playwright.phase-b.config.ts` — **passed**.

| Check | Result |
| ----- | ------ |
| B1 My Stores four-action after hard refresh | Pass |
| B2 Edit website → store-scoped `websiteEditing=1` (not `/draft/review`) | Pass |
| B3 Catalog Edit catalog → `section=catalog` | Pass |
| B4 Catalog Style & preview (not lineage restore) | Pass |
| B5 Overview Edit website (or skip if onboarding incomplete) | Pass |
| B6 Invalid exact-lineage restore still guarded | Pass |

Sanitised evidence: `tmp/phase3-browser-evidence/phase-b-browser-results.json` + `phase-b-screenshots/` (no live BB Flowers data; disposable emails only).

---

## L. Deferred

- Full Style & preview convergence into Draft Review (explicitly out of Phase B).
- OwnerProfileSection raw review link rewire.
- Broader CatalogPage redesign.
- Mission/QuickStart create-store URLs (legitimate recovery consumers).

---

## M. Remaining legitimate legacy restore consumers

- `buildDraftReviewUrl` callers: create-store / QuickStart / Performer mission integration / StoreDraftReview internal / ExecutionDrawer / StoreReviewPage lineage restore.
- Guarded failure page for invalid exact lineage remains.

---

## N. Risk / smallest safe patch

| What could break | Why | Impact | Mitigation |
| ---------------- | --- | ------ | ---------- |
| Catalog users expecting Quick edit → lineage restore | Intentional removal of wrong path | Catalog CTAs | New Edit catalog → WE |
| Concurrent double-click | Dedupe shares one navigate | UX | Intentional |
| Performer Edit manually | Extra client resolve after bridge | Bridge flag-gated | Bridge still gates; helper navigates |

---

## Staging note

Stage **only** Phase B paths listed in the commit; leave unrelated dirty trees (live market, BI, etc.) unstaged.
