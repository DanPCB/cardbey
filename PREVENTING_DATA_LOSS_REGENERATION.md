# Preventing Data Loss in Data Transformation Pipelines

## Problem Summary

**Issue**: Store name "Union Road Florist" was correctly returned by the backend but lost during frontend data transformation, resulting in "Untitled Store" being displayed.

**Root Causes**:
1. **Multiple transformation layers** without validation between them
2. **Missing type safety** - `StoreDraft` interface didn't require `store` property
3. **Silent data loss** - transformations dropped fields without warnings
4. **No contract tests** for critical data paths
5. **Insufficient debug logging** to trace data flow

## Prevention Strategies

### 1. **Contract Validation & Runtime Assertions**

#### A. Enhanced `assertNormalizedDraft` Function

**Location**: `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/draftModel.ts`

**Current**: Only warns in dev mode, doesn't check `meta.storeName`

**Improvement**:
```typescript
export function assertNormalizedDraft(draft: NormalizedDraft): void {
  const isDebug = typeof window !== 'undefined' && localStorage.getItem('cardbey.debug') === 'true';
  
  const errors: string[] = [];
  const warnings: string[] = [];

  // CRITICAL: Fail-fast on missing required fields
  if (!draft.store.id || draft.store.id === '') {
    errors.push('store.id is missing or empty');
  }
  
  // CRITICAL: Check for "Untitled Store" default (indicates data loss)
  if (draft.store.name === 'Untitled Store' && draft.meta.storeName && draft.meta.storeName !== 'Untitled Store') {
    errors.push(`store.name is "Untitled Store" but meta.storeName is "${draft.meta.storeName}" - data loss detected!`);
  }
  
  // CRITICAL: Ensure meta.storeName matches store.name (or is set correctly)
  if (draft.meta.storeName && draft.meta.storeName !== draft.store.name) {
    warnings.push(`meta.storeName ("${draft.meta.storeName}") doesn't match store.name ("${draft.store.name}")`);
  }
  
  // CRITICAL: Check that store property exists (prevents crashes)
  if (!draft.store) {
    errors.push('store property is missing');
  }

  if (!Array.isArray(draft.catalog.products)) {
    errors.push('catalog.products is not an array');
  }
  if (!Array.isArray(draft.catalog.categories)) {
    errors.push('catalog.categories is not an array');
  }
  
  // In production, log errors but don't throw (graceful degradation)
  // In dev, throw to fail-fast
  if (errors.length > 0) {
    const errorMsg = `[draftModel][CONTRACT_VIOLATION] ${errors.join('; ')}`;
    if (isDebug || import.meta.env.DEV) {
      console.error(errorMsg, { draft, errors, warnings });
      // In dev, throw to catch issues early
      if (import.meta.env.DEV) {
        throw new Error(errorMsg);
      }
    } else {
      // In production, log but continue (with degraded experience)
      console.error(errorMsg, { storeId: draft.store.id, errors });
    }
  }

  if (warnings.length > 0 && (isDebug || import.meta.env.DEV)) {
    console.warn('[draftModel][CONTRACT_WARNING]', {
      storeId: draft.store.id,
      storeName: draft.store.name,
      metaStoreName: draft.meta.storeName,
      warnings,
    });
  }
}
```

#### B. Add Validation at Each Transformation Layer

**Location**: `apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`

**Add after `normalizeDraftResponse`**:
```typescript
const normalizeDraftResponse = (response: any, fallbackStoreId?: string) => {
  const normalized = normalizeDraft(response);
  
  // CRITICAL: Validate that storeName was preserved
  const backendStoreName = response?.draft?.meta?.storeName || response?.store?.name;
  if (backendStoreName && backendStoreName !== 'Untitled Store') {
    if (normalized.store.name === 'Untitled Store' || normalized.meta.storeName === 'Untitled Store') {
      console.error('[normalizeDraftResponse] DATA LOSS DETECTED:', {
        backendStoreName,
        normalizedStoreName: normalized.store.name,
        normalizedMetaStoreName: normalized.meta.storeName,
        responseKeys: Object.keys(response || {}),
        draftKeys: response?.draft ? Object.keys(response.draft) : [],
      });
      // Attempt recovery: use backend value
      normalized.store.name = backendStoreName;
      normalized.meta.storeName = backendStoreName;
    }
  }
  
  // ... rest of function
};
```

### 2. **Type Safety Improvements**

#### A. Make `StoreDraft` Interface Strict

**Location**: `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/storeDraftPatch.ts`

**Current**: `StoreDraft` has `[key: string]: any` which allows missing properties

**Improvement**:
```typescript
export interface StoreDraft {
  version: "v1" | "1.0" | "1" | "1.1";
  createdAt: string;
  // CRITICAL: Make store required (prevents crashes)
  store: {
    id: string;
    name: string;
    type?: string;
    tenantId?: string;
    profileAvatarUrl?: string | null;
    profileHeroUrl?: string | null;
    profileHeroVideoUrl?: string | null;
  };
  meta: {
    storeId: string;
    storeName: string; // CRITICAL: Required, not optional
    storeType?: string;
    tenantId?: string;
    // ... other fields
  };
  catalog: {
    categories: Array<{...}>;
    products: Array<{...}>;
  };
  assets: Array<{...}>;
  // Remove [key: string]: any to prevent accidental property access
}
```

#### B. Add Type Guards

**Location**: `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/draftModel.ts`

```typescript
/**
 * Type guard to ensure draft has required properties
 */
export function isValidNormalizedDraft(draft: unknown): draft is NormalizedDraft {
  if (!draft || typeof draft !== 'object') return false;
  const d = draft as any;
  return (
    d.store &&
    typeof d.store.id === 'string' &&
    typeof d.store.name === 'string' &&
    d.store.name !== 'Untitled Store' && // CRITICAL: Reject default value
    d.meta &&
    typeof d.meta.storeId === 'string' &&
    typeof d.meta.storeName === 'string' &&
    d.catalog &&
    Array.isArray(d.catalog.products) &&
    Array.isArray(d.catalog.categories)
  );
}
```

### 3. **Integration Tests for Critical Data Paths**

#### A. Add Contract Test for Store Name Preservation

**Location**: `apps/dashboard/cardbey-marketing-dashboard/src/api/__tests__/storeDraftResponse.contract.test.ts`

**Add test**:
```typescript
describe('Store Name Preservation', () => {
  it('should preserve storeName from draft.meta.storeName through normalization', () => {
    const backendResponse = {
      ok: true,
      draftFound: true,
      draft: {
        meta: {
          storeId: 'test-store-123',
          storeName: 'Union Road Florist', // CRITICAL: Backend provides this
          storeType: 'florist',
        },
        catalog: {
          products: [],
          categories: [],
        },
      },
      store: {
        id: 'test-store-123',
        name: 'Union Road Florist',
      },
    };

    const normalized = normalizeDraft(backendResponse);
    
    // CRITICAL: Assertions
    expect(normalized.store.name).toBe('Union Road Florist');
    expect(normalized.meta.storeName).toBe('Union Road Florist');
    expect(normalized.store.name).not.toBe('Untitled Store');
    expect(normalized.meta.storeName).not.toBe('Untitled Store');
  });

  it('should preserve storeName when creating StoreDraft', () => {
    const normalized = {
      store: { id: 'test-123', name: 'Union Road Florist' },
      meta: { storeId: 'test-123', storeName: 'Union Road Florist' },
      catalog: { products: [], categories: [] },
    };

    const storeData = {
      store: normalized.store,
      products: [],
      categories: [],
      meta: normalized.meta, // CRITICAL: Must include meta
    };

    // Simulate StoreDraft creation
    const normalizedMeta = storeData.meta || {};
    const storeDraft = {
      meta: {
        storeName: normalizedMeta.storeName || storeData.store.name,
      },
      store: {
        name: normalizedMeta.storeName || storeData.store.name,
      },
    };

    expect(storeDraft.meta.storeName).toBe('Union Road Florist');
    expect(storeDraft.store.name).toBe('Union Road Florist');
  });
});
```

### 4. **Data Flow Tracing & Debugging**

#### A. Add Pipeline Tracing

**Location**: `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/draftModel.ts`

**Enhance logging**:
```typescript
export function normalizeDraft(input: unknown): NormalizedDraft {
  // ... existing code ...
  
  // CRITICAL: Trace data flow for debugging
  const traceId = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const isDebug = typeof window !== 'undefined' && localStorage.getItem('cardbey.debug') === 'true';
  
  if (isDebug) {
    console.log(`[DRAFT_TRACE][${traceId}] INPUT:`, {
      hasOk: raw.ok !== undefined,
      hasDraft: !!raw.draft,
      hasDraftMeta: !!raw.draft?.meta,
      draftMetaStoreName: raw.draft?.meta?.storeName,
      hasStore: !!raw.store,
      storeName: raw.store?.name,
    });
  }
  
  // ... normalization logic ...
  
  if (isDebug) {
    console.log(`[DRAFT_TRACE][${traceId}] OUTPUT:`, {
      storeName: normalized.store.name,
      metaStoreName: normalized.meta.storeName,
      dataLoss: normalized.store.name === 'Untitled Store' && raw.draft?.meta?.storeName && raw.draft.meta.storeName !== 'Untitled Store',
    });
  }
  
  return normalized;
}
```

#### B. Add Component-Level Validation

**Location**: `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

**Add to `effectiveDraft` useMemo**:
```typescript
const effectiveDraft = useMemo(() => {
  const draft = applyPatchToDraft(baseDraft, patch);
  
  // CRITICAL: Validate store name is present
  if (!draft.meta?.storeName && !draft.store?.name) {
    console.error('[StoreDraftReview] Missing store name in draft:', {
      hasMeta: !!draft.meta,
      hasStore: !!draft.store,
      metaKeys: draft.meta ? Object.keys(draft.meta) : [],
      storeKeys: draft.store ? Object.keys(draft.store) : [],
    });
  }
  
  // CRITICAL: Warn if store name is default
  if (draft.meta?.storeName === 'Untitled Store' || draft.store?.name === 'Untitled Store') {
    console.warn('[StoreDraftReview] Store name is default "Untitled Store" - possible data loss');
  }
  
  // ... rest of logic
}, [baseDraft, patch, uploadedVisuals]);
```

### 5. **Automated Regression Tests**

#### A. Add E2E Test for Store Name Display

**Location**: `apps/dashboard/cardbey-marketing-dashboard/tests/e2e/store-review-grid.spec.ts`

**Add test**:
```typescript
test('store name is displayed correctly from backend', async ({ page }) => {
  // Mock backend response with specific store name
  await page.route('**/api/stores/*/draft', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        draftFound: true,
        draft: {
          meta: {
            storeId: 'test-store',
            storeName: 'Union Road Florist', // CRITICAL: Specific name
          },
          catalog: { products: [], categories: [] },
        },
      }),
    });
  });

  await page.goto('/app/store/test-store/review?mode=draft');
  
  // CRITICAL: Assert store name is displayed
  await expect(page.locator('text=Union Road Florist')).toBeVisible();
  await expect(page.locator('text=Untitled Store')).not.toBeVisible();
});
```

### 6. **Code Review Checklist**

Add to PR template or review checklist:

```markdown
## Data Transformation Checklist

- [ ] Does this change affect data normalization? If yes:
  - [ ] Added/updated contract tests?
  - [ ] Verified data flows through all transformation layers?
  - [ ] Added debug logging for data tracing?
  - [ ] Checked that required fields are preserved?

- [ ] Does this change affect StoreDraft structure? If yes:
  - [ ] Updated TypeScript interface?
  - [ ] Added validation for new required fields?
  - [ ] Updated all places where StoreDraft is created?

- [ ] Does this change affect API responses? If yes:
  - [ ] Verified frontend can handle the new shape?
  - [ ] Added fallback for missing fields?
  - [ ] Tested with real backend response?
```

### 7. **Monitoring & Alerts**

#### A. Add Production Monitoring

**Location**: `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/draftModel.ts`

```typescript
// In production, log data loss events to monitoring service
if (import.meta.env.PROD && normalized.store.name === 'Untitled Store' && raw.draft?.meta?.storeName) {
  // Send to error tracking service (e.g., Sentry)
  if (typeof window !== 'undefined' && (window as any).Sentry) {
    (window as any).Sentry.captureMessage('Store name data loss detected', {
      level: 'warning',
      extra: {
        backendStoreName: raw.draft.meta.storeName,
        normalizedStoreName: normalized.store.name,
        storeId: normalized.store.id,
      },
    });
  }
}
```

### 8. **Documentation**

#### A. Document Data Flow

**Create**: `apps/dashboard/cardbey-marketing-dashboard/docs/DATA_FLOW.md`

```markdown
# Draft Data Flow

## Backend → Frontend Pipeline

1. **Backend Response** (`/api/stores/:id/draft`)
   - Returns: `{ ok: true, draft: { meta: { storeName: "..." }, ... } }`
   - **CRITICAL**: `draft.meta.storeName` is the source of truth

2. **normalizeDraft()** (`draftModel.ts`)
   - Input: Backend response
   - Output: `NormalizedDraft` with `store.name` and `meta.storeName`
   - **CRITICAL**: Must preserve `draft.meta.storeName` → `meta.storeName`

3. **normalizeDraftResponse()** (`StoreReviewPage.tsx`)
   - Input: `NormalizedDraft`
   - Output: `{ store, products, categories, meta }`
   - **CRITICAL**: Must include `meta` object

4. **StoreDraft Creation** (`StoreReviewPage.tsx`)
   - Input: `{ store, products, categories, meta }`
   - Output: `StoreDraft` with `meta.storeName` and `store.name`
   - **CRITICAL**: Must use `normalizedMeta.storeName`

5. **Component Usage** (`StoreDraftReview.tsx`)
   - Reads: `effectiveDraft.meta?.storeName` or `effectiveDraft.store?.name`
   - **CRITICAL**: Both must be set and match

## Validation Points

- ✅ Backend returns `draft.meta.storeName`
- ✅ `normalizeDraft` preserves it in `meta.storeName`
- ✅ `normalizeDraftResponse` includes `meta` in return value
- ✅ `StoreDraft` creation uses `normalizedMeta.storeName`
- ✅ Component can read from either `meta.storeName` or `store.name`
```

## Implementation Priority

1. **High Priority** (Do First):
   - ✅ Enhanced `assertNormalizedDraft` with data loss detection
   - ✅ Add `store` property requirement to `StoreDraft` interface
   - ✅ Add contract test for store name preservation

2. **Medium Priority** (Do Soon):
   - Add validation at each transformation layer
   - Add type guards
   - Enhance debug logging

3. **Low Priority** (Nice to Have):
   - E2E tests
   - Production monitoring
   - Comprehensive documentation

## Quick Wins

1. **Add this check to `assertNormalizedDraft`** (5 minutes):
```typescript
if (draft.store.name === 'Untitled Store' && draft.meta.storeName && draft.meta.storeName !== 'Untitled Store') {
  console.error('[CONTRACT_VIOLATION] Store name data loss detected!');
}
```

2. **Add this to PR template** (2 minutes):
```markdown
- [ ] Verified store name is preserved through data transformations?
```

3. **Add this debug log** (3 minutes):
```typescript
console.log('[DRAFT_TRACE]', {
  input: raw.draft?.meta?.storeName,
  output: normalized.meta.storeName,
  dataLoss: normalized.meta.storeName === 'Untitled Store' && raw.draft?.meta?.storeName !== 'Untitled Store',
});
```

## Summary

The key to preventing this issue is:
1. **Validate at boundaries** - Check data at each transformation layer
2. **Fail fast in dev** - Throw errors in development to catch issues early
3. **Type safety** - Use TypeScript to prevent missing properties
4. **Contract tests** - Test critical data paths automatically
5. **Trace data flow** - Log transformations to debug issues quickly

By implementing these strategies, similar data loss issues will be caught during development or testing, not in production.

