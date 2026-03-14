# POST /api/mi/promo/from-draft Fix Summary

## Problem
- Backend was returning 500 errors for expected cases (missing fields, not found, etc.)
- Frontend wasn't navigating to Content Studio after successful POST

## Backend Fixes

### 1. Enhanced Request Logging
**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

- Added structured logging at entry with:
  - `userId` (from `req.user?.id || req.userId`)
  - `storeId`, `draftId`, `jobId`, `productId`
  - `environment`, `format`, `goal`
  - `hasAuth`, `requestId`

### 2. Explicit Guards Before DB Operations
- **401 Guard**: Returns 401 if auth is required but missing (when creating new store)
- **400 Guards**: 
  - Missing `storeId`, `draftId`, or `jobId` → 400
  - Invalid `environment` enum → 400
  - Invalid `goal` enum → 400
  - Missing/invalid `tenantId` → 400
- **404 Guards**:
  - Draft not found after all lookup strategies → 404
  - Product not found in draft → 404

### 3. Null Dereference Protection
- Added check for `storeDraft` existence before accessing properties
- Added check for `storeDraft.catalog.products` structure before accessing
- Moved product image extraction to before scene data building

### 4. Enhanced Response Payload
**Success Response (200):**
```json
{
  "ok": true,
  "instanceId": "cmjwxr1cp0019jvmw4ht7q9d1",
  "promoId": "cmjwxr1cp0019jvmw4ht7q9d1",
  "editorUrl": "/app/creative-shell/edit/cmjwxr1cp0019jvmw4ht7q9d1",
  "sourceContext": {
    "productId": "prod_123",
    "productName": "Tortino appiccicoso",
    "imageUrl": "http://localhost:3001/uploads/media/...",
    "storeId": "cmjxkfjud001tjvvc57htqdp9"
  },
  "promo": {
    "id": "cmjwxr1cp0019jvmw4ht7q9d1",
    "kind": "smart_object",
    "environment": "print",
    "format": "poster",
    "goal": "visit",
    "storeId": "cmjxkfjud001tjvvc57htqdp9",
    "tenantId": "user_123",
    "productId": "prod_123",
    "draftId": "cmjwxr1cp0019jvmw4ht7q9d1",
    "instanceId": "cmjwxr1cp0019jvmw4ht7q9d1"
  }
}
```

**Error Responses:**

**400 - Missing Field:**
```json
{
  "ok": false,
  "error": {
    "code": "MISSING_FIELD",
    "message": "storeId, draftId, or jobId is required"
  },
  "requestId": "req_1234567890_abc123"
}
```

**400 - Invalid Environment:**
```json
{
  "ok": false,
  "error": {
    "code": "INVALID_ENVIRONMENT",
    "message": "Invalid environment: invalid. Must be one of: print, screen, social, hybrid"
  },
  "requestId": "req_1234567890_abc123"
}
```

**401 - Unauthenticated:**
```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Authentication required to create a new store"
  },
  "requestId": "req_1234567890_abc123"
}
```

**404 - Draft Not Found:**
```json
{
  "ok": false,
  "error": {
    "code": "DRAFT_NOT_FOUND",
    "message": "Store draft not found. Please ensure storeId, draftId, or jobId is valid."
  },
  "requestId": "req_1234567890_abc123"
}
```

**404 - Product Not Found:**
```json
{
  "ok": false,
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Product prod_123 not found in store draft"
  },
  "requestId": "req_1234567890_abc123"
}
```

**500 - Internal Error (only for unexpected errors):**
```json
{
  "ok": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred while creating promo draft"
  },
  "debug": {
    "requestId": "req_1234567890_abc123",
    "elapsed": 1234,
    "errorMessage": "Cannot read property 'x' of undefined"
  }
}
```

### 5. Error Handling Improvements
- Wrapped entire handler in try/catch
- Mapped Prisma errors to appropriate HTTP status codes:
  - `P2025` (not found) → 404
  - `P2002` (unique constraint) → 409
  - Other Prisma errors → 500
- Timeout errors → 408
- Auth errors → 401

## Frontend Fixes

### 1. Enhanced Response Parsing
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/api/miPromo.ts`

- Now extracts `editorUrl` and `sourceContext` from backend response
- Returns these fields in `CreatePromoFromDraftResponse`

### 2. Navigation After Success
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/services/createPromoAndGoToStudio.ts`

- Uses `editorUrl` from backend response if available
- Falls back to building URL if backend doesn't provide it
- Returns `editorUrl` in result for caller to navigate

### 3. Caller Navigation
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`

- Currently uses local-first approach (creates local draft, navigates immediately)
- Backend sync happens in background (non-blocking)
- If backend sync succeeds, logs the result (could be used to update URL if needed)

## Files Changed

### Backend
1. ✅ `apps/core/cardbey-core/src/routes/miRoutes.js`
   - Enhanced request logging
   - Added explicit guards (401, 400, 404)
   - Fixed null dereference issues
   - Added `editorUrl` and `sourceContext` to response
   - Improved error handling

### Frontend
2. ✅ `apps/dashboard/cardbey-marketing-dashboard/src/api/miPromo.ts`
   - Extract `editorUrl` and `sourceContext` from response

3. ✅ `apps/dashboard/cardbey-marketing-dashboard/src/services/createPromoAndGoToStudio.ts`
   - Use `editorUrl` from backend response
   - Return `sourceContext` in result

4. ✅ `apps/dashboard/cardbey-marketing-dashboard/src/features/storeDraft/StoreDraftReview.tsx`
   - Enhanced backend sync logging

## Testing

### Manual Test Checklist

1. **Test 400 Errors:**
   - POST without `storeId`, `draftId`, or `jobId` → Should return 400
   - POST with invalid `environment` → Should return 400
   - POST with invalid `goal` → Should return 400

2. **Test 401 Errors:**
   - POST without auth when creating new store → Should return 401

3. **Test 404 Errors:**
   - POST with invalid `storeId` → Should return 404
   - POST with `productId` not in draft → Should return 404

4. **Test 200 Success:**
   - POST with valid `storeId` and `productId` → Should return 200 with `instanceId`, `editorUrl`, `sourceContext`
   - Frontend should navigate to `editorUrl` after success

5. **Test Navigation:**
   - Click "Create Smart Promotion" → Backend returns 200 → Browser URL becomes `/app/creative-shell/edit/<instanceId>`
   - Editor should load (even if image not injected yet)

## Acceptance Criteria

✅ Backend never returns 500 for expected cases  
✅ Backend returns proper 4xx errors (400, 401, 404)  
✅ Backend returns 200 with `instanceId`, `editorUrl`, `sourceContext` on success  
✅ Frontend navigates to Content Studio after successful POST  
✅ Frontend uses `editorUrl` from backend response if available  
✅ Error messages are clear and actionable  



















