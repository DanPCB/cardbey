# Cardbey Architecture Audit Report
**Date:** 2026-01-25  
**Auditor:** Senior Engineer + Product Architect  
**Scope:** Store Creation, Draft/Review/Publish, Smart Object Promotion

---

## 1. Architecture Status Summary

The Cardbey codebase has a **partially implemented** unified MI orchestration system. The core infrastructure for `build_store` is functional with proper entryPoint normalization, generationRunId scoping, and multi-store support (recently restored). However, **three of four store creation options are missing** (website import, menu OCR, template), and **Smart Object Promotion is stubbed** (returns 501). The draft/review/publish flow is **mostly complete** with proper normalization and job polling, but publish endpoint needs verification.

**Key Strengths:**
- Unified orchestrator with `build_store` entryPoint working
- Proper generationRunId scoping prevents state bleed
- Multi-store per user support (DB constraint removed, code updated)
- Draft compatibility routes with generationRunId filtering
- Review page with deterministic draft loading

**Critical Gaps:**
- Only 1 of 4 store creation options implemented (AI Quick Create)
- Smart Object Promotion completely stubbed (no DB models, no routes)
- No website/menu/template import services
- QR resolution route returns 404 (stub implementation)

---

## 2. Store Creation Audit

| Requirement | Status | Evidence | Risk / Why It Matters | Next Step |
|------------|--------|----------|----------------------|-----------|
| **Option 1: AI Quick Create (Text)** | ✅ Done | `apps/core/cardbey-core/src/orchestrator/index.js:74-76` (build_store entryPoint)<br>`apps/core/cardbey-core/src/orchestrator/services/buildStoreService.js` (full implementation)<br>`apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts:763` (goal: 'build_store') | None - fully functional | None |
| **Option 2: From Website/URL** | ❌ Missing | No `website_import_store` entryPoint in `orchestrator/index.js`<br>No `websiteImportStoreService.js` in `orchestrator/services/`<br>Frontend has `urlInput` in FeaturesPage but sends `sourceType: 'url'` to same `build_store` | Users cannot import stores from websites. High-value feature missing. | Create `websiteImportStoreService.js` in `orchestrator/services/`<br>Add `case 'website_import_store':` to `orchestrator/index.js`<br>Update `miRoutes.js` to map `goal: 'build_store_from_website'` → `entryPoint: 'website_import_store'` |
| **Option 3: From Menu Upload (OCR)** | 🟡 Partial | `menuFromPhotoService.js` exists (`orchestrator/services/menuFromPhotoService.js`)<br>EntryPoint `menu_from_photo` exists in orchestrator<br>BUT: No `menu_import_store` entryPoint<br>No goal mapping `build_store_from_menu` → `menu_import_store` | OCR service exists but not wired for store creation. Users can extract menu but cannot create store from it. | Add `case 'menu_import_store':` to `orchestrator/index.js`<br>Create `menuImportStoreService.js` that calls `menuFromPhotoService` then `buildStoreService`<br>Map `goal: 'build_store_from_menu'` → `entryPoint: 'menu_import_store'` in `miRoutes.js` |
| **Option 4: From Template** | ❌ Missing | No `template_store` entryPoint<br>No template import service<br>Frontend has template picker UI but no store creation integration | Template-based store creation not available. Users must manually create stores even when templates exist. | Create `templateStoreService.js` in `orchestrator/services/`<br>Add `case 'template_store':` to `orchestrator/index.js`<br>Map `goal: 'build_store_from_template'` → `entryPoint: 'template_store'`<br>Wire template picker in FeaturesPage to call orchestra/start with template payload |
| **Unified MI Pattern: POST /start** | ✅ Done | `apps/core/cardbey-core/src/routes/miRoutes.js:849` (`handleOrchestraStart`)<br>Creates task + draft scope with generationRunId<br>Returns `{ok: true, jobId, storeId, generationRunId}` | None | None |
| **Unified MI Pattern: POST /run** | ✅ Done | `apps/core/cardbey-core/src/routes/miRoutes.js:2096` (`handleOrchestraJobRun`)<br>Calls `runOrchestrator(entryPoint, input, ctx)`<br>Updates task status and result | None | None |
| **Unified MI Pattern: Review Route** | ✅ Done | `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx:23`<br>Route: `/app/store/:storeId/review?mode=draft&jobId=...`<br>Uses `useOrchestraJobUnified` for polling | None | None |
| **Multi-store Support** | ✅ Done | `apps/core/cardbey-core/prisma/schema.prisma:59` (userId NOT unique)<br>`apps/core/cardbey-core/src/routes/miRoutes.js:1264-1336` (createNewStore=true creates new Business)<br>Migration `20260125225247_remove_business_userid_unique` applied | None | None |

---

## 3. Draft/Review/Publish Audit

| Requirement | Status | Evidence | Risk / Why It Matters | Next Step |
|------------|--------|----------|----------------------|-----------|
| **Draft Endpoint: GET /api/stores/:storeId/draft** | ✅ Done | `apps/core/cardbey-core/src/routes/draftCompatRoutes.js:56-100` (`findBestDraftForStore`)<br>Supports `?generationRunId=...` query param<br>Returns draft with `store`, `products`, `categories`, `preview`, `input` | None | None |
| **Draft Response Shape: store object ALWAYS** | ✅ Done | `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx:141-147` (normalization)<br>Fallback: `{id: storeId, name: 'Untitled Store', type: 'Unknown'}` | Prevents crashes when backend returns minimal data | None |
| **Draft Response: generationRunId** | 🟡 Partial | `draftCompatRoutes.js:100-120` (filters by generationRunId if provided)<br>BUT: Response does NOT include `generationRunId` field in JSON<br>Frontend must extract from `input.generationRunId` | Frontend must parse JSON to get generationRunId. Not ideal but workable. | Add `generationRunId` to draft response JSON (extract from `input` field) |
| **Review UI: Draft Normalization** | ✅ Done | `StoreReviewPage.tsx:141-150` (normalizes `draft.store`, `draft.products`, `draft.categories`)<br>Guarantees shape even if API returns minimal data | Prevents crashes in StoreDraftReview | None |
| **Review UI: Job Polling** | ✅ Done | `StoreReviewPage.tsx:44` (`useOrchestraJobUnified(urlJobId)`)<br>Polls `GET /api/mi/orchestra/job/:jobId`<br>Extracts generationRunId from job result | None | None |
| **Publish UX Path** | ❌ Missing | `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx:1501` (`handlePublish`)<br>Calls `publishStore({storeId})` from `@/api/storeDraft`<br>Endpoint: `POST /api/store/publish`<br>**VERIFIED:** No `POST /api/store/publish` route in `apps/core/cardbey-core/src/routes/stores.js` | **CRITICAL:** Publish button will fail. Users cannot publish stores. | Create `POST /api/store/publish` route in `stores.js`<br>Implement logic to:<br>1. Find DraftStore by storeId + generationRunId<br>2. Commit draft to Business (update name, type, etc.)<br>3. Commit products/categories to Product table<br>4. Mark DraftStore as `status='committed'`<br>5. Return `{ok: true, publishedStoreId, storefrontUrl}` |
| **MI Actions in Review** | ✅ Done | `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/review/MICommandBar.tsx`<br>Goals: `autofill_product_images`, `generate_tags`, `rewrite_descriptions`, `generate_store_hero`<br>Uses unified polling via `useOrchestraJobUnified` | None | None |

---

## 4. Smart Object Promotion Audit

| Requirement | Status | Evidence | Risk / Why It Matters | Next Step |
|------------|--------|----------|----------------------|-----------|
| **Step 1: Create Smart Object** | ❌ Missing | `apps/core/cardbey-core/src/routes/smartObjectRoutes.js:11-18` (returns 501 stub)<br>No DB models: `SmartObject`, `SmartObjectActivePromo`, `SmartObjectScan` in schema.prisma<br>Frontend API exists (`apps/dashboard/cardbey-marketing-dashboard/src/api/smartObject.ts`) but backend stubbed | Cannot create QR objects. Feature completely unavailable. | Create Prisma models: `SmartObject`, `SmartObjectActivePromo`, `SmartObjectScan`<br>Implement `POST /api/smart-objects` in `smartObjectRoutes.js`<br>Add QR code generation (use existing `generateQRCodeUrl` from frontend or backend library) |
| **Step 2: Create Promo for Smart Object** | ❌ Missing | No `create_smart_promo` goal or `smart_object_promo` entryPoint<br>No service to link PromoInstance to SmartObject<br>No `POST /api/smart-objects/:id/active-promo` implementation | Cannot bind promotions to QR objects. Feature unavailable. | Add `case 'smart_object_promo':` to `orchestrator/index.js`<br>Create `smartObjectPromoService.js`<br>Implement `POST /api/smart-objects/:id/active-promo` in `smartObjectRoutes.js`<br>Link PromoInstance to SmartObjectActivePromo |
| **Runtime: GET /q/:qrId** | 🟡 Partial | `apps/core/cardbey-core/src/routes/qrRoutes.js:22-40` (stub returns 404)<br>No database lookup<br>No SmartObject resolution | QR codes do not resolve. Users cannot scan and access promotions. | Implement `GET /q/:code` to:<br>1. Lookup SmartObject by `publicCode`<br>2. Find active PromoInstance via `SmartObjectActivePromo`<br>3. Render MI embedded experience (or redirect to promo page)<br>4. Log scan event to `SmartObjectScan` |
| **Tracking Events** | ❌ Missing | No `SmartObjectScan` model<br>No scan event logging | Cannot track QR scans. Analytics unavailable. | Add `SmartObjectScan` model to schema.prisma<br>Log scan events in `GET /q/:code` handler<br>Include: `smartObjectId`, `scannedAt`, `userAgent`, `ipHash` (optional) |
| **MI Embedded Rendering** | ❌ Missing | No endpoint to render MI-embedded promo experience<br>No component/service to generate embedded HTML | QR scans cannot show rich MI experience. Falls back to basic redirect. | Create `GET /api/public/smart-object/:code/render` endpoint<br>Returns HTML with embedded MI promo experience<br>Or redirect to `/app/promo/:promoId?smartObjectId=...` with MI context |

---

## 5. Top 10 Blocking Tasks (Execution Order)

1. **Implement Smart Object DB Models** (P0 - Blocks all QR features)
   - Add `SmartObject`, `SmartObjectActivePromo`, `SmartObjectScan` to `schema.prisma`
   - Create migration
   - **Files:** `apps/core/cardbey-core/prisma/schema.prisma`, new migration file
   - **Time:** 2-3 hours

2. **Implement GET /q/:code Resolution** (P0 - Core QR functionality)
   - Lookup SmartObject by publicCode
   - Resolve active promo
   - Log scan event
   - **Files:** `apps/core/cardbey-core/src/routes/qrRoutes.js`
   - **Time:** 2-3 hours

3. **Implement POST /api/smart-objects** (P0 - Create QR objects)
   - Replace 501 stub with real implementation
   - Generate QR code (use library or external API)
   - Store in database
   - **Files:** `apps/core/cardbey-core/src/routes/smartObjectRoutes.js`
   - **Time:** 2-3 hours

4. **Implement Website Import Store Service** (P1 - High-value feature)
   - Create `websiteImportStoreService.js` in `orchestrator/services/`
   - Scrape/parse website content
   - Call `buildStoreService` with parsed data
   - **Files:** New file `apps/core/cardbey-core/src/orchestrator/services/websiteImportStoreService.js`
   - **Time:** 4-6 hours

5. **Wire Website Import to Orchestrator** (P1 - Enable feature)
   - Add `case 'website_import_store':` to `orchestrator/index.js`
   - Map `goal: 'build_store_from_website'` → `entryPoint: 'website_import_store'` in `miRoutes.js`
   - **Files:** `apps/core/cardbey-core/src/orchestrator/index.js`, `apps/core/cardbey-core/src/routes/miRoutes.js:871-890`
   - **Time:** 1 hour

6. **Implement Menu Import Store Service** (P1 - Reuse OCR)
   - Create `menuImportStoreService.js` that calls `menuFromPhotoService` then `buildStoreService`
   - **Files:** New file `apps/core/cardbey-core/src/orchestrator/services/menuImportStoreService.js`
   - **Time:** 2-3 hours

7. **Wire Menu Import to Orchestrator** (P1 - Enable feature)
   - Add `case 'menu_import_store':` to `orchestrator/index.js`
   - Map `goal: 'build_store_from_menu'` → `entryPoint: 'menu_import_store'` in `miRoutes.js`
   - **Files:** `apps/core/cardbey-core/src/orchestrator/index.js`, `apps/core/cardbey-core/src/routes/miRoutes.js:871-890`
   - **Time:** 1 hour

8. **Implement Template Store Service** (P2 - Template integration)
   - Create `templateStoreService.js` that loads template and calls `buildStoreService`
   - **Files:** New file `apps/core/cardbey-core/src/orchestrator/services/templateStoreService.js`
   - **Time:** 3-4 hours

9. **Wire Template Store to Orchestrator** (P2 - Enable feature)
   - Add `case 'template_store':` to `orchestrator/index.js`
   - Map `goal: 'build_store_from_template'` → `entryPoint: 'template_store'` in `miRoutes.js`
   - Wire template picker in FeaturesPage
   - **Files:** `apps/core/cardbey-core/src/orchestrator/index.js`, `apps/core/cardbey-core/src/routes/miRoutes.js:871-890`, `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx`
   - **Time:** 2 hours

10. **Implement Publish Endpoint** (P0 - CRITICAL: Blocks publish flow)
    - **VERIFIED MISSING:** No `POST /api/store/publish` route exists
    - Create route in `stores.js` or new `storePublishRoutes.js`
    - Commit DraftStore to Business + Products
    - **Files:** `apps/core/cardbey-core/src/routes/stores.js` (add route) or new file
    - **Time:** 4-6 hours (must commit draft, products, categories, update status)

---

## 6. Quick Wins (< 1 Hour Each)

1. **Add generationRunId to Draft Response** (30 min)
   - Extract `generationRunId` from `draft.input` in `draftCompatRoutes.js`
   - Add to response JSON: `{..., generationRunId: extractedValue}`
   - **File:** `apps/core/cardbey-core/src/routes/draftCompatRoutes.js:200-250`

2. **Fix QR Route Stub Message** (15 min)
   - Update `GET /q/:code` to return better error message
   - **File:** `apps/core/cardbey-core/src/routes/qrRoutes.js:22-40`

3. **Add EntryPoint Validation Logging** (20 min)
   - Log when unknown entryPoint is requested in `miRoutes.js`
   - **File:** `apps/core/cardbey-core/src/routes/miRoutes.js:890`

4. **Document Missing EntryPoints** (30 min)
   - Add TODO comments in `orchestrator/index.js` for missing entryPoints
   - **File:** `apps/core/cardbey-core/src/orchestrator/index.js:47-79`

5. **Add generationRunId to DraftStore Response** (20 min)
   - Ensure `GET /api/stores/:storeId/draft` includes `generationRunId` in response
   - **File:** `apps/core/cardbey-core/src/routes/draftCompatRoutes.js`

---

## 7. Semantic Mismatches Discovered

### 7.1 createNewStore Behavior (FIXED)
- **Issue:** Previously enforced "1 store per user" by reusing existing Business
- **Status:** ✅ **FIXED** - Now correctly creates new Business when `createNewStore=true`
- **Evidence:** `apps/core/cardbey-core/src/routes/miRoutes.js:1264-1327` (creates new Business)
- **Migration:** `20260125225247_remove_business_userid_unique` applied

### 7.2 STORE_ID_MISMATCH Logic (FIXED)
- **Issue:** Previously rejected generation if businessName differed from existing store name
- **Status:** ✅ **FIXED** - Now only checks ownership (security), allows name differences
- **Evidence:** `apps/core/cardbey-core/src/routes/miRoutes.js:1080-1121` (ownership check only)
- **Impact:** Users can generate drafts with different names without conflicts

### 7.3 Draft Response Shape (PARTIALLY FIXED)
- **Issue:** Backend may return minimal data without `store` object
- **Status:** 🟡 **PARTIALLY FIXED** - Frontend normalizes, but backend should guarantee shape
- **Evidence:** `StoreReviewPage.tsx:141-150` (frontend normalization)
- **Recommendation:** Backend should always return complete shape (add normalization in `draftCompatRoutes.js`)

### 7.4 EntryPoint Normalization (WORKING AS INTENDED)
- **Issue:** Legacy `store_generation` entryPoint
- **Status:** ✅ **FIXED** - Normalized to `build_store` automatically
- **Evidence:** `apps/core/cardbey-core/src/routes/miRoutes.js:873-892` (normalization logic)

### 7.5 Goal → EntryPoint Mapping (INCOMPLETE)
- **Issue:** Only `build_store` goal is mapped. Missing: `build_store_from_website`, `build_store_from_menu`, `build_store_from_template`
- **Status:** ❌ **MISSING** - No mapping logic for alternative goals
- **Evidence:** `apps/core/cardbey-core/src/routes/miRoutes.js:871-890` (only handles `build_store`)
- **Recommendation:** Add goal-to-entryPoint mapping:
  ```javascript
  const GOAL_TO_ENTRYPOINT = {
    'build_store': 'build_store',
    'build_store_from_website': 'website_import_store',
    'build_store_from_menu': 'menu_import_store',
    'build_store_from_template': 'template_store',
  };
  ```

---

## 8. Evidence File Paths Summary

### Backend Core
- `apps/core/cardbey-core/src/routes/miRoutes.js` - Main MI orchestration routes
- `apps/core/cardbey-core/src/orchestrator/index.js` - Unified orchestrator entry point
- `apps/core/cardbey-core/src/orchestrator/services/buildStoreService.js` - Build store implementation
- `apps/core/cardbey-core/src/routes/draftCompatRoutes.js` - Draft compatibility routes
- `apps/core/cardbey-core/src/routes/smartObjectRoutes.js` - Smart Object routes (stub)
- `apps/core/cardbey-core/src/routes/qrRoutes.js` - QR resolution routes (stub)
- `apps/core/cardbey-core/prisma/schema.prisma` - Database schema

### Frontend Dashboard
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts` - QuickStart orchestration client
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx` - Create Hub UI
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx` - Review page wrapper
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` - Review component
- `apps/dashboard/cardbey-marketing-dashboard/src/api/storeDraft.ts` - Publish API client
- `apps/dashboard/cardbey-marketing-dashboard/src/api/smartObject.ts` - Smart Object API client

---

## 9. Recommendations Priority

**Immediate (This Sprint):**
1. **CRITICAL:** Implement publish endpoint (Task #10) - Users cannot publish stores currently
2. Implement Smart Object DB models and basic CRUD (Tasks #1-3)
3. Implement GET /q/:code resolution (Task #2)

**Short-term (Next Sprint):**
4. Implement website import store service (Tasks #4-5)
5. Wire menu import for store creation (Tasks #6-7)

**Medium-term (Future):**
6. Implement template store service (Tasks #8-9)
7. Add MI embedded rendering for QR scans

---

**Report End**

