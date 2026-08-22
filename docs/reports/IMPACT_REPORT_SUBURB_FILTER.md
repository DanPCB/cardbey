# Impact Report — Suburb Filter on PublicFeed (Prompt 1)

**Date:** 2026-08-22  
**Risk:** LOW  
**Scope:** Read-only browse filter; no schema change; no writes.

---

## 1. Current state

| Item | Finding |
|------|---------|
| **Suburb field** | `Business.suburb` (`String?`) in Prisma — Postgres + SQLite schemas |
| **Public feed API** | `GET /api/public/stores/feed` (not `GET /api/stores`) — paginated, supports `category` |
| **Public feed UI** | `PublicHomeFeed` at `/` → `PublicFeedShell` + `usePreparedPublicFeedArtifacts` |
| **Suburb on DTO** | Mapped via `publicStoreMapper.js`; feed artifacts resolve city/suburb in `artifacts.ts` |
| **Existing filters** | Category lanes (`food`, `products`, `services`) server-side; offers/others client-side |

Suburb is populated when stores are created, enriched, or claimed (e.g. `stores.js` PATCH, import-from-social). Coverage depends on enrichment quality — many stores may have `suburb` null until location enrichment runs.

**Note:** Prompt doc references `/discover?suburb=`; canonical marketplace route is **`/?suburb=`** (home feed). Explore lives at `/frontscreen`.

---

## 2. Proposed change

Add a horizontally scrollable **suburb filter pill row** above category tabs on PublicFeed V2. Selecting a suburb narrows the feed to published stores in that suburb. "All" clears the filter.

---

## 3. API change

### `GET /api/public/stores/feed`

New optional query param:

- `suburb` — case-insensitive exact match on `Business.suburb` (via existing `caseInsensitiveFilter` for SQLite/Postgres parity)

### `GET /api/public/stores/suburbs` (new)

Returns distinct suburbs with published-store counts:

```json
{ "ok": true, "suburbs": [{ "suburb": "Braybrook", "count": 23 }] }
```

- Only suburbs with ≥ 1 eligible public feed store
- Sorted by count descending
- Optional future: `category` param (Prompt 2) for scoped counts

Route registered **before** `/stores/:slug` to avoid slug collision.

---

## 4. Frontend change

| File | Change |
|------|--------|
| `SuburbFilterPills.tsx` | New pill row component |
| `PublicFeedShell.tsx` | Render pills above category row (mobile + desktop band) |
| `PublicHomeFeed.tsx` | Sync `suburb` with URL search params |
| `usePublicStoreFeed.ts` | Pass `suburb` to feed API |
| `usePreparedPublicFeedArtifacts.ts` | Accept `suburb` option |
| `lib/api.ts` | `getPublicStoreSuburbs`, extend `getPublicStoresFeed` |
| `ArtifactFeed.tsx` | Suburb-specific empty state copy |

URL: `/?suburb=Braybrook` (shareable).

---

## 5. Risk assessment

| Risk | Mitigation |
|------|------------|
| Empty pill row when few suburbs populated | Hide row when `< 2` suburbs returned |
| SQLite vs Postgres case sensitivity | Use `caseInsensitiveFilter` (existing helper) |
| Pagination + suburb filter | Apply suburb in Prisma `where` before cursor pagination |
| Route shadowing `/stores/suburbs` vs slug | Static route before `:slug` |
| Guest/test stores in counts | Reuse `isPublicFeedEligibleBusiness` |

**What could break:** Feed pagination cursors could shift when suburb filter applied mid-session (expected). Category + suburb combined may return sparse pages (acceptable).

**Impact scope:** Public home feed (`/`) only; no owner dashboards, claims, or publish flows.

**Smallest safe patch:** Optional query param + new read-only suburbs endpoint + UI pills wired to existing feed hook — no schema, no enrichment changes.

---

## 6. Verification checklist

- [ ] `GET /api/public/stores/feed?suburb=Braybrook` returns only matching stores
- [ ] `GET /api/public/stores/suburbs` returns correct counts
- [ ] Pill row renders with names and counts
- [ ] Selecting a pill filters feed; "All" clears
- [ ] URL updates (`/?suburb=…`)
- [ ] Empty state: "No stores in [suburb] yet"
- [ ] Mobile horizontal scroll without wrap
- [ ] Existing `publicStoresFeed.test.js` passes
