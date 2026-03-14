# Quick Start Canonical Flow

**Last Updated:** 2025-01-28  
**Status:** ✅ Implemented

## Overview

All 4 Quick Start options (Form, Voice/Chat, OCR, Website/Link) use a **single canonical flow** that creates an MI job and navigates to the store review page.

## Flow Diagram

```
User selects option (Form/Voice/OCR/Website)
    ↓
Frontend: startCreateBusiness(sourceType, payload)
    ↓
Backend: POST /api/business/create
    ↓
Creates: User (tenant) + Business (store) + MiGenerationJob
    ↓
Returns: { jobId, tenantId, storeId }
    ↓
Frontend: Navigate to /mi/job/:jobId
    ↓
Poll: GET /api/mi/job/:jobId
    ↓
When job completes + storeId available:
    ↓
Auto-redirect to /app/store/:storeId/review?mode=draft
```

## Frontend Implementation

### Single API Helper

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/services/createBusiness.ts`

```typescript
export async function startCreateBusiness(
  sourceType: 'form' | 'voice' | 'ocr' | 'url',
  payload: CreateBusinessPayload,
  options?: CreateBusinessOptions
): Promise<CreateBusinessResponse>
```

**Returns:**
- `{ ok: true, jobId, tenantId, storeId }` on success
- `{ ok: false, error: {...} }` on failure

**Usage in FeaturesPage.tsx:**
- All 4 options call `startCreateBusiness()` with appropriate `sourceType` and `payload`
- After success, navigates to `/mi/job/:jobId` using `goToJob()` helper

### Navigation Helpers

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/lib/flowNav.ts`

- `goToJob(navigate, jobId)` → `/mi/job/:jobId`
- `goToStoreReview(navigate, storeId, options?)` → `/app/store/:storeId/review?mode=draft`

### Job Status Page

**File:** `apps/dashboard/cardbey-marketing-dashboard/src/pages/mi/MiJobStatusPage.tsx`

- Renders `ReviewStep` component
- Polls `/api/mi/job/:jobId` via `useMiJob` hook
- Auto-redirects to store review when `storeId` is available

## Backend Implementation

### Canonical Endpoint

**File:** `apps/core/cardbey-core/src/routes/business.js`

**Endpoint:** `POST /api/business/create`

**Request Body:**
```json
{
  "sourceType": "form" | "voice" | "ocr" | "url",
  "payload": {
    // Form/Voice:
    "businessName": string,
    "businessType": string,
    "location": string,
    "description": string,
    
    // OCR:
    "ocrRawText": string,
    "imageUrl": string,
    
    // URL:
    "url": string
  },
  "options": {
    "autoImages": boolean
  },
  "idempotencyKey": string (optional)
}
```

**Response:**
```json
{
  "ok": true,
  "jobId": "cmj...",
  "tenantId": "cmj...",
  "storeId": "cmj..."
}
```

**Behavior:**
1. Validates `sourceType` (must be one of: form, voice, ocr, url)
2. Creates User (tenant) if missing
3. Creates Business (store) if missing
4. Creates MiGenerationJob with appropriate `sourceType` and `sourceValue`
5. Enqueues job processing (async)
6. Returns `{ jobId, tenantId, storeId }`

### Job Processing

**File:** `apps/core/cardbey-core/src/services/miGeneration.ts`

- `processUrlJob()` - Processes URL sourceType jobs
- `processOcrJob()` - Processes OCR sourceType jobs (if implemented)
- `processFormJob()` - Processes form/voice sourceType jobs (if implemented)

Jobs are processed asynchronously and update status: `queued` → `running` → `succeeded` / `failed`

## Source Type Mapping

| Quick Start Option | sourceType | Payload Fields |
|-------------------|------------|----------------|
| **Form** | `form` | `businessName`, `businessType`, `location` |
| **Voice/Chat** | `voice` | `businessName`, `businessType`, `location` |
| **OCR** | `ocr` | `ocrRawText`, `imageUrl` |
| **Website/Link** | `url` | `url` |

## Idempotency

The endpoint supports idempotency via `idempotencyKey`:
- If a job with the same key exists (within 1 hour), returns existing job
- Prevents duplicate job creation for the same input

## Error Handling

### Frontend
- Network errors → Shows toast with error message
- 409 Conflict → Treats as resume, navigates to existing job
- Missing fields → Validates before API call

### Backend
- Invalid `sourceType` → 400 with `INVALID_SOURCE_TYPE`
- Missing required fields → 400 with specific error code
- Job creation failure → 400 with `JOB_CREATION_FAILED`
- Database errors → 500 with `INTERNAL_ERROR`

## Auth Requirements

- **Job Creation:** Uses `optionalAuth` middleware (works without auth)
- **Job Status:** Uses `optionalAuth` middleware (works without auth)
- **Store Review:** Public/draft mode (no auth required for viewing)
- **Editing Actions:** May require auth (gated by `hasAuthTokens()`)

## Legacy Endpoints (Deprecated)

The following endpoints are deprecated in favor of `/api/business/create`:
- ❌ `POST /api/mi/generate` (legacy)
- ❌ `POST /draft-store/generate` (legacy)
- ❌ `POST /api/ai/store/bootstrap` (legacy, may still be used for OCR uploads)

**Migration:** All Quick Start flows should use `startCreateBusiness()` → `/api/business/create`

## Testing Checklist

- [ ] **Form option:** Click Generate → Creates job → Navigates to `/mi/job/:jobId` → Redirects to review when complete
- [ ] **Voice/Chat option:** Click Generate → Creates job → Navigates to `/mi/job/:jobId` → Redirects to review when complete
- [ ] **OCR option:** Upload image → Click Generate → Creates job → Navigates to `/mi/job/:jobId` → Redirects to review when complete
- [ ] **Website/Link option:** Paste URL → Click Generate → Creates job → Navigates to `/mi/job/:jobId` → Redirects to review when complete
- [ ] **Private window:** No auth-warning toasts appear during draft review
- [ ] **Job polling:** Status updates from `queued` → `running` → `succeeded`
- [ ] **Redirect timing:** Redirects only when `storeId` is available (not before)

## Files Changed

### Frontend
- `apps/dashboard/cardbey-marketing-dashboard/src/services/createBusiness.ts` - Unified API helper
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/public/FeaturesPage.tsx` - Uses unified helper
- `apps/dashboard/cardbey-marketing-dashboard/src/lib/flowNav.ts` - Navigation helpers
- `apps/dashboard/cardbey-marketing-dashboard/src/features/mi/ReviewStep.tsx` - Auto-redirect logic
- `apps/dashboard/cardbey-marketing-dashboard/src/pages/mi/MiJobStatusPage.tsx` - Job status page

### Backend
- `apps/core/cardbey-core/src/routes/business.js` - Canonical endpoint
- `apps/core/cardbey-core/src/services/miGeneration.ts` - Job processing

## Notes

- OCR jobs currently send `ocrRawText: null` and `imageUrl: null` from Quick Start. OCR processing may need to be handled separately (e.g., via file upload modal) before calling `startCreateBusiness()`.
- The backend endpoint creates a User (tenant) automatically if missing, allowing public users to create stores.
- Job processing is asynchronous; the frontend polls for status updates.


