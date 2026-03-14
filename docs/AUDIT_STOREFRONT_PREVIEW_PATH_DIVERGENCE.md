# Audit: Legacy vs New Storefront Preview Path Divergence

## Summary

**Finding: There are no duplicate storefront preview implementations in the codebase.** A single component, **StorePreviewPage**, serves `/preview/store/:storeId` (and `/preview/:draftId`). The owner banner and dedicated preview behavior are implemented in that same component and in **StorefrontHeader** (via **MarketingLayout**). The production vs localhost divergence is most likely due to **(1) base path** or **(2) deploy lag**, not a legacy renderer.

---

## 1. Routes and components involved

| Path / usage | Component | Layout / header | Owner banner |
|--------------|-----------|-----------------|--------------|
| `/preview/store/:storeId` (any query, e.g. `?view=public`) | **StorePreviewPage** | MarketingLayout → StorefrontHeader | Yes, when `ownerControlsVisible` (path + auth) |
| `/preview/:draftId` (legacy draft preview) | **StorePreviewPage** (same) | Same | Same logic |
| `/s/:slug` (public store by slug) | **PublicStorePage** | FullScreenBackgroundLayout + StorefrontHeader | No (no ownerControls/showOwnerBanner passed) |
| Draft/review (editor) | StoreDraftReview / StoreReviewPage | App shell | N/A (editor) |
| Published store (post-publish redirect) | StorePreviewPage with `?view=public&postPublish=1` | Same | Yes when authenticated |

**Single canonical preview route:** `/preview/store/:storeId` → **StorePreviewPage** only. There is no separate “legacy public preview” route or component for that URL.

---

## 2. Components that render hero, nav, layout, banner, CTA

| Element | Where rendered |
|---------|----------------|
| **Store hero/header** | StorePreviewPage (hero block when `isMinimalPublicView`), MarketingLayout → StorefrontHeader (store name + logo). |
| **Category nav** | StorePreviewPage (CategoryNav / breadcrumb when `useV2Grid`; category pills). |
| **Layout toggle** | StorePreviewPage (`showViewToggle`, list/grid). |
| **Owner banner** | StorefrontHeader (strip “Previewing your store” + Edit + Dashboard when `showOwnerBanner && ownerControls?.visible`). |
| **Edit / Dashboard CTA** | StorefrontHeader (dropdown “Edit store” / “Return to editing”, banner buttons). |

All of the above for **preview** are in the **StorePreviewPage → MarketingLayout → StorefrontHeader** tree. **PublicStorePage** (`/s/:slug`) uses StorefrontHeader **without** `ownerControls` or `showOwnerBanner`, so it never shows the owner strip.

---

## 3. Render branches (no duplicate implementations)

- **StorePreviewPage** has one implementation with:
  - **viewPublic / isMinimalPublicView:** from `?view=public` or `postPublish=1`; drives consumer-only UI (no “Continue Setup”, hide Cardbey logo, stable grid).
  - **useV2Grid:** `isMinimalPublicView` (always stable ProductGrid + ProductGrid for public).
  - **ownerControlsVisible:** `!isEmbedded && location.pathname.startsWith('/preview/store') && (canEditThisStore || !!storeIdFromUrl)`.
  - **storefrontShowOwnerBanner:** `ownerControlsVisible`.

There is **no** separate “legacy public preview” renderer; no second component tree for `/preview/store/:storeId`. The “older” look on production is explained by **path or auth not matching** (see below), not by a different page.

---

## 4. Which tree is used for localhost vs production (same URL)

- **Intended for both:** `GET /preview/store/:storeId?view=public` is handled by the **same** app and **same** component: **StorePreviewPage**.
- **Localhost:** Typically run at root (e.g. `http://localhost:5174/preview/store/xxx`). So `location.pathname` is `/preview/store/xxx` → `pathname.startsWith('/preview/store')` is **true** → owner banner can show when authenticated.
- **Production:** If the SPA is served under a **base path** (e.g. `https://example.com/app/` and the document is at `/app/index.html` but the **router basename** is not set), then the browser’s `location.pathname` can be `/app/preview/store/xxx`. Then `pathname.startsWith('/preview/store')` is **false** → **ownerControlsVisible** and **storefrontShowOwnerBanner** are false → **no owner banner**, and the page can look like the “older” public-only storefront (no edit/dashboard strip).

So:

- **Localhost:** Uses **StorePreviewPage** with pathname `/preview/store/...` → owner logic runs → banner and newer behavior.
- **Production (with base path):** Uses **StorePreviewPage** with pathname `/app/preview/store/...` (or similar) → owner logic is skipped → no banner, “older” look.

---

## 5. Is the old public preview path still active / bypassing the new shell?

- **No.** There is only one path for `/preview/store/:storeId`: **StorePreviewPage**. Nothing “bypasses” the owner preview shell; the same shell is used, but **owner visibility is gated on `pathname.startsWith('/preview/store')`**, which fails when pathname includes a base path.

---

## 6. Was the owner banner only in the “new” renderer and never in the “legacy” one?

- There is **no** separate legacy preview renderer. The owner banner lives in **StorefrontHeader** and is passed from **StorePreviewPage** via **MarketingLayout** (`showOwnerBanner`, `ownerControls`). It is shown only when:
  - `ownerControlsVisible` is true, which requires `location.pathname.startsWith('/preview/store')` (and not embedded, and authenticated or storeId in URL).
- So the banner is **not** “only in a different app”; it’s in the same app and same component, but **path checks** prevent it from showing when the pathname is not exactly `/preview/store/...` (e.g. when a base path is present).

---

## 7. Root cause

- **Primary:** **Pathname check is not base-path-safe.** All checks use `location.pathname.startsWith('/preview/store')`. If production serves the SPA under a base path (e.g. `/app`) and the router does not strip it, pathname becomes `/app/preview/store/xxx`, so the condition fails and the owner banner (and related behavior) never show.
- **Secondary:** Possible **deploy lag** (production running an older build without the owner banner at all). Less likely if the same codebase is deployed and the only difference is env (localhost vs production).

---

## 8. Minimal diff fix (base-path-safe preview detection)

- **Goal:** Treat “preview store” the same whether the app is at root or under a base path (e.g. `/app/preview/store/xxx`).
- **Approach:** Use a single helper that returns true when the current path represents the preview store route, and use it for:
  - `ownerControlsVisible`
  - `showBackToEdit`
  - `storeIdFromUrl` fallback from pathname
  - Any other logic that currently uses `pathname.startsWith('/preview/store')`.

**Option A (recommended):** Use **pathname includes** so any path containing `/preview/store/` is treated as preview store:

- Replace `location.pathname.startsWith('/preview/store')` with `location.pathname.includes('/preview/store/')` everywhere in **StorePreviewPage** that is used for owner visibility and storeId extraction.
- For extracting **storeId** from pathname when params are missing, use a regex that allows a prefix: e.g. `pathname.match(/\/preview\/store\/([^/]+)/)` and use the first capture group.

**Option B:** If the app uses React Router with a known `basename`, derive a “logical” pathname by stripping `basename` from `location.pathname`, then use `logicalPathname.startsWith('/preview/store')`. This requires a single place (e.g. a hook or router config) that exposes the basename.

**Recommendation:** Apply **Option A** in **StorePreviewPage** (and any shared helper it uses) so production shows the owner banner and edit/dashboard actions regardless of base path. No new routes or duplicate implementations.

---

## 9. Exact duplicate paths / components (none)

- **Duplicate paths:** None. `/preview/store/:storeId` is served only by **StorePreviewPage**.
- **Duplicate components:** None. There is no “legacy” storefront preview component for that URL; **PublicStorePage** is only for `/s/:slug`.

---

## 10. Which one production vs localhost use

| Environment | URL | Component | Why banner shows or not |
|-------------|-----|-----------|--------------------------|
| **Localhost** | `/preview/store/:storeId?view=public` | StorePreviewPage | pathname = `/preview/store/...` → owner logic on → banner when authenticated. |
| **Production (no base path)** | Same | StorePreviewPage | Same as localhost. |
| **Production (with base path)** | Same (full URL e.g. `/app/preview/store/...`) | StorePreviewPage | pathname = `/app/preview/store/...` → `startsWith('/preview/store')` false → owner logic off → no banner. |

---

## 11. Follow-up cleanup (optional)

- **Retire “legacy” wording:** Replace comments that refer to “legacy preview” with “preview store path” and document that the only preview store route is `/preview/store/:storeId` (and optionally `/preview/:draftId`).
- **Single “is preview store path” helper:** Add a small helper (e.g. `isPreviewStorePath(pathname: string)` and optionally `getStoreIdFromPreviewPath(pathname: string)`) and use it everywhere instead of ad-hoc `startsWith`/regex. That keeps behavior consistent and base-path-safe in one place.
- **Do not remove:** PublicStorePage (`/s/:slug`) is a different product route (slug-based public store); it is not a duplicate of the preview route.

---

## 12. Minimal diff applied (codebase)

- **`src/lib/nextRoute.ts`:** Added `isPreviewStorePath(pathname)` (true when `pathname.includes('/preview/store/')`) and `getStoreIdFromPreviewPath(pathname)` (regex `\/preview\/store\/([^/]+)`).
- **`src/pages/public/StorePreviewPage.tsx`:** Replaced all `location.pathname.startsWith('/preview/store')` and the pathname regex for `storeIdFromUrl` with the new helpers so owner banner and related logic are base-path-safe.

No new routes or duplicate components; same single canonical preview renderer.

---

## 13. Verification after fix

1. **Localhost:** Open `/preview/store/:storeId?view=public` while signed in → owner banner and “Edit store” / “Open dashboard” visible.
2. **Production (same URL):** If the app is served under a base path, after applying the base-path-safe check, same URL → same banner and actions.
3. **Public visitor:** Signed out, same URL → no account menu, no banner (unchanged).
4. **/s/:slug:** No owner banner (unchanged).
