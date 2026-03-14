# Implementation Summary: Missing Architecture Pieces

## ✅ Completed Tasks

### P0: Implement Publish (CRITICAL) ✅

**Files Changed:**
- `apps/core/cardbey-core/src/routes/stores.js`
  - Added `POST /api/store/publish` endpoint (lines ~790-950)
  - Implements full publish flow:
    - Finds draft by `storeId` + `generationRunId` (or best draft)
    - Validates ownership
    - Commits draft to Business (updates name, type, description, logo, hero assets)
    - Replaces existing products with draft products
    - Marks DraftStore as `status='committed'`
    - Logs ActivityEvent
    - Returns `{ok: true, publishedStoreId, publishedAt, storefrontUrl}`

**Manual Verification Checklist:**
- [ ] Generate draft via QuickStart
- [ ] Navigate to review page
- [ ] Click "Publish" button
- [ ] Confirm response `{ok: true, publishedStoreId, ...}`
- [ ] Verify Business record updated in DB
- [ ] Verify Products created/replaced in DB
- [ ] Verify DraftStore status = 'committed'

---

### P0.5: Backend Guarantees draft.store Shape ✅

**Files Changed:**
- `apps/core/cardbey-core/src/routes/draftCompatRoutes.js`
  - Added `generationRunId` extraction from draft input (lines ~336-343, ~560-567)
  - Includes `generationRunId` at top level in response JSON for both authenticated and public endpoints
  - Store object is already guaranteed via existing validation (lines ~266-320, ~483-545)

**Verification:**
- [ ] `GET /api/stores/:storeId/draft?generationRunId=...` returns `generationRunId` in response
- [ ] `GET /api/public/store/:storeId/draft?generationRunId=...` returns `generationRunId` in response
- [ ] Both endpoints always return `store` object (never null)

---

### P1: Complete "4 Options" goal→entryPoint Wiring ✅

**Files Changed:**

1. **`apps/core/cardbey-core/src/routes/miRoutes.js`**
   - Added `GOAL_TO_ENTRYPOINT` mapping table (lines ~873-877)
   - Maps:
     - `build_store` → `build_store`
     - `build_store_from_website` → `website_import_store`
     - `build_store_from_menu` → `menu_import_store`
     - `build_store_from_template` → `template_store`
   - Updated entryPoint normalization to use mapping table (lines ~878-890)

2. **`apps/core/cardbey-core/src/orchestrator/index.js`**
   - Added `website_import_store` case (lines ~78-83)
   - Added `menu_import_store` case (lines ~85-90)
   - Added `template_store` case (lines ~92-97)
   - Updated TypeScript typedef (line ~24)

3. **`apps/core/cardbey-core/src/orchestrator/services/websiteImportStoreService.js`** (NEW)
   - Minimal implementation:
     - Extracts domain hints from URL
     - Calls `buildStoreService` with website hints
     - Returns BuildStoreResult format

4. **`apps/core/cardbey-core/src/orchestrator/services/menuImportStoreService.js`** (NEW)
   - Implementation:
     - Calls `menuFromPhotoService` to extract menu items
     - Converts items to seed catalog input
     - Calls `buildStoreService` with menu data

5. **`apps/core/cardbey-core/src/orchestrator/services/templateStoreService.js`** (NEW)
   - Implementation:
     - Loads template from CreativeTemplate table (or uses default)
     - Calls `buildStoreService` with template data

**Verification:**
- [ ] `POST /api/mi/orchestra/start` with `goal: 'build_store_from_website'` maps to `entryPoint: 'website_import_store'`
- [ ] `POST /api/mi/orchestra/start` with `goal: 'build_store_from_menu'` maps to `entryPoint: 'menu_import_store'`
- [ ] `POST /api/mi/orchestra/start` with `goal: 'build_store_from_template'` maps to `entryPoint: 'template_store'`
- [ ] Each service calls `buildStoreService` correctly

**Frontend Wiring (TODO):**
- [ ] Update `FeaturesPage.tsx` to send correct `goal` for each option
- [ ] Add UI for website URL input
- [ ] Add UI for menu photo upload
- [ ] Add UI for template picker

---

### P2: Smart Object Promotion (QR-first) ✅

**Files Changed:**

1. **`apps/core/cardbey-core/prisma/schema.prisma`**
   - Added `SmartObject` model (lines ~1226-1243)
     - Fields: `id`, `publicCode` (unique), `storeId`, `productId?`, `type`, `status`, `qrUrl`
     - Relations: `activePromo`, `scans`
   - Added `SmartObjectActivePromo` model (lines ~1245-1256)
     - Links SmartObject to PromoInstance/PromoRule
   - Added `SmartObjectScan` model (lines ~1258-1269)
     - Tracks QR scans for analytics

2. **`apps/core/cardbey-core/src/routes/smartObjectRoutes.js`**
   - Replaced stub with full implementation:
     - `POST /api/smart-objects` - Create SmartObject
     - `GET /api/smart-objects/:idOrCode` - Get by ID or publicCode
     - `POST /api/smart-objects/:id/active-promo` - Set active promo
   - Generates unique `publicCode` (8-char hex)
   - Generates QR URL via QR Server API
   - Validates ownership

3. **`apps/core/cardbey-core/src/routes/qrRoutes.js`**
   - Updated `GET /q/:code` to:
     - Lookup SmartObject by `publicCode`
     - Log scan event (non-blocking)
     - Return JSON with `redirectUrl` to promo/store
     - Include `activePromo` info if exists

**Verification:**
- [ ] Run migration: `npx prisma migrate dev --name add_smart_object_models`
- [ ] `POST /api/smart-objects` creates SmartObject with QR URL
- [ ] `GET /q/:publicCode` resolves SmartObject and logs scan
- [ ] `POST /api/smart-objects/:id/active-promo` links promo to SmartObject
- [ ] Scan events appear in `SmartObjectScan` table

**MI Embedded Rendering (Future):**
- Currently returns JSON with `redirectUrl`
- Future: Add `GET /api/public/smart-object/:code/render` for embedded HTML

---

## 📋 Remaining Tasks

### Frontend Wiring (P1)
- [ ] Update `FeaturesPage.tsx` to support 4 creation options:
  - Tab/button for "From Website" → sends `goal: 'build_store_from_website'`
  - Tab/button for "From Menu" → sends `goal: 'build_store_from_menu'`
  - Tab/button for "From Template" → sends `goal: 'build_store_from_template'`
- [ ] Add input fields for website URL, menu photo upload, template picker

### Database Migration (P2) ✅
- [x] SmartObject models already existed from migration `20260103180000_add_smart_object_models`
- [x] Created manual migration `20260126000000_update_smart_object_fields` to add missing fields:
  - `qrUrl` in SmartObject
  - `promoType` and `activatedAt` in SmartObjectActivePromo
  - Renamed `timestamp` to `scannedAt` and added `promoId` in SmartObjectScan
- [x] Marked migration as applied (schema already synced via `db push`)
- [x] Generated Prisma client
- [ ] Verify tables exist: `SmartObject`, `SmartObjectActivePromo`, `SmartObjectScan`

### Testing
- [ ] Test publish flow end-to-end
- [ ] Test website import (minimal extraction)
- [ ] Test menu import (OCR → build_store)
- [ ] Test template import
- [ ] Test Smart Object creation and QR resolution

---

## 🔧 Notes

### Publish Endpoint Implementation Details
- Uses transaction to ensure atomicity
- Replaces existing products (delete + create) - could be optimized to upsert by stable keys
- Updates Business fields: name, type, slug, description, logo, stylePreferences (hero assets)
- Marks DraftStore as `committed` with timestamp
- Logs ActivityEvent for audit trail

### Service Implementations
- All new services (`websiteImportStoreService`, `menuImportStoreService`, `templateStoreService`) are minimal viable implementations
- They call `buildStoreService` with extracted hints
- Future enhancements: better website scraping, improved OCR processing, template library

### Smart Object QR Resolution
- Currently returns JSON (frontend can handle redirect or render embedded)
- Future: Add HTML rendering endpoint for embedded MI experience
- Scan logging is non-blocking (doesn't fail if logging fails)

---

## ✅ Done/Remaining Checklist

### ✅ Done
- [x] P0: Publish endpoint implemented
- [x] P0.5: draft.store shape guaranteed
- [x] P1: Goal→entryPoint mapping table
- [x] P1: websiteImportStoreService.js
- [x] P1: menuImportStoreService.js
- [x] P1: templateStoreService.js
- [x] P2: SmartObject DB models
- [x] P2: Smart Object routes
- [x] P2: QR resolution route

### ⏳ Remaining
- [ ] Frontend: Wire 4 creation options in FeaturesPage
- [ ] Database: Run Prisma migration for SmartObject models
- [ ] Testing: End-to-end verification of all flows
- [ ] Future: Enhanced website scraping
- [ ] Future: MI embedded rendering for QR scans

---

## 🚀 Next Steps

1. **Run Prisma Migration:**
   ```bash
   cd apps/core/cardbey-core
   npx prisma migrate dev --name add_smart_object_models
   npx prisma generate
   ```

2. **Test Publish Flow:**
   - Generate draft via QuickStart
   - Navigate to review page
   - Click "Publish"
   - Verify Business and Products updated

3. **Test Smart Object:**
   - Create SmartObject via `POST /api/smart-objects`
   - Set active promo via `POST /api/smart-objects/:id/active-promo`
   - Scan QR code via `GET /q/:publicCode`
   - Verify scan logged

4. **Frontend Wiring:**
   - Update FeaturesPage to support 4 options
   - Add input fields for website/menu/template
   - Test each creation path
