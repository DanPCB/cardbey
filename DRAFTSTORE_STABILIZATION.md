# DraftStore Schema & Commit Semantics Stabilization ✅

## Summary

Stabilized DraftStore schema and commit semantics for Phase 1, ensuring idempotent commits, proper status lifecycle, and safe handling of committed drafts.

## Changes Made

### 1. Prisma Schema Updates
**File:** `apps/core/cardbey-core/prisma/schema.prisma`

**Changes:**
- Added `status String @default("draft")` - now defaults to "draft" instead of being required
- Added `committedAt DateTime?` - timestamp when draft was committed
- Status values: `'draft' | 'generating' | 'ready' | 'failed' | 'committed' | 'abandoned'`
- Added index on `createdAt` for query performance
- Existing fields: `committedStoreId`, `committedUserId` (already present)

**Migration:** `20251212071026_draftstore_status_commit_link`

### 2. Backend: Commit Endpoint Idempotency
**File:** `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`

**Changes:**
- **Abandoned draft handling:** Returns 409 error if draft status is 'abandoned'
- **Idempotent commit:** If draft is already committed:
  - Returns 200 OK with existing data
  - Includes `alreadyCommitted: true` flag
  - Generates new JWT token for existing user
  - No duplicate user/store creation
- **Transaction safety:** All operations in `prisma.$transaction` to ensure atomicity
- **CommittedAt timestamp:** Sets `committedAt: new Date()` when marking draft as committed

**File:** `apps/core/cardbey-core/src/routes/draftStore.js`

**Changes:**
- Added `alreadyCommitted` flag to commit response
- Improved error handling for abandoned drafts (409 status)
- Better error messages for validation failures

### 3. Backend: Preview Endpoint for Committed Drafts
**File:** `apps/core/cardbey-core/src/routes/draftStore.js`

**Changes:**
- **Option A (implemented):** If draft status is 'committed':
  - Returns `{ ok: true, status: 'committed', redirectTo: '/app/back', message: '...' }`
  - Frontend can redirect gracefully
  - No 404 error for committed drafts

### 4. Frontend: Handle Committed Drafts
**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/StorePreviewPage.tsx`

**Changes:**
- When loading draft, if `status === 'committed'`:
  - Shows success toast: "Draft already saved. Opening your store..."
  - Automatically redirects to `redirectTo` (default: `/app/back`)
  - No error state for committed drafts
- Updated TypeScript types to include `redirectTo` and `message` in response

## Files Modified

### Backend
1. `apps/core/cardbey-core/prisma/schema.prisma`
   - Added `committedAt DateTime?`
   - Changed `status` to default to `"draft"`
   - Added index on `createdAt`

2. `apps/core/cardbey-core/prisma/migrations/20251212071026_draftstore_status_commit_link/migration.sql`
   - Migration file (auto-generated)

3. `apps/core/cardbey-core/src/services/draftStore/draftStoreService.js`
   - Added abandoned draft check
   - Enhanced idempotent commit handling
   - Sets `committedAt` timestamp in transaction
   - Returns `alreadyCommitted` flag

4. `apps/core/cardbey-core/src/routes/draftStore.js`
   - Preview endpoint returns redirect info for committed drafts
   - Commit endpoint returns `alreadyCommitted` flag
   - Better error handling for abandoned drafts

### Frontend
1. `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/StorePreviewPage.tsx`
   - Handles committed draft status gracefully
   - Auto-redirects with toast message
   - Updated TypeScript types

## Manual Test Steps

### Test 1: Normal Commit Flow
1. Generate a draft:
   - Navigate to `/features`
   - Fill in business details
   - Click "Generate"
   - Wait for preview at `/preview/:draftId`

2. Commit the draft:
   - Click "Save Draft & Create Account"
   - Fill in signup form
   - Submit

3. Verify:
   - ✅ Should redirect to `/app/back` (dashboard)
   - ✅ Draft status in DB should be `'committed'`
   - ✅ `committedAt` should be set
   - ✅ `committedStoreId` and `committedUserId` should be set
   - ✅ User and Business records created

### Test 2: Idempotent Commit (No Duplicates)
1. After committing a draft, try to commit again:
   - Hit browser back button to return to preview page
   - Click "Save Draft & Create Account" again
   - Fill in same or different email

2. Verify:
   - ✅ Should return 200 OK (not error)
   - ✅ Response includes `alreadyCommitted: true`
   - ✅ No duplicate user/store created
   - ✅ Returns existing store data
   - ✅ Redirects to dashboard

### Test 3: Committed Draft Preview
1. After committing, visit preview URL directly:
   - Navigate to `/preview/:draftId` (already committed draft)

2. Verify:
   - ✅ Should show toast: "Draft already saved. Opening your store..."
   - ✅ Should auto-redirect to `/app/back` after 1 second
   - ✅ No error page shown
   - ✅ No 404 error

### Test 4: Browser Back + Refresh
1. After committing:
   - Hit browser back button
   - Refresh the page

2. Verify:
   - ✅ Should detect committed status
   - ✅ Should redirect to dashboard
   - ✅ Should not show preview content

### Test 5: Abandoned Draft (Future)
1. Manually set draft status to 'abandoned' in DB
2. Try to commit:
   - Should return 409 error
   - Error message: "Draft has been abandoned and cannot be committed"

## Status Lifecycle

```
draft (default)
  ↓
generating (during AI/OCR processing)
  ↓
ready (preview available)
  ↓
committed (user signed up, store created)
  OR
abandoned (user didn't commit, can be cleaned up)
```

## Backwards Compatibility

✅ **All changes are backwards compatible:**
- Existing drafts with status 'generating' or 'ready' continue to work
- Default status is 'draft' for new drafts (but service sets to 'generating' immediately)
- Missing `committedAt` is handled gracefully (nullable field)
- Frontend handles both old and new response formats

## Database Migration

**Migration Name:** `draftstore_status_commit_link`

**Changes:**
- Adds `committedAt DateTime?` column
- Changes `status` default to `"draft"`
- Adds index on `createdAt`

**To apply:**
```bash
cd apps/core/cardbey-core
npx prisma migrate dev --name draftstore_status_commit_link
npx prisma generate
```

## Acceptance Criteria Met

✅ **Schema:**
- Status defaults to "draft"
- `committedAt` timestamp added
- Proper indexes for query performance

✅ **Idempotency:**
- No duplicate user/store creation
- Returns existing data if already committed
- `alreadyCommitted` flag in response

✅ **Preview Endpoint:**
- Returns redirect info for committed drafts
- No 404 errors for committed drafts
- Clean redirect path

✅ **Frontend:**
- Handles committed drafts gracefully
- Auto-redirects with toast
- No error spam

✅ **Error Handling:**
- Abandoned drafts return 409
- Clear error messages
- Transaction safety (rollback on error)

