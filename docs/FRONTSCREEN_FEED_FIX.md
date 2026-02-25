# Frontscreen feed fix: published store appears in Explore

## Evidence (diagnosis path A)

- **Endpoint used by /frontscreen?mode=food:**  
  `GET /api/public/stores/feed?limit=10&category=food`  
  (from `getPublicStoresFeed` in `lib/api.ts`, called by `usePublicStoreFeed` in `StoreReelsFeed.jsx`.)

- **Backend:**  
  `GET /stores/feed` in `routes/publicUsers.js` (mounted at `/api/public`).

- **Filters:**  
  - `where.isActive === true`  
  - When `category=food`: `where.type = { in: FEED_CATEGORY_TYPES.food }`  
  (so Business.type must be one of the strings in the `food` array.)

- **Why the store disappeared:**  
  - Publish creates/updates a Business with `type` from the draft (e.g. `"General"` or `"Vietnamese take away shop"`).  
  - Feed only returns rows whose `type` is in the list (e.g. `'restaurant'`, `'cafe'`, `'food'`, …).  
  - `"General"` was only in the **products** list, not **food**.  
  - `"Vietnamese take away shop"` was in **neither** list.  
  So the API was returning an **empty list** (or a list without this store) — **path (A)**.

- **Why /preview/store/:id still worked:**  
  Preview loads a single store by id and does not use the feed filters; it only needs the store to exist and be loadable.

## Changes made (minimal)

1. **Backend – feed category list** (`routes/publicUsers.js`)  
   - Comment: stores visible at `/preview/store/:id` must appear in the feed when `isActive` and `type` match.  
   - Extended `FEED_CATEGORY_TYPES.food` with:  
     `'general'`, `'vietnamese take away shop'`, `'take away'`, `'takeaway'`, `'vietnamese'`, `'banh mi'`, `'pho'`.

2. **Backend – publish** (`services/draftStore/publishDraftService.js`)  
   - When creating or updating the Business, `type` is normalized to lowercase:  
     `String(storeTypeRaw).trim().toLowerCase() || 'general'`.  
   So new publishes get a type that matches the feed’s category lists (which are lowercase).

3. **Frontend – cache** (`StoreDraftReview.tsx`)  
   - On publish success, call  
     `queryClient.invalidateQueries({ queryKey: ['publicStoreFeed'] })`  
   so the frontscreen list refetches and shows the new store without a full page refresh.

## 5-step manual test checklist

1. **Publish a store**  
   - Create a store (e.g. “Vietnamese take away” / food), finish draft, publish.  
   - Confirm “Store published!” and note the store id from the URL (e.g. `/preview/store/<id>?view=public`).

2. **Open Explore**  
   - Go to `/frontscreen?mode=food`.  
   - **Acceptance:** The newly published store appears as a tile (no “No stores yet” if that was the only store).

3. **Store card content**  
   - Check the tile: store name and hero/avatar (or safe fallback) are correct.

4. **Refresh**  
   - Refresh the page on `/frontscreen?mode=food`.  
   - **Acceptance:** The store still appears (not only from cache).

5. **Ownership**  
   - If the frontscreen is “my stores” (filtered by user), confirm the published store is linked to the signed-in user/tenant and appears in that list.
