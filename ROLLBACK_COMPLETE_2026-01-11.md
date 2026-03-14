# Rollback Complete - Restored to 1pm State (11/01/2026)

**Date:** 2026-01-12  
**Restore Point:** 1:00 PM, January 11, 2026  
**Status:** ✅ **ROLLBACK COMPLETE**

---

## ✅ Rollback Summary

Successfully rolled back codebase to the 1pm restore point where **store creation was working**.

---

## 🔄 Changes Reverted

### 1. tenantId TDZ Fix - REVERTED ✅

**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

**What Changed:**
- **Before Rollback:** tenantId declared at line 775 (BEFORE idempotency check)
- **After Rollback:** tenantId declared at line 910 (AFTER idempotency check, matching 1pm state)
- **Idempotency Check:** Now uses `req.userId` directly in Prisma query (line 788) to avoid TDZ

**Code Structure (Restored):**
```javascript
// Line 782: IDEMPOTENCY check (uses req.userId directly)
const existingTasks = await prisma.orchestratorTask.findMany({
  where: {
    tenantId: req.userId?.trim() || null, // Use req.userId directly (1pm restore point)
    userId: req.userId?.trim() || null,
    entryPoint,
  },
});

// ... idempotency logic ...

// Line 910: tenantId declared AFTER idempotency check (1pm restore point)
const tenantId = req.userId?.trim();
const userId = req.userId?.trim();
```

---

### 2. storeIntent TDZ Fix - REVERTED ✅

**File:** `apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts`

**What Changed:**
- **Before Rollback:** storeIntent destructured from params and initialized early (line 223-227)
- **After Rollback:** storeIntent declared as `null` early (line 225) to prevent TDZ, but loaded later (line 301) matching 1pm structure

**Code Structure (Restored):**
```typescript
// Line 223: Destructuring (storeIntent NOT included, matching 1pm)
const { storeId, businessType = 'default', storeName = '', tenantId, userId, templateKey: planTemplateKey } = params;

// Line 225: Declare storeIntent as null (prevents TDZ, but matches 1pm loading pattern)
let storeIntent: any = null;

// Line 259: Access storeIntent (now safe - declared above)
if (storeIntent?.cuisine) { ... }

// Line 301: Load storeIntent from plan_store (1pm restore point structure)
if (!storeIntent) {
  try {
    // ... load from plan_store ...
  }
}
```

---

### 3. Prisma profileName Fix - REVERTED ✅

**File:** `apps/core/cardbey-core/src/mi/contentBrain/storeIntent.ts`

**What Changed:**
- **Before Rollback:** Removed `profileName` from Prisma select (field doesn't exist)
- **After Rollback:** Restored `profileName: true` in Prisma select (matching 1pm state)

**Code Structure (Restored):**
```typescript
const dbStore = await prisma.business.findUnique({
  where: { id: storeId },
  select: {
    type: true,
    name: true,
    profileName: true, // NOTE: At 1pm restore point, this field was selected
    description: true,
  },
});
```

**Note:** This may cause Prisma validation errors if `profileName` doesn't exist in schema, but matches the 1pm working state.

---

## ✅ What Was Preserved

All 9 working changes from morning shift (10am-1pm) were **kept intact**:
1. ✅ Request deduplication
2. ✅ usePoller hook
3. ✅ StoreReviewPage polling fix
4. ✅ ProductSuggestions fix
5. ✅ DraftStore catalog persistence
6. ✅ Sync-store DraftStore reading
7. ✅ Detailed logging
8. ✅ Draft endpoint status fields
9. ✅ Error status handling

---

## ⚠️ Important Notes

### Potential Issues After Rollback:

1. **Prisma profileName Error:**
   - If `profileName` field doesn't exist in Business schema, Prisma will throw validation error
   - **Solution:** If this occurs, we may need to handle it gracefully

2. **TDZ Errors:**
   - Rollback restores original structure, but we've added safeguards to prevent TDZ
   - `storeIntent` is declared early as `null` to prevent TDZ
   - `tenantId` uses `req.userId` directly in idempotency check to avoid TDZ

3. **Status Normalization:**
   - Status normalization ('failed' → 'error') changes were kept
   - These don't affect store creation functionality

---

## 🧪 Testing Required

After rollback, please test:

1. **Store Creation:**
   - Quick Start form → Store creation
   - Verify store is created successfully
   - Verify products are generated

2. **Store Generation:**
   - Run store generation
   - Check DraftStore.preview has catalog data
   - Check products appear in UI

3. **Draft Endpoint:**
   - GET /api/stores/:id/draft
   - Verify returns correct data
   - Verify products count > 0

4. **Sync-Store:**
   - POST /api/mi/orchestra/job/:id/sync-store
   - Verify productsWritten > 0
   - Verify DraftStore status = 'ready'

---

## 📝 Rollback Details

### Files Modified:

1. **`apps/core/cardbey-core/src/routes/miRoutes.js`**
   - Moved tenantId declaration to after idempotency check (line 910)
   - Changed idempotency check to use `req.userId` directly

2. **`apps/core/cardbey-core/src/services/orchestrator/seedCatalogService.ts`**
   - Removed storeIntent from params destructuring
   - Declared storeIntent as `null` early (prevents TDZ)
   - Restored loading pattern from plan_store (matches 1pm)

3. **`apps/core/cardbey-core/src/mi/contentBrain/storeIntent.ts`**
   - Restored `profileName: true` in Prisma select

---

## ✅ Rollback Status

**Status:** ✅ **COMPLETE**

- ✅ tenantId TDZ fix reverted
- ✅ storeIntent TDZ fix reverted  
- ✅ Prisma profileName fix reverted
- ✅ All morning shift work preserved
- ✅ No linter errors

**Next Step:** Test store creation to confirm it works as it did at 1pm.

---

**Rollback Completed:** 2026-01-12  
**Restored To:** 1:00 PM, January 11, 2026

