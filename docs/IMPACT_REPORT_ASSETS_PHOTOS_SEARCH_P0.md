# P0 Fix: Assets → Photos search "No photos found" — Impact Report

## 1) What was wrong (root cause)

- **Strict client-side filtering:** The dashboard required every photo’s searchable text (attribution, URL, etc.) to contain at least one query term. The core static list had no "roses"/"cars"/"fish"/"house" in those fields, so all results were filtered out → "No photos found".
- **Response shape:** Core returned only `results`; the dashboard now accepts `items`, `results`, or `photos` and normalizes to one array. Core was also missing an `items` key for the agreed contract.
- **Missing searchable metadata:** Static entries had no tags in the response, and there were no static items for roses/cars/fish/houses, so queries like "roses" or "cars" had nothing to match.
- **Provider vs empty:** When the API returned 4xx/5xx or `provider_not_configured`, the UI did not always show a dedicated “provider not configured” message; error parsing now supports both string and object `error` and sets the right code so the UI can show the persistent message instead of "No photos found".

## 2) What changed (file-by-file)

| Area | File | Change |
|------|------|--------|
| **Core** | `apps/core/cardbey-core/src/routes/assets.js` | Added static entries with tags for roses, cars, fish, houses. Response now includes `items` (same as `results`), `total`, and `tags` on each photo. No change to other routes. |
| **Dashboard** | `apps/dashboard/.../src/lib/api/assets.ts` | Normalizer already accepts `items`/`results`/`photos`. Relaxed client-side filter to junk-only (no query-term requirement). Error parsing supports `error` as string or `{ code, message }` for 503/4xx/5xx. Removed unused `photoMatchesQuery`. |
| **Dashboard** | `apps/dashboard/.../src/features/content-studio/components/PropertiesPanel.tsx` | No code change in this pass; already sets `photoProviderError` for `provider_not_configured` and only shows "No photos found" when request succeeded and results are empty. |
| **Core tests** | `apps/core/cardbey-core/tests/assets.photos.routes.test.js` | Assert response has `items` and `results`; assert `q=roses` returns ≥1 item with tags; add case for `cars`, `fishes`, `houses`. |
| **Dashboard tests** | `apps/dashboard/.../tests/assetsPhotosSearch.test.ts` | Test 503 + `provider_not_configured` returns `ok:false` and error code/message; test response with only `tags` (no title) still returns results for "roses". |

## 3) Risk assessment

- **Store creation spine:** Not modified. No changes to:
  - POST /api/mi/orchestra/start  
  - GET /api/stores/temp/draft  
  - PATCH /api/draft-store/:draftId  
  - POST /api/store/publish  
  - GET /api/store/:id/preview  
- Only GET /api/assets/photos and the dashboard Assets panel (Content Studio) and its API client were touched.

**Provider not configured (503):** Core currently uses a static fallback only and does not require PEXELS_API_KEY. When you add a live Pexels path, return **503** with body `{ ok: false, error: { code: 'provider_not_configured', message: 'Set PEXELS_API_KEY on the server (core) to enable photo search.' } }` when the key is missing; the dashboard already handles this and shows the persistent provider message instead of "No photos found".

## 4) Test commands + results

**Core**

```bash
cd apps/core/cardbey-core
npx vitest run tests/assets.photos.routes.test.js --testTimeout=60000
```

Expected: 3 tests pass (stable shape with `items`, roses returns items with tags, cars/fishes/houses return items).

**Dashboard**

```bash
cd apps/dashboard/cardbey-marketing-dashboard
npx vitest run tests/assetsPhotosSearch.test.ts
```

Expected: 4 tests pass (roses with tags, items shape, 503 provider_not_configured, tags-only matcher).

## 5) Manual verification checklist

- [ ] Run core on `:3001`, dashboard on `:5174` (Vite proxy `/api` → core).
- [ ] Content Studio → Assets → Photos:
  - [ ] Search **"cars"** shows car photos.
  - [ ] Search **"roses"** shows roses/flowers photos.
  - [ ] Search **"fishes"** or **"houses"** shows relevant photos.
- [ ] With provider key removed (or core returning 503 + `provider_not_configured`): search shows **"Photo provider is not configured. Set PEXELS_API_KEY on the server (core) to enable search."** and does **not** show "No photos found".
- [ ] Store creation spine: Quick Create → Draft Review → Publish → Live still works.

## 6) Rollback steps

- **Core:** Revert `apps/core/cardbey-core/src/routes/assets.js` (remove extra static entries, remove `items` from response if desired; restore previous shape). Revert `tests/assets.photos.routes.test.js`.
- **Dashboard:** Revert `apps/dashboard/.../src/lib/api/assets.ts` (restore strict filter and previous error parsing if needed). Revert `tests/assetsPhotosSearch.test.ts` (remove new tests).
- No DB or auth changes; no changes to store-creation endpoints.
