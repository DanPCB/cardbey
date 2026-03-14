# MI Promo From Draft 500 Fix Summary

## Problem
- POST `/api/mi/promo/from-draft` returns 500 when auth fails
- Handler assumes `req.user` exists and crashes when undefined
- No proper error handling for authentication failures

## Root Cause
The handler uses `optionalAuth` middleware, which means `req.user` might not exist. However, the handler doesn't check for authentication before performing operations that require it (like creating stores). When `req.user` is undefined and the code tries to access it, it crashes with a 500 error.

## Solution: Proper Error Handling + Auth Validation

### Changes Made

#### 1. Early Auth Check
**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

- Added early auth check: `const hasAuth = !!req.user || !!req.userId;`
- Added request ID for tracking: `const requestId = 'req_${Date.now()}_${Math.random()...}'`
- Logs auth status in payload logging

#### 2. Payload Validation
**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

- Validates `environment` enum: must be one of `['print', 'screen', 'social', 'hybrid']`
- Validates `goal` enum: must be one of `['visit', 'order', 'call', 'book']`
- Returns 400 with specific error code and message for invalid values

#### 3. Auth Requirement for Store Creation
**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

- Added check: if creating a new store (not demo mode), requires authentication
- Returns 401 with clear error message if auth is missing
- Allows demo mode for unauthenticated requests (when `tenantId.startsWith('demo-')`)

#### 4. Enhanced Error Handling
**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

- Wrapped entire handler in try/catch
- Maps specific error types to appropriate HTTP status codes:
  - **Timeout errors** → 408 Request Timeout
  - **Prisma P2025 (not found)** → 404 Not Found
  - **Prisma P2002 (unique constraint)** → 409 Conflict
  - **Auth errors** → 401 Unauthorized
  - **Other Prisma errors** → 500 Internal Error
  - **Unexpected errors** → 500 with debug info (dev only)
- Logs errors with requestId, elapsed time, and safe context (no sensitive data)

#### 5. Improved Error Messages
**File:** `apps/core/cardbey-core/src/routes/miRoutes.js`

- All error responses include:
  - `ok: false`
  - `error.code` - Specific error code (UNAUTHENTICATED, DRAFT_NOT_FOUND, etc.)
  - `error.message` - Human-readable message
  - `debug` - Additional context (only in dev mode)

## Error Response Examples

### 401 Unauthenticated
```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Authentication required to create a new store"
  }
}
```

### 400 Invalid Payload
```json
{
  "ok": false,
  "error": {
    "code": "INVALID_ENVIRONMENT",
    "message": "Invalid environment: invalid. Must be one of: print, screen, social, hybrid"
  }
}
```

### 404 Draft Not Found
```json
{
  "ok": false,
  "error": {
    "code": "DRAFT_NOT_FOUND",
    "message": "Draft not found. Please ensure the storeId, draftId, or jobId is valid.",
    "debug": {
      "tried": ["storeId", "draftId"],
      "storeId": "cmjwx732p0005jvmwbsuupek8",
      "draftId": null,
      "jobId": null
    }
  }
}
```

### 500 Internal Error (with debug)
```json
{
  "ok": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred while creating promo draft"
  },
  "debug": {
    "requestId": "req_1234567890_abc123",
    "elapsed": 234,
    "errorMessage": "Cannot read property 'id' of undefined"
  }
}
```

## Flow Diagram

```
POST /api/mi/promo/from-draft
  ↓
optionalAuth middleware (sets req.user if token valid)
  ↓
Early auth check: hasAuth = !!req.user || !!req.userId
  ↓
Validate payload (storeId/draftId/jobId, environment, goal)
  ↓
Load draft (storeId → Business, draftId → DraftStore, jobId → MiGenerationJob)
  ↓
If draft not found → 404 DRAFT_NOT_FOUND
  ↓
Resolve tenantId (from req.user or demo mode)
  ↓
If creating store && !hasAuth → 401 UNAUTHENTICATED
  ↓
Create Content + PromoInstance
  ↓
If Prisma error → Map to appropriate status (404/409/500)
  ↓
If timeout → 408 REQUEST_TIMEOUT
  ↓
If unexpected error → 500 INTERNAL_ERROR (with debug)
  ↓
Success → 200 OK with promo data
```

## Testing

### Test 1: Unauthenticated Request (Should Return 401)
```bash
curl -X POST http://localhost:3001/api/mi/promo/from-draft \
  -H "Content-Type: application/json" \
  -d '{"storeId": "test-store-id"}'
```
Expected: 401 with `code: "UNAUTHENTICATED"` (if creating store)

### Test 2: Invalid Environment (Should Return 400)
```bash
curl -X POST http://localhost:3001/api/mi/promo/from-draft \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"storeId": "test", "environment": "invalid"}'
```
Expected: 400 with `code: "INVALID_ENVIRONMENT"`

### Test 3: Missing Required Field (Should Return 400)
```bash
curl -X POST http://localhost:3001/api/mi/promo/from-draft \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{}'
```
Expected: 400 with `code: "MISSING_FIELD"`

### Test 4: Draft Not Found (Should Return 404)
```bash
curl -X POST http://localhost:3001/api/mi/promo/from-draft \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"storeId": "nonexistent-store-id"}'
```
Expected: 404 with `code: "DRAFT_NOT_FOUND"`

### Test 5: Valid Request (Should Return 200)
```bash
curl -X POST http://localhost:3001/api/mi/promo/from-draft \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"storeId": "valid-store-id", "productId": "valid-product-id"}'
```
Expected: 200 with promo data

## Files Changed

1. **`apps/core/cardbey-core/src/routes/miRoutes.js`**
   - Added early auth check
   - Added payload validation (environment, goal enums)
   - Added auth requirement check for store creation
   - Enhanced error handling with specific status codes
   - Improved error messages with debug info

## Acceptance Criteria

✅ Unauthenticated requests return 401 (not 500)  
✅ Invalid payload returns 400 with clear message  
✅ Draft not found returns 404 (not 500)  
✅ Prisma errors mapped to appropriate status codes  
✅ Unexpected errors return 500 with debug info (dev only)  
✅ All errors include structured error codes  
✅ No crashes when `req.user` is undefined  



















