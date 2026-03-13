# Impact Report: business-generic.svg Repeated Requests Fix

## Summary

Production was sending repeated GET requests for `/placeholders/business-generic.svg`. The response was **HTML** (SPA fallback) instead of an image, so the browser kept retrying and the `onError` handler re-set the same URL, causing a loop.

## Root Cause

1. **Missing asset**  
   The path `/placeholders/business-generic.svg` was referenced in `ProductReviewCard.tsx` (and docs) but the file did **not** exist under `public/placeholders/` in the dashboard. So it was never deployed.

2. **SPA fallback**  
   For unknown paths, the production server (e.g. Render) serves `index.html` (Content-Type: `text/html`). So a GET to `/placeholders/business-generic.svg` returned HTML.

3. **Service worker caching**  
   The SW caches every same-origin 200 response. So the first request for the “image” got 200 + HTML, and the SW cached that. Later requests could be served from cache, still as HTML.

4. **onError loop**  
   When the image failed (HTML not valid as image), `onError` set `img.src = '/placeholders/business-generic.svg'` again. That triggered another load → same HTML → `onError` again → repeated requests.

## Fixes Applied

### 1. Add the placeholder asset

- **File:** `apps/dashboard/cardbey-marketing-dashboard/public/placeholders/business-generic.svg` (new)
- Minimal SVG (storefront icon) so the path resolves to a real image. Vite copies `public/` into `dist/` at build time, so the deployed app serves `/placeholders/business-generic.svg` with correct `Content-Type` (image/svg+xml from server or SW).

### 2. Service worker: do not cache HTML as image

- **File:** `apps/dashboard/cardbey-marketing-dashboard/public/sw.js`
- Before caching a 200 response, the SW now:
  - Treats a request as image/svg if `request.destination === 'image'` or URL path matches `\.(svg|png|jpg|jpeg|gif|webp|ico)(\?|$)`.
  - If the response `Content-Type` is `text/html` and the request is for an image/svg, the SW **does not** cache that response.
- So SPA fallback HTML is never stored as the “image” for that URL.

### 3. ProductReviewCard: stop onError loop

- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductReviewCard.tsx`
- In the image `onError` handler we only set `src` to the placeholder if the current `img.src` path is **not** already `/placeholders/business-generic.svg`.
- If the placeholder URL itself returns HTML/404, we do not set the same URL again, so no repeated requests.

### 4. Service worker bypass for /placeholders/

- **File:** `apps/dashboard/cardbey-marketing-dashboard/public/sw.js`
- Requests whose path starts with `/placeholders/` bypass the SW entirely (early return, no `event.respondWith()`). The browser fetches them normally.
- Placeholders are static, small, and rarely change, so SW caching adds little benefit and more risk (e.g. wrong content-type cached).

### 5. Content-type hardening in onError

- **File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductReviewCard.tsx`
- Before setting the placeholder in `onError`, we only run the fallback when the failed request URL path ends with `.svg` or `.png`. If the failing URL doesn’t look like an image, we don’t set the placeholder (guard against CDN/hosting returning wrong content-type later).

## Modified Files

| File | Change |
|------|--------|
| `apps/dashboard/cardbey-marketing-dashboard/public/placeholders/business-generic.svg` | **New** – placeholder SVG asset |
| `apps/dashboard/cardbey-marketing-dashboard/public/sw.js` | Do not cache `text/html` for image/svg requests; bypass SW entirely for `/placeholders/` |
| `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/ProductReviewCard.tsx` | onError: set placeholder only when current path ≠ placeholder and path ends with `.svg`/`.png`; prevents loop |

## Manual Verification (Production)

1. **Deploy** the dashboard (build includes `public/placeholders/business-generic.svg` and updated `sw.js`).
2. **Hard refresh** or unregister the old service worker so the new SW is used.
3. Open the **store draft review** page with product cards (some with missing/broken images so the placeholder is used).
4. In DevTools **Network** tab:
   - Filter by “Img” or by `business-generic.svg`.
   - Confirm **one** (or few) request(s) per card that needs the placeholder, not dozens.
   - Confirm response **Type** is `svg` (or image) and **Content-Type** is `image/svg+xml` (not `text/html`).
5. If the SW had previously cached HTML for this URL: clear site data or use “Update on reload” and reload until the new SW is active, then re-check step 4.

## Risk / Invariants

- **App routing:** Unchanged. No route or navigation logic modified.
- **Other placeholders:** Only `business-generic.svg` was added; no other assets or paths changed.
- **SW:** Only caching rules were tightened (no cache when HTML is returned for an image request). Navigate fallback and offline behavior unchanged.
- **ProductReviewCard:** Only the `onError` branch was made conditional; `resolvedImageUrl` and normal image display are unchanged.
