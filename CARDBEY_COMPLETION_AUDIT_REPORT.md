# Cardbey Completion Audit Report
**Date:** 2026-01-25  
**Scope:** Store Creation (4 options), Draft/Review/Publish, Smart Object Promotion

---

## 1. Executive Summary

### What Works ✅
- **Orchestration contract**: POST `/api/mi/orchestra/start` returns `{ok, jobId, storeId, generationRunId, entryPoint}` ✅
- **Job execution**: POST `/api/mi/orchestra/job/:jobId/run` executes and updates status ✅
- **Job polling**: GET `/api/mi/orchestra/job/:jobId` returns status/result with generationRunId ✅
- **GOAL → ENTRYPOINT mapping**: Single source of truth exists in `miRoutes.js:874-879` ✅
- **Draft scoping**: `StoreReviewPage` extracts generationRunId from job and passes to draft endpoint ✅
- **Publish endpoint**: POST `/api/store/publish` exists and commits draft to Business + Products ✅
- **Smart Object backend**: Models, routes, and QR resolution implemented ✅
- **Option A (Form/Voice)**: Fully functional end-to-end ✅

### What's Broken ❌
- **Option B (OCR Menu)**: UI sends `sourceType='ocr'` but `goal='build_store'` (should be `goal='build_store_from_menu'`) ❌
- **Option C (Website URL)**: UI sends `sourceType='url'` but `goal='build_store'` (should be `goal='build_store_from_website'`) ❌
- **Option D (Template)**: No UI option, no goal mapping, no template picker ❌
- **Smart Object UI**: No dashboard UI to create smart objects or bind promotions ❌

### Why User Experience Fails
1. **All 4 options appear in UI, but only 1 works correctly**: Options B/C/D all fall back to `build_store` instead of using their specialized entryPoints.
2. **No template creation path**: Users cannot create stores from templates even though backend supports it.
3. **Smart Object feature is invisible**: Backend is ready but no UI exists to create QR objects or bind promotions.

---

## 2. Done vs Missing Table

### Store Creation Options

| Option | Frontend | Backend Mapping | Orchestrator | Service | Review Navigation | Status |
|--------|----------|----------------|--------------|---------|------------------|--------|
| **A: Form/Voice** | ✅ FeaturesPage sends `goal='build_store'` | ✅ Maps to `build_store` | ✅ Routes to `buildStoreService` | ✅ `buildStoreService.js` exists | ✅ Navigates with jobId + generationRunId | ✅ **DONE** |
| **B: OCR Menu** | 🟡 Sends `sourceType='ocr'` but `goal='build_store'` | ✅ Mapping exists (`build_store_from_menu` → `menu_import_store`) | ✅ Routes to `menuImportStoreService` | ✅ `menuImportStoreService.js` exists | ✅ Navigates correctly | 🟡 **PARTIAL** - Wrong goal |
| **C: Website URL** | 🟡 Sends `sourceType='url'` but `goal='build_store'` | ✅ Mapping exists (`build_store_from_website` → `website_import_store`) | ✅ Routes to `websiteImportStoreService` | ✅ `websiteImportStoreService.js` exists | ✅ Navigates correctly | 🟡 **PARTIAL** - Wrong goal |
| **D: Template** | ❌ No UI option | ✅ Mapping exists (`build_store_from_template` → `template_store`) | ✅ Routes to `templateStoreService` | ✅ `templateStoreService.js` exists | ✅ Would navigate correctly | ❌ **MISSING** - No UI |

**Evidence:**
- Frontend: `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts:763` (always `goal: 'build_store'`)
- Backend mapping: `apps/core/cardbey-core/src/routes/miRoutes.js:874-879`
- Orchestrator: `apps/core/cardbey-core/src/orchestrator/index.js:78-97`
- Services: All 3 import services exist

---

### Draft/Review/Publish Flow

| Component | Status | Evidence | Risk |
|-----------|--------|---------|------|
| **Draft Loading** | ✅ Done | `StoreReviewPage.tsx:44-53` extracts generationRunId from job, `StoreReviewPage.tsx:109,578` passes to draft endpoint | None |
| **Draft Scoping** | ✅ Done | `draftCompatRoutes.js:103-119` filters by generationRunId, warns if missing | Low - warnings logged but fallback works |
| **Draft Response Shape** | ✅ Done | `draftCompatRoutes.js:349` includes generationRunId, `StoreReviewPage.tsx:141-150` normalizes store object | None |
| **Job Polling** | ✅ Done | `useOrchestraJobUnified` hook polls GET `/api/mi/orchestra/job/:jobId` | None |
| **Publish Endpoint** | ✅ Done | `stores.js:816-950` implements POST `/api/store/publish`, commits draft to Business + Products | None |
| **Publish Client** | ✅ Done | `api/storeDraft.ts:125` calls POST `/api/store/publish` | None |

**Evidence:**
- Draft endpoint: `apps/core/cardbey-core/src/routes/draftCompatRoutes.js:179-394`
- Review page: `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`
- Publish: `apps/core/cardbey-core/src/routes/stores.js:816-950`

---

### Smart Object Promotion

| Component | Status | Evidence | Risk |
|-----------|--------|---------|------|
| **DB Models** | ✅ Done | `schema.prisma:1227-1275` (SmartObject, SmartObjectActivePromo, SmartObjectScan) | None |
| **Create Route** | ✅ Done | `smartObjectRoutes.js:50-100` POST `/api/smart-objects` creates SmartObject + QR | None |
| **Bind Promo Route** | ✅ Done | `smartObjectRoutes.js:150-200` POST `/api/smart-objects/:id/active-promo` | None |
| **QR Resolution** | ✅ Done | `qrRoutes.js:22-118` GET `/q/:code` resolves SmartObject, logs scan, returns JSON | None |
| **Dashboard UI** | ❌ Missing | No UI found to create smart objects or bind promotions | **HIGH** - Feature invisible to users |

**Evidence:**
- Models: `apps/core/cardbey-core/prisma/schema.prisma:1227-1275`
- Routes: `apps/core/cardbey-core/src/routes/smartObjectRoutes.js`, `apps/core/cardbey-core/src/routes/qrRoutes.js`
- UI: No matches found in dashboard codebase

---

## 3. Critical Path TODO List

### P0: Fix Goal Mapping in QuickStart (CRITICAL - Blocks Options B & C)

**Problem:** `quickStart.ts:763` always sends `goal: 'build_store'` regardless of `sourceType`.

**Files:**
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts:763`

**Patch:**
```typescript
// Replace line 763:
const orchestraPayload: any = {
  goal: 'build_store',  // ❌ WRONG - always same goal
  // ...
};

// With:
const GOAL_MAP: Record<string, string> = {
  'form': 'build_store',
  'voice': 'build_store',
  'ocr': 'build_store_from_menu',
  'url': 'build_store_from_website',
  'template': 'build_store_from_template',
};

const orchestraPayload: any = {
  goal: GOAL_MAP[payload.sourceType] || 'build_store',  // ✅ Correct goal per sourceType
  // ...
};
```

**Acceptance:**
- OCR mode sends `goal: 'build_store_from_menu'`
- URL mode sends `goal: 'build_store_from_website'`
- Form/Voice still send `goal: 'build_store'`

---

### P1: Add Template Option to FeaturesPage (HIGH VALUE)

**Problem:** No UI option for template-based store creation.

**Files:**
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx`

**Patch:**
1. Add template mode button (similar to OCR/URL buttons around line 1280-1305)
2. Add template picker UI (load templates from `/api/mi/orchestrator/templates/suggestions` or similar)
3. In `handleGenerateWithOptions`, add template case:
   ```typescript
   } else if (actualMode === 'template') {
     payload = {
       sourceType: 'template' as const,
       templateKey: selectedTemplateKey, // From template picker
     };
   }
   ```

**Acceptance:**
- Template button appears in mode selector
- Template picker shows available templates
- Selecting template and clicking Generate sends `goal: 'build_store_from_template'`

---

### P2: Add Smart Object UI (MEDIUM - Feature Invisible)

**Problem:** Backend is ready but no UI exists.

**Files:**
- New: `apps/dashboard/cardbey-marketing-dashboard/src/features/smartObjects/SmartObjectCreator.tsx`
- Or integrate into: `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Patch:**
1. Add "Create Smart Object" button in product card hover actions or products toolbar
2. On click, call `POST /api/smart-objects` with `{storeId, productId?}`
3. Show QR code image from response
4. Add "Bind Promotion" button that calls `POST /api/smart-objects/:id/active-promo`

**Acceptance:**
- Users can create SmartObject from review page
- QR code is displayed
- Users can bind active promo to SmartObject

---

### P3: Verify Template Service Loads Templates (LOW - May Be Stub)

**Problem:** `templateStoreService.js:27-50` tries to load from `CreativeTemplate` table but may not find templates.

**Files:**
- `apps/core/cardbey-core/src/orchestrator/services/templateStoreService.js:27-50`

**Patch:**
- Verify `CreativeTemplate` table has templates OR
- Add fallback template catalog (hardcoded templates for common business types)

**Acceptance:**
- Template service returns valid template data
- `build_store_from_template` produces draft with products

---

## 4. Minimal "Next Commits" Plan

### Commit 1: Fix Goal Mapping (P0)
**Intent:** Make OCR and URL modes use correct goals  
**Files:**
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts` (add GOAL_MAP, update line 763)

**Acceptance:**
- Network tab shows `goal: 'build_store_from_menu'` for OCR
- Network tab shows `goal: 'build_store_from_website'` for URL
- Review page loads with correct draft

**Time:** 15 minutes

---

### Commit 2: Add Template Mode UI (P1)
**Intent:** Enable template-based store creation  
**Files:**
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx` (add template button + picker)
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts` (add template case to GOAL_MAP)

**Acceptance:**
- Template button appears in mode selector
- Template picker loads and displays templates
- Generate with template sends `goal: 'build_store_from_template'`

**Time:** 1-2 hours

---

### Commit 3: Add Smart Object Creator UI (P2)
**Intent:** Make Smart Object feature accessible  
**Files:**
- New: `apps/dashboard/cardbey-marketing-dashboard/src/features/smartObjects/SmartObjectCreator.tsx`
- Update: `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx` (add "Create Smart Object" button)

**Acceptance:**
- "Create Smart Object" button visible in product card or toolbar
- Clicking creates SmartObject and shows QR code
- "Bind Promotion" button binds active promo

**Time:** 2-3 hours

---

### Commit 4: Verify Template Service (P3 - Optional)
**Intent:** Ensure template service has templates to load  
**Files:**
- `apps/core/cardbey-core/src/orchestrator/services/templateStoreService.js` (add fallback templates if CreativeTemplate empty)

**Acceptance:**
- Template service returns valid template data
- `build_store_from_template` produces draft

**Time:** 30 minutes

---

## 5. Root Cause Analysis: "Generate Keeps Spinning"

### Potential Causes (Based on Logs Pattern)

1. **Job never starts execution** ✅ FIXED
   - **Root cause:** QuickStart was not calling `/run` after `/start`
   - **Fix:** `quickStart.ts:1278` now calls `runOrchestraJob` after `startOrchestraTask`
   - **Status:** ✅ Resolved

2. **Job stays queued forever** ✅ FIXED
   - **Root cause:** `/run` endpoint was not being called
   - **Fix:** Auto-trigger `/run` in QuickStart flow
   - **Status:** ✅ Resolved

3. **Draft not found** ✅ FIXED
   - **Root cause:** generationRunId not passed to draft endpoint
   - **Fix:** `StoreReviewPage.tsx:109,578` passes generationRunId
   - **Status:** ✅ Resolved

4. **Store not found** ✅ FIXED
   - **Root cause:** Business record not created during orchestration
   - **Fix:** `miRoutes.js:1250-1336` ensures Business exists via upsert
   - **Status:** ✅ Resolved

5. **Wrong goal sent** ❌ **CURRENT ISSUE**
   - **Root cause:** `quickStart.ts:763` always sends `goal: 'build_store'` regardless of mode
   - **Impact:** OCR/URL modes don't use specialized services
   - **Fix:** Add GOAL_MAP (see Commit 1 above)
   - **Status:** ❌ **PENDING**

---

## 6. Semantic Mismatches Discovered

### Mismatch 1: sourceType vs goal
**Location:** `quickStart.ts:763`  
**Issue:** Frontend sends `sourceType` but always `goal: 'build_store'`. Backend expects `goal` to map to entryPoint.  
**Impact:** Options B & C don't use specialized services.  
**Fix:** Map `sourceType` → `goal` using GOAL_MAP table.

---

### Mismatch 2: Template option missing
**Location:** `FeaturesPage.tsx`  
**Issue:** Backend supports `build_store_from_template` but UI has no template option.  
**Impact:** Users cannot create stores from templates.  
**Fix:** Add template button + picker UI.

---

### Mismatch 3: Smart Object invisible
**Location:** Dashboard UI  
**Issue:** Backend fully implemented but no UI exists.  
**Impact:** Feature is completely inaccessible.  
**Fix:** Add Smart Object creator UI.

---

## 7. Files Changed Summary

### Backend (Core)
- ✅ `apps/core/cardbey-core/src/routes/miRoutes.js` - GOAL_TO_ENTRYPOINT mapping (lines 874-879)
- ✅ `apps/core/cardbey-core/src/orchestrator/index.js` - EntryPoints for website/menu/template (lines 78-97)
- ✅ `apps/core/cardbey-core/src/orchestrator/services/websiteImportStoreService.js` - NEW
- ✅ `apps/core/cardbey-core/src/orchestrator/services/menuImportStoreService.js` - NEW
- ✅ `apps/core/cardbey-core/src/orchestrator/services/templateStoreService.js` - NEW
- ✅ `apps/core/cardbey-core/src/routes/stores.js` - POST `/api/store/publish` (lines 816-950)
- ✅ `apps/core/cardbey-core/src/routes/draftCompatRoutes.js` - generationRunId in response (lines 349, 567)
- ✅ `apps/core/cardbey-core/src/routes/smartObjectRoutes.js` - Full implementation
- ✅ `apps/core/cardbey-core/src/routes/qrRoutes.js` - QR resolution (lines 22-118)
- ✅ `apps/core/cardbey-core/prisma/schema.prisma` - SmartObject models (lines 1227-1275)

### Frontend (Dashboard)
- ✅ `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx` - generationRunId extraction + draft loading
- ✅ `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts` - Auto-triggers `/run`, navigates with jobId
- ❌ `apps/dashboard/cardbey-marketing-dashboard/src/lib/quickStart.ts:763` - **NEEDS FIX:** Add GOAL_MAP
- ❌ `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx` - **NEEDS FIX:** Add template option
- ❌ `apps/dashboard/cardbey-marketing-dashboard/src/features/smartObjects/` - **MISSING:** No Smart Object UI

---

## 8. Acceptance Checklist

### Store Creation Options
- [ ] Option A (Form/Voice): ✅ Works end-to-end
- [ ] Option B (OCR Menu): ❌ Fix goal mapping → `build_store_from_menu`
- [ ] Option C (Website URL): ❌ Fix goal mapping → `build_store_from_website`
- [ ] Option D (Template): ❌ Add UI option + template picker

### Draft/Review/Publish
- [ ] Draft loads with generationRunId: ✅ Done
- [ ] Review page polls job: ✅ Done
- [ ] Publish commits draft: ✅ Done

### Smart Object Promotion
- [ ] Create SmartObject: ✅ Backend done, ❌ UI missing
- [ ] Bind promo: ✅ Backend done, ❌ UI missing
- [ ] QR resolution: ✅ Done

---

## 9. Next Steps (Priority Order)

1. **P0 (15 min):** Fix goal mapping in `quickStart.ts` - unblocks Options B & C
2. **P1 (1-2 hrs):** Add template UI in `FeaturesPage.tsx` - enables Option D
3. **P2 (2-3 hrs):** Add Smart Object creator UI - makes feature accessible
4. **P3 (30 min):** Verify template service has templates - ensures Option D works

**Total estimated time:** 4-6 hours to complete all 4 options + Smart Object UI.

---

## 10. Uncertainty / Areas to Inspect

1. **Template Service Templates:**
   - **Question:** Does `CreativeTemplate` table have templates?
   - **File to inspect:** `apps/core/cardbey-core/src/orchestrator/services/templateStoreService.js:27-50`
   - **Action:** Check DB or add fallback templates

2. **OCR Image Upload:**
   - **Question:** Does OCR mode actually upload image before calling `/start`?
   - **File to inspect:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx:721-725`
   - **Action:** Verify image upload flow exists

3. **Website Import Extraction:**
   - **Question:** Does `websiteImportStoreService` actually scrape websites or just use domain hints?
   - **File to inspect:** `apps/core/cardbey-core/src/orchestrator/services/websiteImportStoreService.js:22-76`
   - **Action:** Current implementation is minimal (domain hints only) - may need enhancement

---

**Report Complete.** Ready for implementation of 4 commits above.

