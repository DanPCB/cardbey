# Frontscreen store reels by category – testing instructions

Use this for PR description or manual QA.

## Prerequisites

- At least one published store per category with `isActive = true` and `type` matching the feed mapping:
  - **Food:** `type` in `restaurant`, `cafe`, `food`, `dining`, `bakery`, `bistro`, `bar`, `coffee`, `kitchen`
  - **Products:** `type` in `retail`, `shop`, `store`, `florist`, `product`, `merchandise`, `general`, `business`
  - **Services:** `type` in `service`, `salon`, `spa`, `clinic`, `office`, `cleaning`, `nail_salon`, `beauty`, `wellness`
- Type is case-sensitive; use lowercase in DB for correct filtering.

## Backend

1. **Category filter**
   - `GET /api/public/stores/feed?limit=10&category=products` → 200, `items` array, only product-type stores.
   - `GET /api/public/stores/feed?limit=10&category=food` → only food-type stores.
   - `GET /api/public/stores/feed?limit=10&category=services` → only service-type stores.
   - `GET /api/public/stores/feed?limit=10` (no category) → all active stores.

2. **Cursor pagination**
   - When there are more than `limit` results, response includes `nextCursor`.
   - `GET /api/public/stores/feed?limit=2&cursor=<nextCursor>` returns the next page.

3. **No Prisma errors**
   - No "unknown field" or missing column errors; feed uses only existing schema fields.

## Frontend (/frontscreen)

1. **Default (store reels)**
   - Open `/frontscreen` (or `/frontscreen?mode=stores`).
   - **Food** tab: store reels for food-type stores only.
   - **Products** tab: store reels for product-type stores only.
   - **Services** tab: store reels for service-type stores only.
   - **Explore** tab: store reels for all stores (no category filter).

2. **Reel UI**
   - Each reel: hero background from store (banner/avatar or gradient fallback), avatar (image or initial), store name, tagline, “Open Store” CTA.
   - Vertical snap scroll; no sidebar.

3. **“Open Store”**
   - Navigates to `/preview/store/:id?view=public` and loads without auth/guest flows.

4. **Slides fallback**
   - Open `/frontscreen?mode=slides`.
   - All tabs (Food, Products, Services, Explore) use the previous slides experience (getFrontscreenSlides + demo fallback, SSE, brand spotlight, slide CTA).

5. **Network**
   - In Network tab, calls go to `/api/public/stores/feed?...&category=food|products|services` (or no category for Explore).
   - No repeated/periodic calls when idle; next page only when scrolling near bottom (IntersectionObserver).

6. **No polling**
   - No `refetchInterval` or timers; feed uses `staleTime`, `refetchOnWindowFocus: false`, and cursor-based load-more only.

## Quick checklist

- [ ] `/frontscreen` → Food tab shows food store reels.
- [ ] Switch to Products / Services → feed refetches with correct `category=` in URL.
- [ ] Explore tab shows all stores (no category in request).
- [ ] “Open Store” on 3 different stores → each opens `/preview/store/:id?view=public`.
- [ ] `/frontscreen?mode=slides` → slide experience unchanged (tabs use slides + demo).
- [ ] No sidebar on frontscreen.
- [ ] No duplicate or periodic feed requests when idle.
