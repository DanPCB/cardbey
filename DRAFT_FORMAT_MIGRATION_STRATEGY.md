# Draft Format Migration Strategy

## Problem Statement

The Cardbey system has **multiple draft response formats** used across different features:
- Legacy: `response.products`, `draft.products`, `draft.items`
- New: `draft.catalog.products`

**Current State:**
- `normalizeDraft()` handles both formats (compatibility layer)
- Backend sends both formats (backward compatibility)
- Frontend reads both formats (fallback logic)
- **Result:** Complexity, bugs, and fixes that don't stick

**Why We Can't Just Remove Legacy:**
- Store drafts (products, categories, metadata)
- Menu from photo (extracts menu items)
- Loyalty from card (loyalty program generation)
- Store bootstrap (quick store creation)
- Public store previews
- Content studio drafts (promotions, templates)
- Store patches/edits

## Solution: Gradual Migration with Feature Flags

### Phase 1: Standardize Backend (Week 1-2)

**Goal:** Backend always sends new format, but includes legacy fields for compatibility

**Changes:**
1. Update all draft endpoints to return `draft.catalog.products` as primary
2. Keep legacy fields (`products`, `draft.products`) for backward compatibility
3. Add feature flag: `USE_NEW_DRAFT_FORMAT_ONLY=false` (default: false)

**Files to Update:**
- `apps/core/cardbey-core/src/routes/stores.js` (draft endpoint)
- `apps/core/cardbey-core/src/routes/publicUsers.js` (public draft endpoint)
- `apps/core/cardbey-core/src/routes/miRoutes.js` (sync-store response)
- `apps/core/cardbey-core/src/routes/draftStore.js` (draft store operations)

**Implementation:**
```javascript
// Backend: Always send new format + legacy fields
res.json({
  ok: true,
  draft: {
    meta: { ... },
    catalog: {
      products: [...],  // NEW FORMAT (primary)
      categories: [...],
    },
  },
  // Legacy fields (for backward compatibility)
  products: [...],  // Same as draft.catalog.products
  categories: [...],  // Same as draft.catalog.categories
});
```

### Phase 2: Update Frontend to Prefer New Format (Week 2-3)

**Goal:** Frontend reads new format first, falls back to legacy only if needed

**Changes:**
1. Update `normalizeDraft()` to prioritize new format
2. Add logging when legacy format is used (to track migration progress)
3. Add feature flag: `PREFER_NEW_DRAFT_FORMAT=true` (default: true)

**Files to Update:**
- `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/draftModel.ts`

**Implementation:**
```typescript
// Frontend: Prioritize new format, log legacy usage
export function normalizeDraft(input: unknown): NormalizedDraft {
  const raw = input as any;
  
  // Priority 1: NEW FORMAT (preferred)
  if (raw.draft?.catalog?.products) {
    return {
      store: extractStore(raw),
      catalog: {
        products: raw.draft.catalog.products,
        categories: raw.draft.catalog.categories || [],
      },
      meta: extractMeta(raw),
    };
  }
  
  // Priority 2: LEGACY FORMAT (fallback with warning)
  if (raw.products || raw.draft?.products) {
    if (import.meta.env.DEV) {
      console.warn('[normalizeDraft] Using legacy format - migration needed', {
        hasProducts: !!raw.products,
        hasDraftProducts: !!raw.draft?.products,
        endpoint: raw.endpoint || 'unknown',
      });
    }
    // ... legacy parsing
  }
  
  // ... rest of normalization
}
```

### Phase 3: Migrate Features One by One (Week 3-6)

**Strategy:** Migrate each feature to new format, test, then remove legacy support

**Migration Order:**
1. ✅ **Store Drafts** (already using new format via `normalizeDraft`)
2. 🔄 **Menu from Photo** (check if using legacy)
3. 🔄 **Loyalty from Card** (check if using legacy)
4. 🔄 **Store Bootstrap** (check if using legacy)
5. 🔄 **Public Previews** (check if using legacy)
6. 🔄 **Content Studio** (check if using legacy)

**For Each Feature:**
1. Update backend endpoint to send new format
2. Update frontend to read new format
3. Test thoroughly
4. Remove legacy fallback for that feature
5. Add to migration checklist

### Phase 4: Remove Legacy Support (Week 6-8)

**Goal:** Remove all legacy format support after all features migrated

**Steps:**
1. Set feature flag: `USE_NEW_DRAFT_FORMAT_ONLY=true`
2. Remove legacy fields from backend responses
3. Remove legacy parsing from `normalizeDraft()`
4. Update all endpoints to only send new format
5. Test all features
6. Remove feature flags

## Implementation Plan

### Step 1: Create Migration Helper

**File:** `apps/core/cardbey-core/src/utils/draftFormatMigration.js`

```javascript
/**
 * Draft Format Migration Helper
 * Ensures backward compatibility during migration
 */

const USE_NEW_FORMAT_ONLY = process.env.USE_NEW_DRAFT_FORMAT_ONLY === 'true';

/**
 * Format draft response with both new and legacy formats
 * @param {Object} draft - Draft data in new format
 * @returns {Object} Response with both formats
 */
export function formatDraftResponse(draft) {
  const newFormat = {
    ok: true,
    draft: {
      meta: draft.meta,
      catalog: {
        products: draft.catalog?.products || [],
        categories: draft.catalog?.categories || [],
      },
    },
  };
  
  // Add legacy fields for backward compatibility (unless flag is set)
  if (!USE_NEW_FORMAT_ONLY) {
    newFormat.products = draft.catalog?.products || [];
    newFormat.categories = draft.catalog?.categories || [];
    newFormat.store = draft.store;
  }
  
  return newFormat;
}
```

### Step 2: Update All Backend Endpoints

**Pattern:**
```javascript
// Before:
res.json({
  ok: true,
  products: products,
  categories: categories,
});

// After:
const { formatDraftResponse } = require('../utils/draftFormatMigration');
res.json(formatDraftResponse({
  meta: { storeId, ... },
  catalog: { products, categories },
  store: { id, name, ... },
}));
```

### Step 3: Update Frontend Normalization

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/draftModel.ts`

```typescript
// Add migration tracking
const MIGRATION_TRACKING = {
  legacyUsageCount: 0,
  newFormatUsageCount: 0,
};

export function normalizeDraft(input: unknown): NormalizedDraft {
  const raw = input as any;
  
  // Priority 1: NEW FORMAT
  if (raw.draft?.catalog?.products) {
    MIGRATION_TRACKING.newFormatUsageCount++;
    return normalizeFromNewFormat(raw);
  }
  
  // Priority 2: LEGACY FORMAT (with tracking)
  if (raw.products || raw.draft?.products) {
    MIGRATION_TRACKING.legacyUsageCount++;
    if (import.meta.env.DEV) {
      console.warn('[MIGRATION] Legacy format detected', {
        count: MIGRATION_TRACKING.legacyUsageCount,
        endpoint: raw.endpoint || 'unknown',
      });
    }
    return normalizeFromLegacyFormat(raw);
  }
  
  // ... fallback
}
```

### Step 4: Add Migration Dashboard (Optional)

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/admin/MigrationDashboard.tsx`

Track migration progress:
- Features using new format
- Features using legacy format
- Migration completion percentage
- Endpoints still sending legacy format

## Testing Strategy

### For Each Phase:

1. **Backward Compatibility Test:**
   - Old clients can still read responses
   - New clients prefer new format
   - Both formats work simultaneously

2. **Feature-Specific Tests:**
   - Store drafts work
   - Menu from photo works
   - Loyalty from card works
   - Store bootstrap works
   - Public previews work
   - Content studio works

3. **Regression Tests:**
   - No features break
   - No data loss
   - Performance doesn't degrade

## Rollback Plan

If migration causes issues:

1. Set feature flag: `USE_NEW_DRAFT_FORMAT_ONLY=false`
2. Backend resumes sending legacy fields
3. Frontend resumes using legacy parsing
4. Fix issues
5. Retry migration

## Success Criteria

✅ **Phase 1 Complete:**
- All endpoints send new format
- Legacy fields still included
- No features break

✅ **Phase 2 Complete:**
- Frontend prefers new format
- Legacy fallback works
- Migration tracking shows progress

✅ **Phase 3 Complete:**
- All features migrated
- Legacy usage = 0%
- All tests pass

✅ **Phase 4 Complete:**
- Legacy code removed
- Single format throughout
- Simpler codebase

## Timeline

| Phase | Duration | Risk | Dependencies |
|-------|----------|------|--------------|
| Phase 1: Backend Standardization | 1-2 weeks | Low | None |
| Phase 2: Frontend Update | 1 week | Low | Phase 1 |
| Phase 3: Feature Migration | 2-3 weeks | Medium | Phase 2 |
| Phase 4: Legacy Removal | 1 week | Medium | Phase 3 |

**Total:** 5-7 weeks with gradual rollout

## Benefits

1. **No Breaking Changes:** Legacy code works during migration
2. **Gradual Migration:** One feature at a time
3. **Easy Rollback:** Feature flags allow quick revert
4. **Clear Progress:** Migration tracking shows status
5. **Simpler Codebase:** Eventually single format

## Next Steps

1. ✅ Create migration helper utility
2. ✅ Update backend endpoints (Phase 1)
3. ✅ Update frontend normalization (Phase 2)
4. 🔄 Migrate features one by one (Phase 3)
5. 🔄 Remove legacy code (Phase 4)

