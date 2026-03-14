# Draft Store Commit Endpoint Fix ✅

## Problem
Frontend was calling `/api/drafts/:draftId/commit` but backend route was mounted at `/api/draft-store/:draftId/commit`, causing 404 errors.

## Solution

### 1. Fixed Frontend API Path
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`

**Change:** Updated `commitDraftStore()` to use correct path:
```typescript
// Before: `/drafts/${draftId}/commit`
// After:  `/draft-store/${draftId}/commit`
```

### 2. Added Request Logging
**File:** `apps/core/cardbey-core/src/routes/draftStore.js`

**Change:** Added diagnostic logging:
```javascript
console.log(`[DraftCommit] POST /api/draft-store/${draftId}/commit`);
```

### 3. Improved Error Handling
**File:** `apps/core/cardbey-core/src/routes/draftStore.js`

**Changes:**
- Added validation for missing/invalid request body
- Better error messages for validation failures
- Added Prisma client import for idempotent error handling

### 4. Made Commit Idempotent
**File:** `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`

**Change:** If draft is already committed, return existing data instead of throwing error:
- Fetches existing business and user
- Generates new JWT token
- Returns same response format as new commit
- Redirects to `/app/back` (dashboard)

### 5. Fixed Frontend Redirect
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/StorePreviewPage.tsx`

**Change:** 
- Updated redirect to use `/app/back` (valid route) instead of `/store/:slug` (may not exist)
- Added validation to ensure redirect path is valid
- Fallback to `/app/back` if redirectTo is invalid

### 6. Updated Redirect Path in Service
**File:** `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`

**Change:** Changed default redirect from `/store/:slug` to `/app/back` (dashboard)

## Files Modified

### Backend
1. `apps/core/cardbey-core/src/routes/draftStore.js`
   - Added request logging
   - Improved error handling for invalid body
   - Added Prisma import for idempotent error handling

2. `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`
   - Made commit idempotent (returns existing data if already committed)
   - Changed default redirect to `/app/back`

### Frontend
1. `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`
   - Fixed API path from `/drafts/` to `/draft-store/`

2. `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/StorePreviewPage.tsx`
   - Fixed redirect to use valid route (`/app/back`)
   - Added redirect path validation

## Manual Test Steps

1. **Generate a draft store:**
   - Navigate to `/features`
   - Fill in business details (e.g., "Union Road Florist", "Florist", "Melbourne")
   - Click "Generate"
   - Wait for preview page to load at `/preview/:draftId`

2. **Commit the draft:**
   - On preview page, click "Save Draft & Create Account"
   - Fill in signup form:
     - Email: `test@example.com`
     - Password: `password123` (min 8 chars)
     - Name: `Test User`
     - Check "Accept Terms of Service"
   - Click "Create Account"

3. **Verify success:**
   - Check browser console - should see no 404 errors
   - Check backend console - should see: `[DraftCommit] POST /api/draft-store/:draftId/commit`
   - Should redirect to `/app/back` (dashboard)
   - Should see success toast: "Store created successfully!"

4. **Test idempotent commit:**
   - Try committing the same draft again (if still on preview page)
   - Should return existing data without error
   - Should redirect to dashboard

5. **Test error cases:**
   - Try with invalid email format → should show validation error
   - Try with password < 8 chars → should show validation error
   - Try without accepting terms → should show validation error
   - Try with existing email → should show "Email already exists" error

## Expected Behavior

✅ **Success Case:**
- POST to `/api/draft-store/:draftId/commit` returns 200
- Response includes: `{ ok: true, userId, storeId, storeSlug, token, redirectTo: '/app/back' }`
- User is redirected to `/app/back` (dashboard)
- Draft is marked as `committed` in database
- User and Business records are created
- Products are created from draft items

✅ **Idempotent Case:**
- If draft already committed, returns 200 with existing data
- No duplicate user/business creation
- New JWT token generated for existing user

✅ **Error Cases:**
- Invalid body → 400 with helpful error message
- Validation errors → 400 with field-specific errors
- Email exists → 409 with "email_already_exists"
- Draft not found → 404 with "draft_not_found"
- Draft expired → 400 with "draft_invalid"

## Acceptance Criteria Met

- ✅ Frontend calls correct backend endpoint (`/api/draft-store/:draftId/commit`)
- ✅ Backend route exists and handles requests
- ✅ No 404 errors
- ✅ User redirected to valid route (`/app/back`)
- ✅ Draft marked committed in database
- ✅ Store exists in database after commit
- ✅ Request logging for diagnostics
- ✅ Idempotent commit (can retry safely)
- ✅ Clear error messages for validation failures

