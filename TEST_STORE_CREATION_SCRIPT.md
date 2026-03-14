# Store Creation Test Script - Post Rollback

**Date:** 2026-01-12  
**Purpose:** Test store creation after rollback to 1pm restore point  
**Expected:** Store creation should work as it did at 1pm

---

## Test Steps

### 1. Start Backend Server

```powershell
cd apps/core/cardbey-core
npm run dev
```

**Expected:** Server starts on port 3001 (or configured port)

---

### 2. Test Store Creation via Quick Start

**Endpoint:** `POST /api/mi/orchestra/start`

**Request:**
```json
{
  "goal": "build_store",
  "rawInput": "Test Chinese Restaurant. Type: Chinese. Location: Melbourne",
  "generationRunId": "test-gen-2026-01-12",
  "createNewStore": true,
  "businessName": "Test Chinese Restaurant",
  "request": {
    "sourceType": "form",
    "generationRunId": "test-gen-2026-01-12",
    "businessType": "chinese",
    "location": "Melbourne"
  },
  "businessTypeHint": "chinese"
}
```

**Expected Response:**
```json
{
  "ok": true,
  "jobId": "...",
  "storeId": "...",
  "generationRunId": "test-gen-2026-01-12",
  "status": "queued" or "running"
}
```

---

### 3. Test Job Execution

**Endpoint:** `POST /api/mi/orchestra/job/:jobId/run`

**Expected:**
- Job starts executing
- seed_catalog stage runs
- Products are generated
- DraftStore.preview is updated

---

### 4. Test Sync-Store

**Endpoint:** `POST /api/mi/orchestra/job/:jobId/sync-store`

**Request:**
```json
{
  "generationRunId": "test-gen-2026-01-12"
}
```

**Expected Response:**
```json
{
  "ok": true,
  "productsWritten": 10,
  "imagesWritten": 0,
  "storeId": "...",
  "jobId": "..."
}
```

---

### 5. Test Draft Endpoint

**Endpoint:** `GET /api/stores/:storeId/draft?generationRunId=test-gen-2026-01-12`

**Expected Response:**
```json
{
  "ok": true,
  "draftFound": true,
  "status": "ready",
  "draft": {
    "meta": {
      "storeId": "...",
      "status": "ready"
    },
    "catalog": {
      "products": [
        {
          "id": "...",
          "name": "...",
          "price": 10.00,
          ...
        }
      ],
      "categories": [...]
    }
  },
  "productsCount": 10
}
```

---

## What to Check

### ✅ Success Criteria:

1. **Store Creation:**
   - ✅ POST /api/mi/orchestra/start returns 200 with jobId
   - ✅ No TDZ errors in logs
   - ✅ No Prisma validation errors

2. **Catalog Generation:**
   - ✅ seed_catalog stage completes
   - ✅ Products are generated (10 products expected)
   - ✅ DraftStore.preview is updated with catalog

3. **Sync-Store:**
   - ✅ POST /api/mi/orchestra/job/:id/sync-store returns 200
   - ✅ productsWritten > 0
   - ✅ DraftStore status = 'ready'

4. **Draft Endpoint:**
   - ✅ GET /api/stores/:id/draft returns products
   - ✅ productsCount > 0
   - ✅ UI can display products

---

## Potential Issues to Watch For

### 1. Prisma profileName Error
**Symptom:** `PrismaClientValidationError: Unknown field 'profileName'`
**Location:** `storeIntent.ts` line 44
**Fix:** If this occurs, we may need to handle it gracefully or adjust the query

### 2. TDZ Errors
**Symptom:** `ReferenceError: Cannot access 'tenantId' before initialization`
**Location:** `miRoutes.js` idempotency check
**Fix:** Should be handled by using `req.userId` directly in query

### 3. storeIntent TDZ Error
**Symptom:** `ReferenceError: Cannot access 'storeIntent' before initialization`
**Location:** `seedCatalogService.ts` line 259
**Fix:** Should be handled by declaring `storeIntent` as `null` early

---

## Test Commands

### Using PowerShell:

```powershell
# 1. Test orchestra start
$body = @{
    goal = "build_store"
    rawInput = "Test Chinese Restaurant. Type: Chinese. Location: Melbourne"
    generationRunId = "test-gen-2026-01-12"
    createNewStore = $true
    businessName = "Test Chinese Restaurant"
    request = @{
        sourceType = "form"
        generationRunId = "test-gen-2026-01-12"
        businessType = "chinese"
        location = "Melbourne"
    }
    businessTypeHint = "chinese"
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:3001/api/mi/orchestra/start" `
    -Method POST `
    -Headers @{"Content-Type"="application/json"; "Authorization"="Bearer YOUR_TOKEN"} `
    -Body $body
```

---

## Expected Logs

### Backend Logs Should Show:

```
[ORCH_START] Starting orchestration...
[SEED_CATALOG][START] jobId=... storeId=... generationRunId=...
[SEED_CATALOG][COMPLETE] productsCount=10 categoriesCount=5
[SEED_CATALOG][DRAFT_STORE_UPDATED] DraftStore.preview updated with catalog
[SYNC_STORE_START] jobId=... storeId=... generationRunId=...
[SYNC_STORE_PRODUCTS_WRITTEN] productsWritten=10
```

### No Errors Should Appear:
- ❌ No TDZ errors
- ❌ No Prisma validation errors
- ❌ No "Cannot access before initialization" errors

---

## Rollback Verification

After testing, verify:
- ✅ Store creation works
- ✅ Products are generated
- ✅ Draft endpoint returns products
- ✅ UI can display products
- ✅ No new errors introduced

---

**Status:** ⏳ **READY FOR TESTING**

