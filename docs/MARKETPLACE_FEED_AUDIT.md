# Marketplace Feed Diagnostic Audit

**Date:** 2026-06-07  
**Scope:** Evidence-only trace — no fixes applied.  
**Environment:** Local Core `127.0.0.1:3001`, Vite dev `127.0.0.1:5174`.

---

## Executive summary

| Layer | Status | Notes |
|-------|--------|-------|
| Feed API | **PASS** | `200`, `ok: true`, **6 items**, ~55 KB |
| Transformation | **PASS** | No item drops API → artifacts (6 → 6) |
| React state | **PASS** (local) | Query should settle; no timeout on `fetch` |
| Render (`/`) | **PASS** (when `for_you`) | `ArtifactFeed` mounts all cards |
| Render (`/frontscreen`) | **FAIL (gated)** | Marketplace grid hidden until Discover journey |
| Media (Core + Vite) | **PASS** | `/uploads/media/*` returns `200` |
| Virtualization | **N/A on `/`** | Snap scroll only; no windowing |

**First failing layer depends on surface:**

- **`/frontscreen` default:** **Render** — marketplace not mounted without journey selection.
- **`/` with category lane (food/products/services/offers):** **Transformation (filter)** — visible count can drop to 0 while `artifacts` still has 6.
- **Mobile off-primary cards:** **Media policy** — video not mounted; poster/image fallback (looks “partial” not broken).
- **Legacy `/feed`:** **Virtualization** — only ±1 card mounted; scroll shows black placeholders.

---

## Part 1 — Feed API response (live)

### Request

```
GET http://127.0.0.1:3001/api/public/stores/feed?limit=16
GET http://127.0.0.1:5174/api/public/stores/feed?limit=16  (via Vite proxy)
```

### Results

| Field | Value |
|-------|-------|
| HTTP status | `200` |
| `ok` | `true` |
| Response size | ~55,409 bytes |
| `items.length` | **6** |
| `nextCursor` | present (pagination available) |

### Items (store IDs + media)

| # | id | name | type | heroVideo | bannerUrl |
|---|-----|------|------|-----------|-----------|
| 1 | `cmq2dctz0005kjv5oowhhfmv0` | LALA FASHION | Fashion | *(empty)* | Pexels JPEG (external) |
| 2 | `cmq21puoi010ajvyo1mfab6mk` | ABC Fashion | Fashion | `/uploads/media/1780731826592-ca324c51.mp4` | same mp4 |
| 3 | `cmq1yz9510040jvyotypbwwsj` | My Bakery | Food & drink | `/uploads/media/1780839072458-12ea7e9e.mp4` | same mp4 |
| 4 | `cmq07z557009cjv6si5se3eku` | Melbourne Flooring | general | `/uploads/media/1780621427887-e88729ea.mp4` | same mp4 |
| 5 | `cmpyr02jv007hjvhkqux5lr6n` | My Nails | Beauty | `/uploads/media/1780532632286-67b755e0.mp4` | same mp4 |
| 6 | `cmpy0z0px003djvp0xcrsbvqr` | AA Travel and Golf Tour | Sports | `/uploads/media/1780838666052-45fa8641.mp4` | same mp4 |

### API questions

| Question | Answer |
|----------|--------|
| Does API return 200? | **Yes** (Core direct and Vite proxy) |
| Does API return items? | **Yes — 6** |
| Are media URLs present? | **Yes** (5× `/uploads/media/*.mp4`, 1× Pexels image) |
| Are store IDs valid? | **Yes** — non-empty CUIDs |

### Media HEAD checks

| URL | Status | Content-Type |
|-----|--------|--------------|
| `http://127.0.0.1:3001/uploads/media/1780731826592-ca324c51.mp4` | 200 | video/mp4 |
| `http://127.0.0.1:3001/uploads/media/1780751234682-b2172fb3.png` | 200 | image/png |
| `http://127.0.0.1:5174/uploads/media/1780731826592-ca324c51.mp4` | 200 | video/mp4 |

---

## Part 2 — Data flow trace

```
GET /api/public/stores/feed
  ↓ getPublicStoresFeed()          apps/dashboard/.../src/lib/api.ts:1137
  ↓ mapPublicStoreFeedItemFromApi() apps/dashboard/.../src/lib/mapFrontscreenStoreFromApi.ts
  ↓ usePublicStoreFeed (React Query) apps/dashboard/.../src/hooks/usePublicStoreFeed.ts
  ↓ storesToArtifacts()            apps/dashboard/.../src/components/publicfeed/artifacts.ts:363
  ↓ diversifyStoreArtifacts()      (rotate displayKind — no drops)
  ↓ prepareArtifacts()             enrichCategories + enrichMedia + rank
  ↓ usePreparedPublicFeedArtifacts apps/dashboard/.../src/hooks/usePreparedPublicFeedArtifacts.ts
  ↓ PublicFeedShell / ExploreDiscoveryPage
  ↓ filterArtifactsByFeedLane (category) OR Explore tab/search filters
  ↓ ArtifactFeed / ExploreResultCard
  ↓ ArtifactCard → ArtifactMediaSurface
```

### Stage counts (local API, `for_you` lane)

| Stage | Input | Output | Drops |
|-------|-------|--------|-------|
| API `items` | — | **6** | — |
| `mapPublicStoreFeedItemFromApi` | 6 | **6** | 0 |
| `isServicesMode` filter | 6 | **6** | 0 (not services mode) |
| `storesToArtifacts` | 6 | **6** | 0 (`filter(!id)` only) |
| `diversifyStoreArtifacts` | 6 | **6** | 0 |
| `prepareArtifacts` | 6 | **6** | 0 |
| `filterArtifactsByFeedLane(for_you)` | 6 | **6** | 0 |

### Category lane visible counts (estimated from store types)

| Lane | Approx visible | Notes |
|------|----------------|-------|
| `for_you` | **6** | No filter |
| `food` | **1** | My Bakery |
| `products` | **2+** | Fashion stores (+ possible flooring) |
| `services` | **2+** | Beauty, travel, flooring |
| `offers` | **0** | No offer/promo artifacts in feed |
| `others` | **0–1** | Low-confidence only |

### Explore-specific filters (`/frontscreen`)

| Stage | Condition | Effect |
|-------|-----------|--------|
| `activeIntentJourney === null` | Default landing | **Marketplace not rendered at all** |
| `journey === 'discover'` | User selects Discover | Full marketplace grid shown |
| `filterByTab('products')` | Products tab | Subset via `filterArtifactsByFeedLane` |
| `filterByTab('offers')` | Offers tab | Often **0** with current data |
| `categoryHint` (e.g. `?mode=food`) | URL param | Further narrows list |
| `locationQuery` | User input | Client filter by `locationLabel` |
| `searchQuery` | User input | `matchesSearch` or unified marketplace |

### Swallowed exceptions

- `getPublicStoresFeed`: non-JSON body → `{ ok: false, items: [], nextCursor: null }` (no throw until `!res.ok`).
- Query failure after `retry: 1` → `usingMock` swaps **MOCK_FEED_ARTIFACTS** (skeleton exits, mock cards show).

### Existing dev instrumentation (no new `[FEED_AUDIT]` logs added)

| Tag | Location |
|-----|----------|
| `[usePublicStoreFeed]` | `usePublicStoreFeed.ts:58` (DEV or `cardbey.debug`) |
| `[public-video-chain]` | `publicVideoChainTrace.ts` — feed_api_item, artifact_mapped, render |
| `[FeedMedia]` / `[FeedArtifactMedia]` | `feedMediaDiagnostics.ts`, `ArtifactMediaSurface.tsx` |

---

## Part 3 — Feed render audit

### Surfaces

| Route | Component | Feed hook | Renders cards when |
|-------|-----------|-----------|-------------------|
| `/` | `PublicHomeFeed` → `PublicFeedShell` → `ArtifactFeed` | `usePreparedPublicFeedArtifacts` | `artifacts.length > 0` && not `showLoadingOnly` |
| `/frontscreen` | `ExploreDiscoveryPage` | same hook | **Only inside `ExploreJourneyPanel` when `journey === 'discover'`** |
| `/feed`, `/card/:slug` | `PublicFeedPage` | `useQuery(['publicStores'])` | `/api/public/stores` (different endpoint) |
| `/frontscreen/stores` | Redirect → `/frontscreen?tab=products` | — | — |

### Skeleton / empty logic (`ArtifactFeed.tsx`)

```ts
showEmpty = !loading && artifacts.length === 0
showLoadingOnly = loading && artifacts.length === 0
```

- **Full skeleton:** `isLoading && artifacts.length === 0`
- **Trailing skeleton:** `loading && artifacts.length > 0` (extra slide at bottom)
- **Empty state:** loaded + zero **visible** artifacts (category filter)

### Virtualization

- **`ArtifactFeed`:** All slides in DOM; `IntersectionObserver` for active item + load-more sentinel only.
- **`PublicFeedPage`:** `VISIBLE_WINDOW = 3` — off-window cards render **empty `<section>`** (black screen while scrolling).

---

## Part 4 — Media audit

### Resolution chain

```
API relative /uploads/...
  → mapHeroFields / applyResolvedMediaToStoreItem
  → resolveCoreMediaUrl()  (apps/dashboard/.../src/lib/resolveCoreMediaUrl.ts)
  → ArtifactMediaSurface
```

### Dev localhost:5174 behavior

- API: relative `/api/...` (Vite proxy) ✓
- Uploads: relative `/uploads/...` when `shouldUseSameOriginUploadsProxy` ✓
- **Bad pattern:** `http://localhost:5174/uploads/...` on LAN mobile — fixed in `resolveCoreMediaUrl.ts` (PWA stabilization commit)

### Mobile video mount policy (`feedVideoMountPolicy.ts`)

- `shouldMountFeedVideo`: **mobile + non-primary → no `<video>`**
- `shouldShowVideoFallback`: shows poster/image instead
- Primary card only autoplays video

### badVideoRegistry

- Session-scoped bad URLs → skip video, show fallback
- Can make feed look “static” after prior failures

### Media load success rate (local HEAD)

| Class | Success |
|-------|---------|
| Core `/uploads/media/*.mp4` | **100%** (sampled) |
| Vite proxy `/uploads/*` | **100%** |
| Pexels external image | Not HEAD-tested; URL is valid HTTPS JPEG |

---

## Part 5 — Skeleton root cause analysis

| Symptom | Likely cause | Code path |
|---------|--------------|-----------|
| Full-screen pulse skeleton on `/` | `isLoading && artifacts.length === 0` | `ArtifactFeed.tsx:209,254-257` |
| Skeleton never clears | Fetch hang (no `AbortSignal` timeout) or Core unreachable without fast fail | `api.ts:1167`, `vite.config.js` proxy `timeout: 0` |
| Spinner on Explore marketplace | `marketplaceLoading={isLoading}` | `ExploreDiscoveryPage.tsx:389`, `ExploreJourneyPanel.tsx:161-165` |
| “Empty” after load (not skeleton) | Category/tab filter zeroed visible list | `PublicFeedShell.tsx:114-116`, `ExploreDiscoveryPage.tsx:158-165` |
| Trailing skeleton with cards visible | `loading && artifacts.length > 0` | `ArtifactFeed.tsx:270-273` |
| Black scroll gaps on `/feed` | Virtualization placeholders | `PublicFeedPage.tsx:164-173` |

**Query error path:** failure → `isLoading: false`, `realArtifacts: []`, `usingMock: true` → mock cards (not infinite skeleton).

---

## Part 6 — React state audit

| Hook | Query key | `isLoading` source | Notes |
|------|-----------|-------------------|-------|
| `usePublicStoreFeed` | `['publicStoreFeed', category, pageSize]` | `useInfiniteQuery` | `staleTime: 4min`, `retry: 1` |
| `usePreparedPublicFeedArtifacts` | wraps above | passes through | `usingMock` when loaded + empty |

**Race / stale state risks:**

- `PublicFeedShell` remounts `ArtifactFeed` on category change (`key={category}`) — scroll resets, not data loss.
- Explore search auto-sets `activeIntentJourney` from `unifiedResults.suggestedJourney` — can reveal/hide marketplace panel.

---

## Part 7 — Browser verification checklist

When reproducing in DevTools:

### Network

- [ ] `/api/public/stores/feed` → 200, `items.length >= 1`
- [ ] `/uploads/media/*` → 200, correct `Content-Type`
- [ ] On LAN: confirm media URLs use **Core host** (e.g. `192.168.x.x:3001`), not dashboard origin for `/uploads`

### Console (DEV)

- [ ] `[usePublicStoreFeed] { rawCount, afterFilter }`
- [ ] `[public-video-chain] feed_api_item` / `artifact_mapped` / `render`
- [ ] `[FeedMedia] mount` / `video_error` / `FeedVideo` fallback logs
- [ ] No uncaught React errors in `ArtifactFeed` / `ArtifactMediaSurface`

---

## Deliverables

| # | Metric | Value |
|---|--------|-------|
| 1 | Feed API status | **200 OK** |
| 2 | Feed item count (API) | **6** |
| 3 | Feed render count (`/` for_you) | **6** (when query settled) |
| 4 | Media load success rate (local) | **100%** on sampled `/uploads` |
| 5 | Skeleton root cause | **`isLoading && artifacts.length === 0`**; Explore uses spinner; filters cause **empty** not skeleton |
| 6 | First failing layer | **Render** on `/frontscreen` default; **Filter** on category lanes; **Media policy** on mobile non-primary |
| 7 | Exact blockage paths | See below |

### Primary blockage code paths

1. **Explore marketplace hidden (default `/frontscreen`)**  
   `ExploreDiscoveryPage.tsx:374-397` — `ExploreJourneyPanel` only when `activeIntentJourney !== null`.  
   `ExploreJourneyPanel.tsx:83` — `showFullMarketplace = journey === 'discover'`.

2. **Category empty (homepage lanes)**  
   `PublicFeedShell.tsx:114-116` → `filterArtifactsByFeedLane` → `ArtifactFeed.tsx:250-253` `EmptyState`.

3. **Mobile video appears “stuck” on poster**  
   `feedVideoMountPolicy.ts:16` — `if (isMobile && !isPrimary) return false`.

4. **Legacy feed black gaps**  
   `PublicFeedPage.tsx:164-173` — empty sections outside visible window.

5. **Potential infinite loading (edge)**  
   `api.ts:1167` — `fetch()` without timeout; hung TCP keeps `isLoading` true.

---

## Recommended next steps (after user confirms)

1. Reproduce on target device (LAN mobile vs localhost) with DevTools console tags above.
2. Confirm which URL user calls “Marketplace” (`/` vs `/frontscreen` vs `/feed`).
3. If `/frontscreen`: decide whether marketplace should render on default landing without journey selection.
4. If skeleton persists: add fetch timeout + log `[FEED_AUDIT]` at each pipeline stage.
5. If category lanes feel “broken”: show empty-copy vs skeleton distinction in UI.

**No code changes were made in this audit.**
