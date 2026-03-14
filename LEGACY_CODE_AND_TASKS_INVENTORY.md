# Legacy Code and Tasks Inventory

**Date:** 2026-01-11  
**Purpose:** Comprehensive inventory of legacy code, deprecated features, and tasks that use old formats/systems

---

## Executive Summary

Cardbey has **multiple legacy systems** running alongside new implementations. The main issue is **architectural debt** from gradual evolution rather than a single "old system." Legacy code exists in:

1. **Draft Format Systems** (multiple response formats)
2. **Device/Screen Pairing** (dual models: `Device` vs `Screen`)
3. **AI Orchestration** (old direct calls vs new engine-based)
4. **Status Fields** (`'failed'` vs `'error'`)
5. **API Response Formats** (legacy fields for backward compatibility)

---

## 1. Draft Format Legacy

### Problem
**Multiple draft response formats** exist simultaneously:

| Format | Location | Status | Used By |
|--------|----------|--------|---------|
| **New Format** | `draft.catalog.products` | ✅ Preferred | Store drafts (new) |
| **Legacy Format 1** | `response.products` | ⚠️ Legacy | Store drafts (old) |
| **Legacy Format 2** | `draft.products` | ⚠️ Legacy | Store drafts (old) |
| **Legacy Format 3** | `draft.items` | ⚠️ Legacy | Store drafts (old) |

### Where It's Used

**Backend Endpoints:**
- `GET /api/stores/:id/draft` - Returns both new + legacy fields
- `GET /api/public/store/:id/draft` - Returns both new + legacy fields
- `POST /api/mi/orchestra/job/:jobId/sync-store` - Returns both formats

**Frontend:**
- `normalizeDraft()` in `draftModel.ts` - Handles all 4 formats
- `StoreReviewPage.tsx` - Uses normalized draft
- `StoreDraftReview.tsx` - Uses normalized draft
- `ProductSuggestions.tsx` - Uses draft data

**Tasks Using Draft Format:**
1. ✅ **Store Drafts** - Uses new format (via `normalizeDraft()`)
2. ⚠️ **Menu from Photo** - May use legacy format
3. ⚠️ **Loyalty from Card** - May use legacy format
4. ⚠️ **Store Bootstrap** - May use legacy format
5. ⚠️ **Public Previews** - Uses both formats
6. ⚠️ **Content Studio** - Uses draft data for promotions

### Code Locations

**Backend:**
- `apps/core/cardbey-core/src/routes/stores.js:760-822` - Returns both formats
- `apps/core/cardbey-core/src/routes/publicUsers.js:127-191` - Returns both formats
- `apps/core/cardbey-core/src/routes/miRoutes.js` - Sync-store response

**Frontend:**
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/draftModel.ts:194-352` - `normalizeDraft()` handles all formats
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx` - Uses normalized draft

### Migration Status
- ✅ Frontend has compatibility layer (`normalizeDraft()`)
- ⚠️ Backend still sends both formats
- ❌ No single source of truth
- 📋 **Migration Plan:** See `DRAFT_FORMAT_MIGRATION_STRATEGY.md`

---

## 2. Device/Screen Pairing Legacy

### Problem
**Dual device models** exist for the same concept:

| Model | Table | Status | Used By |
|-------|-------|--------|---------|
| **Device** (New) | `Device` | ✅ Preferred | Device Engine V2 |
| **Screen** (Legacy) | `Screen` | ⚠️ Frozen | Legacy pairing |

### Legacy System (FROZEN)

**Frozen Endpoints:**
- `POST /api/screens/pair/initiate` - Returns `410 Gone`
- `POST /api/screens/pair/complete` - Returns `410 Gone`

**Replacement:**
- `POST /api/device/request-pairing` - New endpoint
- `POST /api/device/complete-pairing` - New endpoint

**Still Works (Read-Only):**
- `GET /api/screens/pair/peek/:code` - Check legacy codes
- `GET /api/screens/pair/sessions/:sessionId/status` - Legacy status polling

### Dual Systems

**1. Device Engine V2 (New):**
- Uses `Device` model
- `lastSeenAt` field
- Creates state snapshots
- Event system: `DEVICE_EVENTS.PAIRED`, `DEVICE_EVENTS.HEARTBEAT_RECEIVED`
- Location: `apps/core/cardbey-core/src/engines/device/`

**2. Legacy Device Controller (Old):**
- Uses `Screen` model
- `lastSeen` field (not `lastSeenAt`)
- No snapshots
- Location: `apps/core/cardbey-core/src/services/device.controller.js`

**3. C-Net Registry (In-Memory):**
- In-memory only
- No persistence
- Location: `apps/core/cardbey-core/src/routes/cnet.js`

### Code Locations

**Backend:**
- `apps/core/cardbey-core/src/engines/device/` - New Device Engine
- `apps/core/cardbey-core/src/services/device.controller.js` - Legacy controller
- `apps/core/cardbey-core/src/routes/screens.js` - Legacy Screen routes (frozen)
- `apps/core/cardbey-core/src/routes/device.js` - New Device routes

**Frontend:**
- `apps/dashboard/cardbey-marketing-dashboard/src/api/deviceClient.ts` - New client
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/pairApi.ts` - Legacy client (dead code)

### Migration Status
- ✅ Legacy pairing endpoints frozen (410 Gone)
- ✅ New Device Engine V2 working
- ⚠️ Legacy `Screen` model still exists in DB
- ⚠️ Some legacy endpoints still work (read-only)
- 📋 **Migration Plan:** See `LEGACY_PAIRING_FROZEN.md`

---

## 3. AI Orchestration Legacy

### Problem
**Dual AI systems** exist:

| System | Status | Used By |
|--------|--------|---------|
| **AI Engines** (New) | ✅ Preferred | New services |
| **Direct AI Calls** (Legacy) | ⚠️ Legacy | Old flows |

### Legacy Implementation

**Old System:**
- Direct OpenAI calls scattered across modules
- No unified interface
- No shared types
- Location: Various files calling OpenAI directly

**New System:**
- Unified AI engine interfaces
- Shared types package (`packages/ai-types`)
- Engine registry
- Location: `apps/core/cardbey-core/src/ai/engines/`

### Feature Flag Migration

**Current State:**
- Feature flag: `USE_AI_ENGINES` (default: `true`)
- New services use AI engines
- Legacy code kept for backward compatibility

**Tasks with Dual Implementation:**

**1. Menu from Photo:**
- **New:** `menuFromPhotoService.js` (uses AI engines)
- **Legacy:** Direct `menu.extract` tool calls
- Location: `apps/core/cardbey-core/src/orchestrator/flows/menu_from_photo.ts:49-201`
- Status: ✅ New service complete, legacy kept for compatibility

**2. Loyalty from Card:**
- **New:** `loyaltyFromCardService.js` (uses AI engines)
- **Legacy:** Direct `Vision.parseLoyaltyCard()` calls
- Location: `apps/core/cardbey-core/src/orchestrator/flows/loyalty_from_card.ts:70-252`
- Status: ✅ New service complete, legacy kept for compatibility

**3. Store Bootstrap:**
- Status: 🚧 Pending migration
- Still uses legacy direct calls

**4. Creative Ideas:**
- Status: 🚧 Pending migration
- Still uses legacy direct calls

### Code Locations

**Backend:**
- `apps/core/cardbey-core/src/ai/engines/` - New AI engines
- `apps/core/cardbey-core/src/orchestrator/services/` - New services
- `apps/core/cardbey-core/src/orchestrator/flows/` - Flows with feature flags

**Frontend:**
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/orchestratorClient.ts` - New client
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/orchestratorClient.ts:132-214` - Legacy mappers

### Migration Status
- ✅ AI engine interfaces complete
- ✅ Menu from Photo migrated (with legacy fallback)
- ✅ Loyalty from Card migrated (with legacy fallback)
- 🚧 Store Bootstrap pending
- 🚧 Creative Ideas pending
- 📋 **Migration Plan:** See `REFACTORING_PROGRESS.md`

---

## 4. Status Field Legacy

### Problem
**Status field inconsistency:**

| Status | Old Value | New Value | Status |
|--------|-----------|-----------|--------|
| **DraftStore.status** | `'failed'` | `'error'` | ⚠️ Migrating |
| **OrchestratorTask.status** | `'failed'` | `'error'` | ⚠️ Migrating |

### Migration Status

**Backend:**
- ✅ `DraftStore` now uses `'error'` (normalized from `'failed'`)
- ✅ `draftStoreService.js` updated
- ⚠️ Some endpoints still accept `'failed'` for backward compatibility
- ⚠️ Database may still have `'failed'` values

**Frontend:**
- ✅ Normalizes `'failed'` → `'error'` in `StoreReviewPage.tsx`
- ✅ Handles both values

### Code Locations

**Backend:**
- `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js` - Uses `'error'`
- `apps/core/cardbey-core/src/routes/stores.js:521-522,589-590,661-665` - Normalizes `'failed'` → `'error'`
- `apps/core/cardbey-core/src/routes/miRoutes.js:62-63,3094-3095` - Normalizes `'failed'` → `'error'`

**Frontend:**
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx:1786,2197` - Normalizes `'failed'` → `'error'`

### TODO
- ❌ Database migration to update existing `'failed'` → `'error'`
- ❌ Remove backward compatibility code after migration

---

## 5. API Response Format Legacy

### Problem
**Backward compatibility fields** in API responses:

| Field | Purpose | Status |
|-------|---------|--------|
| `products` (top-level) | Legacy compatibility | ⚠️ Still included |
| `categories` (top-level) | Legacy compatibility | ⚠️ Still included |
| `store` (top-level) | Legacy compatibility | ⚠️ Still included |
| `draft.products` | Legacy compatibility | ⚠️ Still included |
| `draft.items` | Legacy compatibility | ⚠️ Still included |

### Where It's Used

**Backend Endpoints:**
- `GET /api/stores/:id/draft` - Returns both new + legacy fields
- `GET /api/public/store/:id/draft` - Returns both new + legacy fields

**Example Response:**
```json
{
  "ok": true,
  "draft": {
    "catalog": {
      "products": [...],  // NEW FORMAT
      "categories": [...]
    }
  },
  "products": [...],  // LEGACY (same as draft.catalog.products)
  "categories": [...],  // LEGACY (same as draft.catalog.categories)
  "store": {...}  // LEGACY
}
```

### Code Locations

**Backend:**
- `apps/core/cardbey-core/src/routes/stores.js:807-821` - Legacy fields
- `apps/core/cardbey-core/src/routes/publicUsers.js:192-208` - Legacy fields

### Migration Status
- ⚠️ Legacy fields still included for backward compatibility
- 📋 **Migration Plan:** See `DRAFT_FORMAT_MIGRATION_STRATEGY.md`

---

## 6. Other Legacy Code

### Product Readiness Calculator

**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/utils/readiness.ts`

**Status:** ⚠️ Deprecated

**Replacement:** `apps/dashboard/cardbey-marketing-dashboard/src/utils/readiness/product.ts`

**Note:** Kept for backward compatibility, wraps new implementation

---

### Menu Image API

**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/api/menuImages.ts`

**Legacy Fields:**
- `thumbnailUrl` - Legacy field
- `scorePercent` - Legacy field (0-100)
- `attribution` - Legacy field
- `confidence` - Legacy field
- `updated` - Legacy field for backward compatibility

**Status:** ⚠️ Still used, but has legacy fields

---

### Promotion Creation

**Location:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Legacy Code:**
- Line 1573: `// Handle create promotion action (legacy - keep for backward compat)`
- Line 3407: `{/* Promotion Type Picker Modal (legacy - keep for backward compat) */}`

**Status:** ⚠️ Kept for backward compatibility

---

### SSE Headers

**Location:** `apps/core/cardbey-core/src/realtime/sse.js:78`

**Status:** ⚠️ Deprecated

**Note:** `@deprecated Use setupSseHeaders() instead - CORS is handled by middleware`

---

## 7. Tasks Using Legacy Code

### Active Tasks (Using Legacy)

| Task | Legacy Component | Status | Migration Plan |
|------|------------------|--------|----------------|
| **Store Drafts** | Draft format (legacy fields) | ⚠️ Partial | Phase 1-4 migration |
| **Menu from Photo** | AI orchestration (legacy fallback) | ⚠️ Partial | Feature flag migration |
| **Loyalty from Card** | AI orchestration (legacy fallback) | ⚠️ Partial | Feature flag migration |
| **Store Bootstrap** | AI orchestration (direct calls) | 🚧 Pending | Needs migration |
| **Public Previews** | Draft format (legacy fields) | ⚠️ Partial | Phase 1-4 migration |
| **Content Studio** | Draft data (legacy fields) | ⚠️ Partial | Phase 1-4 migration |
| **Device Pairing** | Screen model (frozen) | ✅ Frozen | Already frozen (410 Gone) |

### Completed Migrations

| Task | Old System | New System | Status |
|------|------------|------------|--------|
| **Device Pairing** | `POST /api/screens/pair/*` | `POST /api/device/*` | ✅ Complete (frozen) |
| **Menu from Photo** | Direct AI calls | AI engines | ✅ Complete (with fallback) |
| **Loyalty from Card** | Direct AI calls | AI engines | ✅ Complete (with fallback) |

---

## 8. Migration Priorities

### High Priority (Breaking Issues)

1. **Draft Format Consolidation** - Multiple formats causing "0 products" bugs
   - **Impact:** User-facing bugs
   - **Effort:** 5-7 weeks (gradual migration)
   - **Plan:** `DRAFT_FORMAT_MIGRATION_STRATEGY.md`

### Medium Priority (Technical Debt)

2. **Status Field Migration** - `'failed'` → `'error'`
   - **Impact:** Code consistency
   - **Effort:** 1-2 days (database migration)
   - **Plan:** SQL migration script

3. **AI Orchestration Migration** - Complete migration to AI engines
   - **Impact:** Code maintainability
   - **Effort:** 2-3 weeks (remaining tasks)
   - **Plan:** `REFACTORING_PROGRESS.md`

### Low Priority (Cleanup)

4. **Remove Legacy API Fields** - After draft format migration
   - **Impact:** Code simplicity
   - **Effort:** 1 week (after Phase 4)
   - **Plan:** Remove after all features migrated

5. **Remove Deprecated Code** - Dead code cleanup
   - **Impact:** Code clarity
   - **Effort:** 1-2 days
   - **Plan:** Remove unused functions

---

## 9. Key Insights

### Why Legacy Code Exists

1. **Gradual Evolution** - System evolved over time, not a big-bang rewrite
2. **Backward Compatibility** - Legacy code kept to avoid breaking existing features
3. **Feature Flags** - New systems introduced alongside old (gradual migration)
4. **Multiple Entry Points** - Different features use different formats

### The Real Problem

**Not "one legacy system"** but **architectural debt** from:
- Multiple response formats (draft)
- Dual models (Device vs Screen)
- Dual AI systems (engines vs direct calls)
- Status field inconsistency (`'failed'` vs `'error'`)

### Solution Strategy

**Gradual Migration** (not big-bang):
1. Keep legacy working
2. Add new format alongside
3. Migrate features one by one
4. Remove legacy only after migration

---

## 10. Next Steps

### Immediate Actions

1. ✅ **Document Legacy Code** - This document
2. 📋 **Draft Format Migration** - Start Phase 1 (backend standardization)
3. 📋 **Status Field Migration** - Database migration script
4. 📋 **AI Orchestration** - Complete remaining tasks

### Long-Term Actions

1. **Remove Legacy Fields** - After all features migrated
2. **Remove Deprecated Code** - Dead code cleanup
3. **Unify Models** - Single Device model (remove Screen)
4. **Single Format** - Only `draft.catalog.products` format

---

## 11. References

- **Draft Format Migration:** `DRAFT_FORMAT_MIGRATION_STRATEGY.md`
- **Device Pairing:** `LEGACY_PAIRING_FROZEN.md`
- **AI Orchestration:** `REFACTORING_PROGRESS.md`
- **Backend Migration:** `BACKEND_MIGRATION_ROADMAP.md`

---

**Last Updated:** 2026-01-11  
**Next Review:** After Phase 1 of draft format migration

