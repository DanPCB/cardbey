# Generation Lock Implementation Summary

## What Was Changed

### Backend Changes

1. **Prisma Schema (`apps/core/cardbey-core/prisma/schema.prisma`)**
   - Added `generationStatus` field (String, default: "idle")
   - Added `lastGeneratedAt` field (DateTime, nullable)
   - These fields track store generation state to prevent draft overwrites

2. **Business Creation (`apps/core/cardbey-core/src/routes/business.js`)**
   - Set `generationStatus = 'generating'` when creating new store
   - Set `generationStatus = 'generating'` before creating MI job (if store exists)
   - Reset to `'failed'` if job creation fails

3. **MI Generation Service (`apps/core/cardbey-core/src/services/miGeneration.ts`)**
   - **Form Job Completion**: Sets `generationStatus = 'complete'` and `lastGeneratedAt = now()` when job succeeds
   - **URL Job Completion**: Sets `generationStatus = 'complete'` and `lastGeneratedAt = now()` when job succeeds
   - **OCR Job Completion**: Sets `generationStatus = 'complete'` and `lastGeneratedAt = now()` when job succeeds
   - **Job Failure**: Sets `generationStatus = 'failed'` in `markJobFailed()` function
   - **SSE Events**: Emits `store.generated` event to both `admin` and `store:{storeId}` channels when generation completes

4. **Public Draft Endpoint (`apps/core/cardbey-core/src/routes/publicStoreRoutes.js`)**
   - Checks `generationStatus === 'generating'` and returns `423 Locked` with `{ locked: true }`
   - If `generationStatus === 'complete'` and `lastGeneratedAt` exists, returns generated store data (not draft)
   - Prevents old drafts from overwriting generated stores

### Frontend Changes

1. **Review Page (`apps/dashboard/cardbey-marketing-dashboard/src/pages/store/StoreReviewPage.tsx`)**
   - Checks for `locked: true` in API response
   - Shows "Store is currently being generated" message when locked
   - Does not fetch or apply draft when store is generating
   - Preserves existing state guards to prevent empty overwrites

## Why The Bug Occurred

1. **Race Condition**: Frontend was fetching `/api/store/:id/draft` after MI job completed, but the draft was older than the generated store, causing it to overwrite the populated catalog with an empty draft.

2. **No Generation Lock**: There was no mechanism to prevent draft overwrites while generation was in progress.

3. **Missing Job-to-Store Hydration**: The MI job finished but the store wasn't properly marked as "generated", so draft endpoints couldn't distinguish between generated stores and empty drafts.

## Why It Cannot Happen Again

1. **Generation Status Lock**: 
   - Store is locked (`generationStatus = 'generating'`) when MI job starts
   - Draft endpoints return `423 Locked` when store is generating
   - Frontend respects locked state and doesn't fetch/apply drafts

2. **Timestamp Comparison**:
   - `lastGeneratedAt` tracks when generation completed
   - Draft endpoints check if `lastGeneratedAt > draft.updatedAt` and return generated data instead of draft
   - This ensures generated stores always take precedence over old drafts

3. **SSE Events**:
   - `store.generated` event is emitted when generation completes
   - Frontend can listen to this event and re-fetch store data
   - Ensures UI updates immediately when generation completes

4. **State Preservation Guards**:
   - Multiple guards prevent overwriting existing products with empty state
   - Frontend checks for `locked` state before applying any draft data
   - Error handling preserves existing state instead of wiping it

## Migration Required

**IMPORTANT**: After deploying this change, you must run a Prisma migration:

```bash
cd apps/core/cardbey-core
npx prisma migrate dev --name add_generation_lock_fields
```

This will add the `generationStatus` and `lastGeneratedAt` fields to the `Business` table.

## Testing Checklist

- [ ] Create store via Form → Verify `generationStatus = 'generating'` → Verify products appear → Verify `generationStatus = 'complete'`
- [ ] Create store via URL → Verify same behavior
- [ ] Create store via OCR → Verify same behavior
- [ ] Create store via Voice → Verify same behavior
- [ ] Try to access draft endpoint while generating → Verify `423 Locked` response
- [ ] Verify review page shows "generating" message when locked
- [ ] Verify products don't disappear after generation completes
- [ ] Verify SSE `store.generated` event is emitted
- [ ] Verify no empty stores are created


