# Public Create Flow - Implementation Summary

## Root Cause Analysis

### Issue 1: Form/Website jobs stuck at "Queued 0%"
**Root Cause:** Only URL jobs were being processed. In `miGeneration.ts`, the job creation only triggered `processUrlJob()` for `sourceType === 'url'`. Form, voice, and OCR jobs were created but never processed, leaving them stuck in "queued" status.

**Fix:**
- Added `processFormJob()` and `processOcrJob()` functions
- Updated job creation to trigger processing for ALL sourceTypes via `process.nextTick()`
- Added debug logging to track when processing starts

### Issue 2: Auth redirects on public routes
**Root Cause:** The `/app/store/:storeId/review?mode=draft` route was not marked as public in `App.jsx`, causing auth checks to trigger redirects.

**Fix:**
- Added `/app/store/:storeId/review?mode=draft` to `isPublicPage` check in `App.jsx`
- Suppressed 401 error display in `ReviewStep.tsx` when in public context
- Ensured `/mi/job/:jobId` remains public (already was)

## Implementation Details

### Backend Changes

1. **`apps/core/cardbey-core/src/services/miGeneration.ts`**
   - Added `processFormJob()`: Creates StoreDraft from `businessName`, `businessType`, `location`
   - Added `processOcrJob()`: Stub implementation for OCR processing
   - Changed `setImmediate()` to `process.nextTick()` for more reliable async execution
   - Added `checkStaleQueuedJobs()`: Detects jobs stuck in queue >30s and marks them failed
   - Added stalled job detection in `getMiGenerationJob()`: Auto-marks stalled jobs as failed

2. **`apps/core/cardbey-core/src/routes/miRoutes.js`**
   - Added `POST /api/mi/job/:jobId/retry`: Retry endpoint for stalled/failed jobs
   - Retry endpoint re-triggers processing based on `sourceType`

3. **`apps/core/cardbey-core/src/routes/business.js`**
   - Fixed Prisma client import: Use shared `prisma` from `../db/prisma.js`
   - Added stalled job detection in `GET /api/business/job/:jobId`
   - Fixed response structure to match frontend expectations (`id` instead of `jobId`, include `resultJson`)

### Frontend Changes

1. **`apps/dashboard/cardbey-marketing-dashboard/src/App.jsx`**
   - Added `/app/store/:storeId/review?mode=draft` to `isPublicPage` check
   - Ensures no auth checks trigger on draft review routes

2. **`apps/dashboard/cardbey-marketing-dashboard/src/features/mi/ReviewStep.tsx`**
   - Suppressed 401 error display when in public context
   - Added retry button for stalled jobs (STALLED_QUEUE error code)
   - Retry button calls `POST /api/mi/job/:jobId/retry`

## Canonical Routes

### Public Routes (No Auth Required)
- `/features` - Quick Start page
- `/mi/job/:jobId` - MI job status page
- `/app/store/:storeId/review?mode=draft` - Store draft review page

### Protected Routes (Auth Required)
- `/app/store/:storeId/review` (without `mode=draft`) - Authenticated store review
- Publish actions
- Create Promo actions

## Token Strategy

**Current Implementation:**
- No public tokens needed - endpoints use `optionalAuth` middleware
- Job polling works without auth via `GET /api/mi/job/:jobId` (optionalAuth)
- Store review works without auth via draft mode query param

**Future Enhancement (if needed):**
- Could add `jobPublicToken` to job creation response
- Frontend stores token and includes in polling requests
- Backend validates token for public job access

## Testing Checklist

1. **Form Job Progression:**
   - Open Quick Start → Select "Form"
   - Fill in businessName, businessType, location
   - Click "Generate"
   - ✅ Job status changes from "queued" → "running" within 1-2 seconds
   - ✅ Progress updates: 10% → 30% → 60% → 85% → 100%
   - ✅ Status becomes "succeeded" and redirects to review page

2. **Website/URL Job Progression:**
   - Select "Website/Link" option
   - Paste URL and click "Generate"
   - ✅ Job processes normally (existing behavior)

3. **Public Flow (No Auth):**
   - Open `/features` in private window
   - Create job via Form or Website
   - ✅ No redirect to `/login`
   - ✅ Job page loads and polls successfully
   - ✅ Review page loads without auth

4. **Stalled Job Detection:**
   - Create a job and manually set status to "queued" in DB (for testing)
   - Wait 30+ seconds
   - ✅ Job is automatically marked as "failed" with STALLED_QUEUE error
   - ✅ UI shows "Retry Job" button
   - ✅ Clicking retry re-triggers processing

5. **Auth Gating:**
   - On draft review page, click "Publish"
   - ✅ If not authed: Shows login prompt, doesn't redirect
   - ✅ After login: Returns to same page and allows publish

## Files Changed

### Backend
- `apps/core/cardbey-core/src/services/miGeneration.ts`
- `apps/core/cardbey-core/src/routes/miRoutes.js`
- `apps/core/cardbey-core/src/routes/business.js`

### Frontend
- `apps/dashboard/cardbey-marketing-dashboard/src/App.jsx`
- `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/ReviewStep.tsx`

## Notes

- Stale job detection runs every 10 seconds (dev/debug mode only)
- Job processing uses `process.nextTick()` for immediate async execution
- All endpoints use `optionalAuth` to allow public access
- Debug logging is gated by `DEBUG=true` or `NODE_ENV !== 'production'`


