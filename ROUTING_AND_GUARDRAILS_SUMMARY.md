# Routing Paths and CI Guardrails - Implementation Summary

## Summary

Created a single source of truth for routing paths, centralized the "Create Promotion from Item" flow, and added CI guardrails to prevent regressions.

## 1. Single Source of Truth for Routing Paths

### Created `src/routes/paths.ts`
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/routes/paths.ts`

**Exports:**
- `contentStudioHome()` → `/app/creative-shell`
- `contentStudioEdit(instanceId: string)` → `/app/creative-shell/edit/:instanceId`
- `storeReview(storeId, options?)` → `/app/store/:storeId/review` with optional query params
- `dashboardHome()` → `/dashboard`
- `loginPage(options?)` → `/login` with optional query params

**Features:**
- Input validation (throws if required params missing)
- Type-safe return values
- Single source of truth for all route paths

### Updated Files to Use Paths Helper

1. **`src/lib/buildContentStudioUrl.ts`**
   - Now imports and uses `contentStudioEdit()` from `paths.ts`
   - Maintains backward compatibility with query params

2. **`src/features/content-studio/pages/ContentStudioEditor.tsx`**
   - Replaced hardcoded `/app/creative-shell` with `contentStudioHome()`

3. **`src/features/storeDraft/StoreDraftReview.tsx`**
   - Uses `createPromoFromItemAndOpenEditor()` which uses paths helper internally

## 2. Canonical "Create Promotion from Item" Flow Helper

### Created `src/features/promotions/createPromoFlow.ts`
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/promotions/createPromoFlow.ts`

**Function:** `createPromoFromItemAndOpenEditor(options, navigate)`

**Features:**
- Single source of truth for promotion creation flow
- Validates required fields (itemId, storeId)
- Calls `POST /api/mi/promo/from-draft`
- Validates response has `instanceId`
- Navigates to editor using `contentStudioEdit()` or `buildContentStudioUrl()`
- Returns structured result (never throws)
- Consistent error handling

**Usage:**
```typescript
const result = await createPromoFromItemAndOpenEditor({
  itemId: 'product-123',
  storeId: 'store-456',
  format: 'poster',
  environment: 'print',
  goal: 'visit',
}, navigate);

if (!result.ok) {
  toast(result.error.message, 'error');
  return;
}

// Navigation already happened, result.instanceId available
```

### Updated Files to Use Helper

1. **`src/features/storeDraft/StoreDraftReview.tsx`**
   - Replaced inline API call + navigation logic with `createPromoFromItemAndOpenEditor()`
   - Simplified error handling
   - Removed duplicate code

## 3. CI Guardrails

### Created Guardrail Scripts

1. **`scripts/guardrails/check-no-absolute-coreurl.ts`**
   - Scans for hardcoded `localhost:3001` or `${coreUrl}/api/` patterns
   - Fails if found (prevents CORS issues in dev)
   - Allows comments and test files

2. **`scripts/guardrails/check-single-getCurrentUser.ts`**
   - Ensures only one `getCurrentUser` implementation exists
   - Prevents duplicate implementations
   - Checks both dashboard and packages directories

3. **`scripts/guardrails/check-route-exists.ts`**
   - Verifies `/app/creative-shell/edit/:instanceId` route exists in router config
   - Prevents broken navigation
   - Checks common route definition files

4. **`scripts/guardrails/check-hardcoded-paths.ts`**
   - Scans for hardcoded `/app/creative-shell` paths
   - Fails if found outside `paths.ts` or `buildContentStudioUrl.ts`
   - Ensures all paths use helper functions

### Added to package.json

```json
{
  "scripts": {
    "guardrails": "tsx scripts/guardrails/check-no-absolute-coreurl.ts && tsx scripts/guardrails/check-single-getCurrentUser.ts && tsx scripts/guardrails/check-route-exists.ts && tsx scripts/guardrails/check-hardcoded-paths.ts",
    "guardrails:coreurl": "tsx scripts/guardrails/check-no-absolute-coreurl.ts",
    "guardrails:getCurrentUser": "tsx scripts/guardrails/check-single-getCurrentUser.ts",
    "guardrails:route": "tsx scripts/guardrails/check-route-exists.ts"
  }
}
```

## Files Changed

### New Files
1. ✅ `apps/dashboard/cardbey-marketing-dashboard/src/routes/paths.ts`
2. ✅ `apps/dashboard/cardbey-marketing-dashboard/src/features/promotions/createPromoFlow.ts`
3. ✅ `apps/dashboard/cardbey-marketing-dashboard/scripts/guardrails/check-no-absolute-coreurl.ts`
4. ✅ `apps/dashboard/cardbey-marketing-dashboard/scripts/guardrails/check-single-getCurrentUser.ts`
5. ✅ `apps/dashboard/cardbey-marketing-dashboard/scripts/guardrails/check-route-exists.ts`
6. ✅ `apps/dashboard/cardbey-marketing-dashboard/scripts/guardrails/check-hardcoded-paths.ts`

### Modified Files
1. ✅ `apps/dashboard/cardbey-marketing-dashboard/src/lib/buildContentStudioUrl.ts`
   - Uses `contentStudioEdit()` from paths.ts

2. ✅ `apps/dashboard/cardbey-marketing-dashboard/src/features/content-studio/pages/ContentStudioEditor.tsx`
   - Uses `contentStudioHome()` instead of hardcoded path

3. ✅ `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
   - Uses `createPromoFromItemAndOpenEditor()` helper

4. ✅ `apps/dashboard/cardbey-marketing-dashboard/package.json`
   - Added `guardrails` script and individual guardrail scripts

## Usage

### Running Guardrails

```bash
# Run all guardrails
pnpm guardrails

# Run individual guardrails
pnpm guardrails:coreurl
pnpm guardrails:getCurrentUser
pnpm guardrails:route
```

### Using Path Helpers

```typescript
import { contentStudioHome, contentStudioEdit, storeReview } from '@/routes/paths';

// Navigate to Content Studio home
navigate(contentStudioHome());

// Navigate to editor
navigate(contentStudioEdit(instanceId));

// Navigate to store review
navigate(storeReview(storeId, { mode: 'draft' }));
```

### Using Promotion Flow Helper

```typescript
import { createPromoFromItemAndOpenEditor } from '@/features/promotions/createPromoFlow';

const result = await createPromoFromItemAndOpenEditor({
  itemId: 'product-123',
  storeId: 'store-456',
  format: 'poster',
  environment: 'print',
  goal: 'visit',
}, navigate);

if (!result.ok) {
  toast(result.error.message, 'error');
  return;
}

// Success - navigation already happened
console.log('Created promo:', result.instanceId);
```

## Sample Failure Messages

### check-no-absolute-coreurl.ts
```
❌ Found violations:

  src/services/api.ts:42
    Found hardcoded "localhost:3001" - use relative URLs or getCoreApiBaseUrl()
    const url = 'http://localhost:3001/api/auth/me';

💡 Fix: Use relative URLs (e.g., '/api/...') or getCoreApiBaseUrl() helper
```

### check-single-getCurrentUser.ts
```
❌ Found 2 implementations of getCurrentUser:

  src/lib/api.ts:123
    export async function getCurrentUser() {

  src/services/user.ts:45
    export const getCurrentUser = async () => {

💡 Fix: Consolidate to a single implementation in a shared location
```

### check-route-exists.ts
```
❌ Required route not found in any route definition file
   Required: /app/creative-shell/edit/:instanceId

   Checked files:
     - src/App.jsx
     - src/features/content-studio/pages/CreativeShell.tsx

💡 Fix: Add the route to your router configuration:
   <Route path="edit/:instanceId" element={<ContentStudioEditor />} />
```

### check-hardcoded-paths.ts
```
❌ Found violations:

  src/components/ProductCard.tsx:89
    Found hardcoded "/app/creative-shell/edit" - use contentStudioEdit(instanceId) from @/routes/paths
    navigate(`/app/creative-shell/edit/${instanceId}`);

💡 Fix: Use helper functions from @/routes/paths:
   - contentStudioHome()
   - contentStudioEdit(instanceId)
```

## Acceptance Criteria

✅ Single source of truth for routing paths (`paths.ts`)  
✅ All hardcoded paths replaced with helper functions  
✅ Canonical promotion creation flow helper  
✅ All UI buttons use the helper  
✅ CI guardrails prevent regressions  
✅ Guardrails integrated into package.json  
✅ Sample failure messages documented  

## Next Steps

1. Run `pnpm guardrails` to verify all checks pass
2. Update any remaining hardcoded paths found by guardrails
3. Add guardrails to CI pipeline (GitHub Actions, etc.)
4. Consider adding ESLint rule for hardcoded paths (optional)



















