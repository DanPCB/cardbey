# Frontscreen "No stores yet" fix

## Evidence (contract)

**1) Store-list request for /frontscreen**

- **URL:** `GET /api/public/stores/feed?limit=10&category=food` (when `mode=food`).
- **Params:** `limit` (1–50), `cursor` (opaque, for pagination), `category` (`food` | `products` | `services`).
- **Response shape:** `{ ok: true, items: PublicStore[], nextCursor: string | null }`.  
  Each item: `{ id, name, slug, description?, tagline?, avatarUrl?, bannerUrl? }` (from `toPublicStore(b)`).

**2) MY STORES request**

- **URL:** `GET /api/auth/me` (Bearer token).
- **Response:** `{ ok: true, user: { ..., stores: Business[] } }`.  
  Stores = user’s businesses (1:1 via `Business.userId`). No category filter.

**3) Root cause**

- **Category A — Backend filter mismatch.**  
  Frontscreen feed uses `where = { isActive: true, type: { in: FEED_CATEGORY_TYPES[category] } }`.  
  If `Business.type` is stored with different casing (e.g. `"Vietnamese take away shop"`) or a value not in the list, the store is excluded. MY STORES has no type filter, so the same stores can appear there but not in the feed.

## Contract (documented in code)

- **Option in use:** **PUBLIC Explore** — frontscreen shows all public published stores that match the selected category (food/products/services). No auth; not limited to “my” stores. MY STORES is separate (GET /api/auth/me, user-scoped).

## Minimal patch applied

**Backend (publicUsers.js)**

1. Documented the contract (comment above `FEED_CATEGORY_TYPES`): PUBLIC Explore, not MY Explore.
2. Relaxed type filter for frontscreen:
   - Included common case variants so existing DB values match (SQLite is case-sensitive): e.g. `'Vietnamese take away shop'`, `'Vietnamese Take Away Shop'` in the `food` list.
   - Added a few more food-related types: `'eatery'`, `'fast food'`, `'fast food restaurant'`.

No change to publish (isActive/publishedAt/type normalization already in place). No frontend parsing changes (response uses `items` and is consumed correctly).

**Frontend (usePublicStoreFeed.ts)**

- Dev-only diagnostic: when `import.meta.env.DEV` or `localStorage.cardbey.debug === 'true'`, log `{ mode, rawCount, filtersUsed }` after each feed response.

**Query key / cache**

- Query key already includes mode: `['publicStoreFeed', category ?? 'all', pageSize]`. Switching mode refetches. Publish already invalidates `['publicStoreFeed']` in StoreDraftReview.

## Manual test checklist

1. **Visit /frontscreen?mode=food**  
   - The 2 stores (or your food stores) appear as cards.  
   - In DevTools → Network: `GET /api/public/stores/feed?limit=10&category=food` returns `items` with those stores.

2. **Reload page**  
   - Same; stores still appear.

3. **Switch mode**  
   - Change to Products or Services (Explore dropdown or URL).  
   - Results change (food vs products vs services).  
   - In DevTools → Network, `category` param matches the selected mode.

4. **No cross-account leakage**  
   - Feed is public (no auth); it shows all active stores matching the category, not “my” stores only.  
   - MY STORES (header) remains from GET /api/auth/me and is user-scoped.

5. **Optional: dev diagnostic**  
   - Set `localStorage.setItem('cardbey.debug', 'true')`, open /frontscreen?mode=food, check console for `[usePublicStoreFeed] { mode: 'food', rawCount: N, filtersUsed: '...' }`.
