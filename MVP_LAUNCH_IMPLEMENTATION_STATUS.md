# MVP Launch Implementation Status

**Date:** 2025-01-28  
**Goal:** Unify Create Business + Fix Core URL + Fix Smart Promo + Fix Auto Image

---

## ✅ Completed

### Task 0: Stop Server Crash + Route Hygiene
- ✅ Fixed route formatting in `/api/mi/health` (removed incorrect indentation)
- ✅ Verified only one `/promo/from-idea` route exists (no duplicate)
- ✅ No TypeScript syntax errors found in `.js` files

### Task 2: Unified Business Create Endpoint
- ✅ Created canonical `POST /api/business/create` endpoint
  - Supports all 4 source types: `form`, `voice`, `ocr`, `url`
  - Always creates store (draft = true) with `storeId` NOT null
  - Creates MI generation job linked to store
  - Returns `{ok: true, jobId, tenantId, storeId}` (both IDs guaranteed)
- ✅ Added `GET /api/business/job/:jobId` status endpoint

### Task 3: Backend Promo Context Validation
- ✅ Updated `POST /api/mi/promo/from-product` to return 409 for missing context
- ✅ Updated `POST /api/mi/promo/from-draft` to return 409 for missing context
- ✅ Error code: `STORE_CONTEXT_REQUIRED` with message "Finish creating your store first"

### Task 4: Auto-Image prod_* Support
- ✅ Verified endpoint already supports `prod_*` external IDs
  - Tries direct DB lookup first
  - If `itemId.startsWith('prod_')`, tries `sku` lookup
  - Falls back to StoreDraft lookup if storeId provided
  - Returns 404 with `ITEM_NOT_FOUND` if not found

---

## 🚧 In Progress / Pending

### Task 1: Canonical Core API Base URL Resolver
- ⚠️ **Status:** Multiple implementations exist
  - `getCoreApiBaseUrl()` in `coreUrl.ts` - returns empty string in dev (proxy mode)
  - `getEffectiveCoreApiBaseUrl()` in `getCoreApiBaseUrl.ts` - always returns absolute URL
  - `buildApiUrl()` in `apiUrlHelper.ts` - uses `getEffectiveCoreApiBaseUrl()`
  - `buildApiUrl()` in `coreUrl.ts` - can return relative URLs

- **Action Needed:**
  - Standardize on `getEffectiveCoreApiBaseUrl()` as single source of truth
  - Update `apiUrlHelper.ts` to always use absolute URLs (no relative fallback)
  - Update all API clients to use `buildApiUrl()` from `apiUrlHelper.ts`
  - Remove relative `/api` calls (grep found none, but verify)

### Task 2: Frontend Unification
- ⚠️ **Status:** Multiple create flows exist
  - `/api/business/create` (new canonical)
  - `/api/ai/store/bootstrap` (legacy)
  - `/draft-store/generate` (legacy)
  - `/api/mi/generate` (legacy, URL only)

- **Action Needed:**
  - Update FeaturesPage to use `/api/business/create`
  - Update LandingPage quick start to use `/api/business/create`
  - Redirect legacy endpoints to canonical route
  - Store context in localStorage: `cardbey.ctx.tenantId`, `cardbey.ctx.storeId`, `cardbey.ctx.jobId`
  - Update Review page to read from query params or localStorage

### Task 3: Frontend Promo Context
- ⚠️ **Status:** Frontend needs to handle 409 errors gracefully
  - `MenuPage.jsx` - already uses `createPromoFromProduct()`
  - `StoreDraftReview.tsx` - has fallback logic but needs blocking modal

- **Action Needed:**
  - Add blocking modal component for "Finish creating your store"
  - Show modal when 409 error received
  - Add "Resume Setup" button (navigate to review/create)
  - Add "Open API Settings" button (open settings modal)

### Task 5: Auto-Images Toggle
- ⚠️ **Status:** Not implemented
- **Action Needed:**
  - Add toggle to Create Business UI (default ON)
  - Pass `options.autoImages` to `/api/business/create`
  - After job succeeds, call bulk image suggestion endpoint
  - Apply updates with concurrency=2
  - Show progress toast/banner

---

## 📋 Implementation Checklist

### Backend
- [x] Fix route formatting in miRoutes.js
- [x] Create unified `/api/business/create` endpoint
- [x] Add `/api/business/job/:jobId` status endpoint
- [x] Update promo endpoints to return 409 for missing context
- [x] Verify auto-image supports `prod_*` IDs

### Frontend
- [ ] Standardize Core URL resolver usage
- [ ] Update FeaturesPage to use `/api/business/create`
- [ ] Update LandingPage to use `/api/business/create`
- [ ] Store context in localStorage
- [ ] Update Review page to read context
- [ ] Add blocking modal for missing promo context
- [ ] Add auto-images toggle to Create UI
- [ ] Implement auto-fill images after job succeeds

---

## 🧪 Testing Checklist

### Local Test Flow
1. Start core + dashboard locally
2. Go to Create Business page
3. Choose Website/Link, paste URL, submit
4. ✅ Verify response includes `storeId` not null
5. Wait for job succeeded, auto-redirect to Review page
6. ✅ Verify menu items exist
7. Click "Auto Image" on card with `prod_*` id
8. ✅ Should succeed (no ITEM_NOT_FOUND)
9. Click "Create Smart Promotion"
10. ✅ Should open promo flow without missing context
11. ✅ No console errors about core base URL
12. ✅ `/api/mi/health` returns ok

---

## 📝 Notes

- Auto-image endpoint already supports `prod_*` IDs via:
  1. Direct DB lookup (cuid)
  2. SKU lookup (if starts with `prod_`)
  3. StoreDraft lookup (if storeId provided)

- Business create endpoint creates store immediately (draft = true) to ensure `storeId` is never null

- Promo endpoints now return 409 (Conflict) instead of 400 (Bad Request) for missing context, indicating user needs to complete store creation first




