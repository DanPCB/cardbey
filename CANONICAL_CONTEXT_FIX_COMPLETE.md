# Canonical Context Fix - Complete

**Date:** 2025-01-28  
**Status:** ✅ All handlers updated to use canonical context

---

## ✅ Changes Applied

### 1. StoreDraftReview.tsx

**Added Imports:**
```typescript
import { getCanonicalContext, hasValidContext } from '@/lib/canonicalContext';
import FinishSetupModal from '@/components/FinishSetupModal';
```

**Added State:**
```typescript
const [finishSetupOpen, setFinishSetupOpen] = useState(false);
```

**Replaced Handler Logic:**
- ❌ **Before:** Read context from `baseDraft.tenantId/storeId` + `baseDraft.meta` + `user.id` + `jobId` (4 sources)
- ✅ **After:** Read context from `getCanonicalContext()` (single source of truth)

**New Handler:**
```typescript
const handleSmartUpgradeConfirm = useCallback(async (params) => {
  if (!selectedProductForPromo) return;

  setIsEmbedding(true);
  setSmartUpgradeModalOpen(false);

  try {
    // Get canonical context (single source of truth)
    const ctx = getCanonicalContext(); // {tenantId, storeId, jobId}
    const tenantId = ctx.tenantId;
    const storeId = ctx.storeId;

    // Hard block missing context (MVP rule)
    if (!tenantId || !storeId) {
      setFinishSetupOpen(true);
      throw new Error('STORE_CONTEXT_REQUIRED');
    }

    // Debug logging (gated by localStorage flag)
    const debugEnabled = typeof localStorage !== 'undefined' && 
      (localStorage.getItem('debugPromo') === 'true' || localStorage.getItem('cardbey.debug') === 'true');

    if (debugEnabled) {
      console.log('[StoreDraftReview] Promo context:', {
        tenantId,
        storeId,
        productId: selectedProductForPromo,
      });
    }

    // ✅ Single happy path
    const result = await createPromoFromProduct({
      tenantId,
      storeId,
      productId: selectedProductForPromo,
      environment: params.environment,
      format: params.format,
      goal: params.goal,
    });

    if (!result.ok || !result.instanceId) {
      throw new Error(result.error?.message || 'Failed to create promo');
    }

    // Navigate to editor
    navigate(`/app/creative-shell/edit/${result.instanceId}?source=promo&intent=promotion`);
    
    toast(t('contentStudio.smartUpgrade.success', 'Smart Promotion created! Opening editor...'), 'success');
  } catch (error: any) {
    console.error('[StoreDraftReview] Create promo failed:', error);

    // If missing context → modal already opened, keep messaging clean
    if (error?.message === 'STORE_CONTEXT_REQUIRED') {
      return;
    }

    toast(error?.message || t('contentStudio.smartUpgrade.errors.failed', 'Failed to create Smart Promotion'), 'error');
    setSmartUpgradeModalOpen(true);
  } finally {
    setIsEmbedding(false);
  }
}, [selectedProductForPromo, navigate, t]);
```

**Replaced Modal Validation:**
- ❌ **Before:** Computed `hasValidContext` from `baseDraft` + `jobId` with normalization hacks
- ✅ **After:** Uses `getCanonicalContext()` directly

```typescript
const ctx = getCanonicalContext();
const hasValidContext = !!(ctx.tenantId && ctx.storeId);
const contextError = !hasValidContext
  ? t('contentStudio.smartUpgrade.errors.finishStoreFirst', 'Finish creating the store first')
  : undefined;
```

**Added Modal:**
```typescript
<FinishSetupModal
  open={finishSetupOpen}
  onClose={() => setFinishSetupOpen(false)}
  tenantId={getCanonicalContext().tenantId}
/>
```

---

### 2. MenuPage.jsx

**Added Imports:**
```typescript
import { getCanonicalContext } from '../../lib/canonicalContext';
import FinishSetupModal from '../../components/FinishSetupModal';
```

**Added State:**
```typescript
const [finishSetupOpen, setFinishSetupOpen] = useState(false);
```

**Replaced Context Logic:**
- ❌ **Before:** `getActiveContext({ user, stores })` + `user?.id` + `storeId` (3 sources)
- ✅ **After:** `getCanonicalContext()` (single source of truth)

**New Handler:**
```typescript
onConfirm={async (params) => {
  setSmartUpgradeModalOpen(false);
  setIsEmbedding(true);

  try {
    // Get canonical context (single source of truth)
    const ctx = getCanonicalContext();
    const tenantId = ctx.tenantId;
    const contextStoreId = ctx.storeId;

    // Hard block missing context (MVP rule)
    if (!tenantId || !contextStoreId) {
      setFinishSetupOpen(true);
      setIsEmbedding(false);
      return;
    }

    // Call canonical promo from product endpoint
    const result = await createPromoFromProduct({
      tenantId,
      storeId: contextStoreId,
      productId: selectedItemForPromo.id,
      environment: params.environment,
      format: params.format,
      goal: params.goal,
    });

    if (!result.ok || !result.instanceId) {
      throw new Error(result.error?.message || 'Failed to create promo');
    }

    // Navigate to editor
    navigate(`/app/creative-shell/edit/${result.instanceId}?source=menu&intent=promotion`);
    
    toast('Smart Promotion created! Opening editor...', 'success');
  } catch (error) {
    console.error('[MenuPage] Create promo failed:', error);
    const errorMessage = error?.message || 'Failed to create Smart Promotion';
    
    toast(errorMessage, 'error');
    setSmartUpgradeModalOpen(true); // Re-open modal on error
  } finally {
    setIsEmbedding(false);
    setSelectedItemForPromo(null);
  }
}}
```

**Added Modal:**
```typescript
<FinishSetupModal
  open={finishSetupOpen}
  onClose={() => setFinishSetupOpen(false)}
  tenantId={getCanonicalContext().tenantId}
/>
```

---

### 3. TypeScript Syntax in .js Files

**Status:** ✅ Already fixed - No `as any` found in routes directory

The code at `miRoutes.js:658` is:
```javascript
const resultJson = job.resultJson;
const storeDraft = resultJson?.storeDraft;
```

This is valid JavaScript (no TypeScript syntax).

---

## 🎯 Results

### Before
- **StoreDraftReview:** 4 context sources (baseDraft, meta, user, jobId) → inconsistent, sometimes null
- **MenuPage:** 3 context sources (getActiveContext, user, storeId) → inconsistent, sometimes null
- **Error Handling:** Toast only → user doesn't know how to fix
- **Result:** "Missing tenant or store context" errors

### After
- **StoreDraftReview:** 1 context source (`getCanonicalContext()`) → consistent, always correct
- **MenuPage:** 1 context source (`getCanonicalContext()`) → consistent, always correct
- **Error Handling:** FinishSetupModal → clear action to fix
- **Result:** No more "Missing tenant or store context" errors

---

## 📋 Files Changed

1. `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
   - Added canonical context imports
   - Added FinishSetupModal
   - Replaced handler logic
   - Replaced modal validation

2. `apps/dashboard/cardbey-marketing-dashboard/src/pages/menu/MenuPage.jsx`
   - Added canonical context imports
   - Added FinishSetupModal
   - Replaced context logic in onConfirm

---

## 🧪 Testing

### Test 1: Missing Context
1. Clear localStorage: `localStorage.clear()`
2. Navigate to Review page or Menu page
3. Click "Create Smart Promotion"
4. **Expected:** FinishSetupModal appears (not toast)
5. **Expected:** "Resume Setup" button works
6. **Expected:** "Open API Settings" button works

### Test 2: Valid Context
1. Create business → context stored in localStorage
2. Navigate to Review page
3. Click "Create Smart Promotion"
4. **Expected:** No modal, promo creation succeeds
5. **Expected:** Navigates to editor

### Test 3: Context Consistency
1. Create business → verify context in localStorage
2. Navigate to Menu page
3. Click "Create Smart Promotion"
4. **Expected:** Uses same context, no errors

---

## ✅ Acceptance Criteria

- ✅ Single canonical context source (`getCanonicalContext()`)
- ✅ FinishSetupModal shown when context missing (not toast)
- ✅ No more "Missing tenant or store context" errors
- ✅ Consistent behavior across StoreDraftReview and MenuPage
- ✅ No TypeScript syntax in .js files

---

**Status:** ✅ Complete - Both handlers now use canonical context with blocking modal UX.




