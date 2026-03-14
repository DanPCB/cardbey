# MI Orchestrator Unification - Manual Test Checklist

## PowerShell-Compatible Test Commands

### Prerequisites
- Backend server running on `http://localhost:3001`
- Valid auth token (see "Getting a Token" section below)

### Getting a Token

**Option 1: Get a Guest Session Token**

```powershell
# Get guest session token
$guestResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/guest" `
    -Method POST `
    -Headers @{ "Content-Type" = "application/json" }

$token = $guestResponse.token
Write-Host "Guest token: $token"

# CRITICAL: Always use "Bearer " prefix in Authorization header
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"  # Note: "Bearer " prefix is required
}
```

**Option 2: Use Admin Token (if available)**

```powershell
# If you have an admin token, use it directly
$token = "admin"  # Default admin token in dev mode
```

**Option 3: Sign In and Get Token**

```powershell
# Sign in to get a token (replace with your credentials)
$loginBody = @{
    email = "your-email@example.com"
    password = "your-password"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" `
    -Method POST `
    -Headers @{ "Content-Type" = "application/json" } `
    -Body $loginBody

$token = $loginResponse.token
```

---

## Test A: Start creates entryPoint=build_store

### Step 0: Get a Token First

```powershell
# Get guest session token
$guestResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/guest" `
    -Method POST `
    -Headers @{ "Content-Type" = "application/json" }

$token = $guestResponse.token
Write-Host "Using token: $token" -ForegroundColor Green
```

### Test 1: QuickStart with goal='build_store' (no entryPoint specified)

```powershell
# PowerShell using Invoke-RestMethod
# Use token from Step 0
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}

$body = @{
    goal = "build_store"
    businessName = "Test Store"
    businessType = "Florist"
    generationRunId = "test-gen-001"
    createNewStore = $true
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3001/api/mi/orchestra/start" `
    -Method POST `
    -Headers $headers `
    -Body $body

# Check response
$response | ConvertTo-Json -Depth 10

# Expected:
# - Response includes jobId
# - Log shows: [ORCH_START][ENTRYPOINT_NORMALIZATION] goal=build_store entryPoint=(omitted) normalizedEntryPoint=build_store
# - Task created with entryPoint='build_store' (check DB or response.entryPoint)
```

### Test 2: Legacy client sending entryPoint='store_generation'

```powershell
# Use token from Step 0
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}

$body = @{
    entryPoint = "store_generation"
    goal = "build_store"
    businessName = "Test Store 2"
    generationRunId = "test-gen-002"
    createNewStore = $true
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3001/api/mi/orchestra/start" `
    -Method POST `
    -Headers $headers `
    -Body $body

$response | ConvertTo-Json -Depth 10

# Expected:
# - Log shows: [ORCH_START][ENTRYPOINT_NORMALIZATION] goal=build_store entryPoint=store_generation normalizedEntryPoint=build_store
# - Task created with entryPoint='build_store' (normalized)
# - Response.entryPoint should be 'build_store'
```

---

## Test B: Run executes runOrchestrator path

### Test 3: Run job created in Test 1

```powershell
# Replace JOB_ID_FROM_TEST_1 with actual jobId from Test 1 response
$jobId = "YOUR_JOB_ID_HERE"

# Use token from Step 0
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}

$body = @{
    generationRunId = "test-gen-001"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3001/api/mi/orchestra/job/$jobId/run" `
    -Method POST `
    -Headers $headers `
    -Body $body

$response | ConvertTo-Json -Depth 10

# Expected:
# - Log shows: [MI Orchestra] [RUN] Dispatching to unified orchestrator: { entryPoint: 'build_store', goal: 'build_store', ... }
# - Log shows: [Orchestrator] runOrchestrator start { entryPoint: 'build_store', ... }
# - Log shows: [BuildStoreService] Starting
# - Log shows: [BuildStoreService] Executing plan_store stage
# - Log shows: [BuildStoreService] Executing seed_catalog stage
# - Log shows: [BuildStoreService] Executing store_hero stage (if seed_catalog succeeded)
# - Response includes: { ok: true, skippedStages: [], stageResults: { plan_store: {...}, seed_catalog: {...}, ... } }
# - Response.job.entryPoint should be 'build_store'
```

### Test 4: Run legacy task with entryPoint='store_generation'

```powershell
# Replace LEGACY_JOB_ID with a task that has entryPoint='store_generation'
$jobId = "LEGACY_JOB_ID"

# Use token from Step 0
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}

$body = @{
    generationRunId = "legacy-gen-001"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3001/api/mi/orchestra/job/$jobId/run" `
    -Method POST `
    -Headers $headers `
    -Body $body

$response | ConvertTo-Json -Depth 10

# Expected:
# - Log shows: [MI Orchestra] [ENTRYPOINT_NORMALIZATION] Normalized entryPoint 'store_generation' -> 'build_store'
# - Log shows: [MI Orchestra] [ENTRYPOINT_MIGRATION] Migrated task ... entryPoint from 'store_generation' to 'build_store'
# - Task entryPoint updated in DB to 'build_store'
# - Execution proceeds via unified orchestrator (same as Test 3)
```

---

## Alternative: Using curl.exe (if available)

If you have `curl.exe` installed (Windows 10+ usually has it), you can use:

```powershell
# Test 1 (curl.exe)
curl.exe -X POST http://localhost:3001/api/mi/orchestra/start `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -d '{\"goal\":\"build_store\",\"businessName\":\"Test Store\",\"businessType\":\"Florist\",\"generationRunId\":\"test-gen-001\",\"createNewStore\":true}'

# Test 3 (curl.exe)
curl.exe -X POST "http://localhost:3001/api/mi/orchestra/job/YOUR_JOB_ID/run" `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -d '{\"generationRunId\":\"test-gen-001\"}'
```

---

## Verification Checklist

### ✅ Backend Logs to Check

1. **On /start:**
   - `[ORCH_START][ENTRYPOINT_NORMALIZATION] goal=build_store entryPoint=... normalizedEntryPoint=build_store`
   - `[MI_PIPELINE][TASK_CREATED] taskId=... entryPoint=build_store goal=build_store`

2. **On /run:**
   - `[MI Orchestra] [ENTRYPOINT_NORMALIZATION] Normalized entryPoint 'store_generation' -> 'build_store'` (if legacy)
   - `[MI Orchestra] [ENTRYPOINT_MIGRATION] Migrated task ... entryPoint from 'store_generation' to 'build_store'` (if legacy)
   - `[MI Orchestra] [RUN] Dispatching to unified orchestrator: { entryPoint: 'build_store', ... }`
   - `[Orchestrator] runOrchestrator start { entryPoint: 'build_store', ... }`
   - `[BuildStoreService] Starting`
   - `[BuildStoreService] Executing plan_store stage`
   - `[BuildStoreService] Executing seed_catalog stage`
   - `[BuildStoreService] Executing store_hero stage` (if seed_catalog succeeded)
   - `[MI Orchestra] [RUN] Task ... status updated to 'completed'`

### ✅ Database Verification

```sql
-- Check task entryPoint and status
SELECT id, entryPoint, status, request->>'goal' as goal, result->>'ok' as result_ok
FROM "OrchestratorTask" 
WHERE id = 'YOUR_JOB_ID';

-- Should show:
-- entryPoint = 'build_store'
-- status = 'completed' (after /run)
-- result_ok = 'true'
```

### ✅ Response Verification

**After /start:**
- `response.ok` = `true`
- `response.entryPoint` = `'build_store'` (or check job status endpoint)

**After /run:**
- `response.ok` = `true`
- `response.job.entryPoint` = `'build_store'`
- `response.job.status` = `'completed'` (not 'running')
- `response.job.result.ok` = `true`
- `response.skippedStages` = `[]` (or array of skipped stages like `store_hero` if service missing)
- `response.stageResults` contains:
  - `plan_store: { ok: true }`
  - `seed_catalog: { ok: true, counts: { products: N, categories: M } }`
  - `store_hero: { ok: true, output: {...} }` (if available) or skipped

**After GET /job/:jobId:**
- `response.job.status` = `'completed'` (not 'running')
- `response.job.result.ok` = `true`
- `response.job.result.stageResults` contains all executed stages

---

## Quick Test Script (PowerShell)

```powershell
# Quick test script - automatically gets guest token
$baseUrl = "http://localhost:3001"

# Step 1: Get guest token
Write-Host "Getting guest session token..." -ForegroundColor Cyan
try {
    $guestResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/guest" `
        -Method POST `
        -Headers @{ "Content-Type" = "application/json" }
    $token = $guestResponse.token
    Write-Host "Token obtained: $($token.Substring(0, [Math]::Min(20, $token.Length)))..." -ForegroundColor Green
} catch {
    Write-Host "Failed to get guest token. Error: $_" -ForegroundColor Red
    Write-Host "Trying with 'admin' token..." -ForegroundColor Yellow
    $token = "admin"  # Fallback to admin token in dev mode
}

$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}

# Test 1: Create job
Write-Host "Test 1: Creating job with goal='build_store'..." -ForegroundColor Cyan
$createBody = @{
    goal = "build_store"
    businessName = "Test Store"
    businessType = "Florist"
    generationRunId = "test-$(Get-Date -Format 'yyyyMMddHHmmss')"
    createNewStore = $true
} | ConvertTo-Json

$createResponse = Invoke-RestMethod -Uri "$baseUrl/api/mi/orchestra/start" `
    -Method POST `
    -Headers $headers `
    -Body $createBody

Write-Host "Job created: $($createResponse.jobId)" -ForegroundColor Green
Write-Host "EntryPoint: $($createResponse.entryPoint)" -ForegroundColor Green
Write-Host ""

# Test 2: Run job
Write-Host "Test 2: Running job $($createResponse.jobId)..." -ForegroundColor Cyan
$runBody = @{
    generationRunId = $createResponse.generationRunId
} | ConvertTo-Json

$runResponse = Invoke-RestMethod -Uri "$baseUrl/api/mi/orchestra/job/$($createResponse.jobId)/run" `
    -Method POST `
    -Headers $headers `
    -Body $runBody

Write-Host "Job status: $($runResponse.job.status)" -ForegroundColor Green
Write-Host "EntryPoint: $($runResponse.job.entryPoint)" -ForegroundColor Green
Write-Host "Skipped stages: $($runResponse.skippedStages.Count)" -ForegroundColor Green
Write-Host "Stage results: $($runResponse.stageResults.Keys -join ', ')" -ForegroundColor Green
```

