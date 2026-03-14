# Test Results - Post Rollback Store Creation

**Date:** 2026-01-12  
**Status:** ⏳ **READY FOR TESTING**  
**Server:** ✅ Running on port 3001

---

## ✅ Pre-Test Checks

### Server Status
- ✅ Backend server running on port 3001 (PID: 1820)
- ✅ Code rollback complete
- ✅ No linter errors

### Rollback Verification
- ✅ tenantId declaration moved to after idempotency check (line 910)
- ✅ Idempotency check uses `req.userId` directly (line 788)
- ✅ storeIntent declared early as `null` (line 225)
- ✅ storeIntent loaded later from plan_store (line 308)
- ✅ Prisma profileName field restored in select (line 44)

---

## 🧪 Test Instructions

### Option 1: Manual UI Test (Recommended)

1. **Open Frontend:**
   - Navigate to Quick Start form
   - Enter: "Test Chinese Restaurant. Type: Chinese. Location: Melbourne"
   - Click "Create Store"

2. **Expected Behavior:**
   - ✅ Store creation starts
   - ✅ Job is created
   - ✅ Products are generated (10 products expected)
   - ✅ UI shows products after generation completes
   - ✅ No errors in console

3. **Check Browser Console:**
   - Look for any TDZ errors
   - Look for any Prisma validation errors
   - Look for any "Cannot access before initialization" errors

---

### Option 2: API Test (Using test-rollback.js)

1. **Get Auth Token:**
   - Log in via UI
   - Copy auth token from browser DevTools → Application → Cookies/LocalStorage

2. **Update test-rollback.js:**
   - Uncomment `Authorization` header lines
   - Add your auth token

3. **Run Test:**
   ```powershell
   node test-rollback.js
   ```

4. **Expected Output:**
   ```
   ✅ Job created: <jobId>
   ✅ Job started: running
   ✅ Sync complete: 10 products written
   ✅ Draft retrieved: 10 products
   ✅ ALL TESTS PASSED
   ```

---

### Option 3: Quick API Test (PowerShell)

```powershell
# 1. Create job
$body = @{
    goal = "build_store"
    rawInput = "Test Chinese Restaurant. Type: Chinese. Location: Melbourne"
    generationRunId = "test-rollback-$(Get-Date -Format 'yyyyMMddHHmmss')"
    createNewStore = $true
    businessName = "Test Chinese Restaurant"
    request = @{
        sourceType = "form"
        generationRunId = "test-rollback-$(Get-Date -Format 'yyyyMMddHHmmss')"
        businessType = "chinese"
        location = "Melbourne"
    }
    businessTypeHint = "chinese"
} | ConvertTo-Json -Depth 10

$response = Invoke-RestMethod -Uri "http://localhost:3001/api/mi/orchestra/start" `
    -Method POST `
    -Headers @{"Content-Type"="application/json"} `
    -Body $body

Write-Host "Job ID: $($response.jobId)"
Write-Host "Store ID: $($response.storeId)"
```

---

## ⚠️ Potential Issues to Watch For

### 1. Prisma profileName Error
**Symptom:** 
```
PrismaClientValidationError: Unknown field 'profileName' for model 'Business'
```

**Location:** `storeIntent.ts` line 44

**What to Check:**
- Check backend logs for Prisma validation errors
- If error occurs, the field doesn't exist in schema
- **Fix:** We may need to handle this gracefully or remove the field from select

---

### 2. TDZ Error (tenantId)
**Symptom:**
```
ReferenceError: Cannot access 'tenantId' before initialization
```

**Location:** `miRoutes.js` idempotency check

**What to Check:**
- Should NOT occur (we use `req.userId` directly in query)
- If it occurs, check line 788 in miRoutes.js

---

### 3. TDZ Error (storeIntent)
**Symptom:**
```
ReferenceError: Cannot access 'storeIntent' before initialization
```

**Location:** `seedCatalogService.ts` line 259

**What to Check:**
- Should NOT occur (we declare `storeIntent` as `null` at line 225)
- If it occurs, check line 225 in seedCatalogService.ts

---

## ✅ Success Criteria

After testing, verify:

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

## 📝 Test Results

**Status:** ⏳ **AWAITING TEST EXECUTION**

**Test Date:** _______________

**Tester:** _______________

### Results:

- [ ] Store creation works
- [ ] Products generated (count: _____)
- [ ] No TDZ errors
- [ ] No Prisma errors
- [ ] Draft endpoint returns products
- [ ] UI displays products correctly

### Issues Found:

1. ________________________________
2. ________________________________
3. ________________________________

---

## 🔧 If Issues Found

### If Prisma profileName Error:
1. Check Business schema in `prisma/schema.prisma`
2. If `profileName` doesn't exist, remove it from select
3. Use `name` as fallback (already implemented)

### If TDZ Errors:
1. Check variable declaration order
2. Ensure variables are declared before use
3. Use `req.userId` directly in queries if needed

### If Products Not Generated:
1. Check seed_catalog logs
2. Verify DraftStore.preview is updated
3. Check sync-store logs for productsWritten

---

**Next Steps:**
1. Run test (UI or API)
2. Document results
3. Fix any issues found
4. Re-test if needed

