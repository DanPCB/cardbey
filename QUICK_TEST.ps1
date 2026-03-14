# Quick Test Script for MI Orchestrator Unification
# Run this script to test the unified orchestrator

$baseUrl = "http://localhost:3001"

Write-Host "=== MI Orchestrator Unification Test ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Get guest token
Write-Host "Step 1: Getting guest session token..." -ForegroundColor Yellow
try {
    $guestResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/guest" `
        -Method POST `
        -Headers @{ "Content-Type" = "application/json" }
    $token = $guestResponse.token
    Write-Host "✓ Token obtained: $($token.Substring(0, [Math]::Min(30, $token.Length)))..." -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to get guest token. Trying 'admin' token..." -ForegroundColor Yellow
    $token = "admin"  # Fallback to admin token in dev mode
}

# CRITICAL: Always use "Bearer " prefix
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"  # "Bearer " prefix is REQUIRED
}

Write-Host ""
Write-Host "Step 2: Creating job with goal='build_store'..." -ForegroundColor Yellow

# Test 1: Create job with goal='build_store' (no entryPoint)
$createBody = @{
    goal = "build_store"
    businessName = "Test Store"
    businessType = "Florist"
    generationRunId = "test-$(Get-Date -Format 'yyyyMMddHHmmss')"
    createNewStore = $true
} | ConvertTo-Json

try {
    $createResponse = Invoke-RestMethod -Uri "$baseUrl/api/mi/orchestra/start" `
        -Method POST `
        -Headers $headers `
        -Body $createBody

    Write-Host "✓ Job created successfully!" -ForegroundColor Green
    Write-Host "  JobId: $($createResponse.jobId)" -ForegroundColor Cyan
    Write-Host "  EntryPoint: $($createResponse.entryPoint)" -ForegroundColor Cyan
    Write-Host "  Status: $($createResponse.status)" -ForegroundColor Cyan
    Write-Host "  GenerationRunId: $($createResponse.generationRunId)" -ForegroundColor Cyan
    Write-Host ""
    
    # Verify entryPoint is 'build_store'
    if ($createResponse.entryPoint -eq 'build_store') {
        Write-Host "✓ EntryPoint normalization verified: 'build_store'" -ForegroundColor Green
    } else {
        Write-Host "✗ WARNING: EntryPoint is '$($createResponse.entryPoint)', expected 'build_store'" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "Step 3: Running job..." -ForegroundColor Yellow
    
    # Test 2: Run the job
    $runBody = @{
        generationRunId = $createResponse.generationRunId
    } | ConvertTo-Json
    
    $runResponse = Invoke-RestMethod -Uri "$baseUrl/api/mi/orchestra/job/$($createResponse.jobId)/run" `
        -Method POST `
        -Headers $headers `
        -Body $runBody
    
    Write-Host "✓ Job executed successfully!" -ForegroundColor Green
    Write-Host "  Job Status: $($runResponse.job.status)" -ForegroundColor Cyan
    Write-Host "  EntryPoint: $($runResponse.job.entryPoint)" -ForegroundColor Cyan
    Write-Host "  Skipped Stages: $($runResponse.skippedStages.Count)" -ForegroundColor Cyan
    Write-Host "  Stage Results: $($runResponse.stageResults.Keys -join ', ')" -ForegroundColor Cyan
    Write-Host ""
    
    # Verify execution via unified orchestrator
    if ($runResponse.job.entryPoint -eq 'build_store') {
        Write-Host "✓ Unified orchestrator execution verified!" -ForegroundColor Green
    } else {
        Write-Host "✗ WARNING: EntryPoint is '$($runResponse.job.entryPoint)', expected 'build_store'" -ForegroundColor Red
    }
    
    # Verify status is 'completed' (not 'running')
    if ($runResponse.job.status -eq 'completed') {
        Write-Host "✓ Job status is 'completed' (correct)" -ForegroundColor Green
    } else {
        Write-Host "✗ WARNING: Job status is '$($runResponse.job.status)', expected 'completed'" -ForegroundColor Red
    }
    
    # Verify stage results
    if ($runResponse.stageResults.plan_store -and $runResponse.stageResults.plan_store.ok) {
        Write-Host "✓ plan_store stage completed" -ForegroundColor Green
    }
    if ($runResponse.stageResults.seed_catalog -and $runResponse.stageResults.seed_catalog.ok) {
        Write-Host "✓ seed_catalog stage completed" -ForegroundColor Green
    }
    if ($runResponse.stageResults.store_hero) {
        if ($runResponse.stageResults.store_hero.ok) {
            Write-Host "✓ store_hero stage completed" -ForegroundColor Green
        } else {
            Write-Host "⚠ store_hero stage skipped or failed (non-fatal)" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host "Step 4: Verifying job status via GET endpoint..." -ForegroundColor Yellow
    
    # Test 3: GET job status to verify it's persisted as 'completed'
    $statusResponse = Invoke-RestMethod -Uri "$baseUrl/api/mi/orchestra/job/$($createResponse.jobId)" `
        -Method GET `
        -Headers $headers
    
    if ($statusResponse.job.status -eq 'completed') {
        Write-Host "✓ GET /job/:id shows status='completed' (persisted correctly)" -ForegroundColor Green
    } else {
        Write-Host "✗ WARNING: GET /job/:id shows status='$($statusResponse.job.status)', expected 'completed'" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "=== Test Complete ===" -ForegroundColor Cyan
    Write-Host "Check backend logs for:" -ForegroundColor Yellow
    Write-Host "  - [ORCH_START][ENTRYPOINT_NORMALIZATION]" -ForegroundColor Gray
    Write-Host "  - [MI Orchestra] [RUN] Dispatching to unified orchestrator" -ForegroundColor Gray
    Write-Host "  - [Orchestrator] runOrchestrator start" -ForegroundColor Gray
    Write-Host "  - [BuildStoreService] Executing plan_store stage" -ForegroundColor Gray
    Write-Host "  - [MI Orchestra] [RUN] Task ... status updated to 'completed'" -ForegroundColor Gray
    
} catch {
    Write-Host "✗ Error: $_" -ForegroundColor Red
    Write-Host "Response: $($_.Exception.Response)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

