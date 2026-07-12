# scripts/check-development-files.ps1
# Run this script from the root of the cardbey repository
# Usage: .\scripts\check-development-files.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Cardbey Development Runtime - File Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Continue"

# Define the expected files
$expectedFiles = @{
    # Types (10 files)
    "apps/core/cardbey-core/src/development/types/DevelopmentMission.ts" = @{Category="Types"}
    "apps/core/cardbey-core/src/development/types/DevelopmentEvidence.ts" = @{Category="Types"}
    "apps/core/cardbey-core/src/development/types/DevelopmentImpactReport.ts" = @{Category="Types"}
    "apps/core/cardbey-core/src/development/types/DevelopmentPlan.ts" = @{Category="Types"}
    "apps/core/cardbey-core/src/development/types/DevelopmentWorkspace.ts" = @{Category="Types"}
    "apps/core/cardbey-core/src/development/types/DevelopmentPatch.ts" = @{Category="Types"}
    "apps/core/cardbey-core/src/development/types/DevelopmentCheckRun.ts" = @{Category="Types"}
    "apps/core/cardbey-core/src/development/types/DevelopmentReview.ts" = @{Category="Types"}
    "apps/core/cardbey-core/src/development/types/DevelopmentDeployment.ts" = @{Category="Types"}
    "apps/core/cardbey-core/src/development/types/DevelopmentEvent.ts" = @{Category="Types"}
    "apps/core/cardbey-core/src/development/types/index.ts" = @{Category="Types"}

    # State (1 file)
    "apps/core/cardbey-core/src/development/state/DevelopmentStateMachine.ts" = @{Category="State"}
    "apps/core/cardbey-core/src/development/state/index.ts" = @{Category="State"}

    # Orchestrator (1 file)
    "apps/core/cardbey-core/src/development/orchestrator/DevelopmentOrchestrator.ts" = @{Category="Orchestrator"}
    "apps/core/cardbey-core/src/development/orchestrator/index.ts" = @{Category="Orchestrator"}

    # Tools (18 files)
    "apps/core/cardbey-core/src/development/tools/createDevelopmentMission.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/freezeDevelopmentEvidence.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/analyseDevelopmentImpact.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/proposeDevelopmentDesign.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/approveDevelopmentDesign.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/prepareDevelopmentWorkspace.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/implementDevelopmentChange.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/runDevelopmentChecks.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/submitDevelopmentPatchReview.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/approveDevelopmentPatch.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/openDevelopmentPullRequest.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/observeCIResult.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/requestStagingDeployment.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/verifyStagingDeployment.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/approveProductionRelease.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/verifyProductionRelease.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/rollbackDevelopmentRelease.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/cancelDevelopmentMission.ts" = @{Category="Tools"}
    "apps/core/cardbey-core/src/development/tools/index.ts" = @{Category="Tools"}

    # Agents (7 files)
    "apps/core/cardbey-core/src/development/agents/DevelopmentPlannerAgent.ts" = @{Category="Agents"}
    "apps/core/cardbey-core/src/development/agents/CodeImplementationAgent.ts" = @{Category="Agents"}
    "apps/core/cardbey-core/src/development/agents/TestAgent.ts" = @{Category="Agents"}
    "apps/core/cardbey-core/src/development/agents/SecurityReviewAgent.ts" = @{Category="Agents"}
    "apps/core/cardbey-core/src/development/agents/MigrationReviewAgent.ts" = @{Category="Agents"}
    "apps/core/cardbey-core/src/development/agents/ReleaseVerificationAgent.ts" = @{Category="Agents"}
    "apps/core/cardbey-core/src/development/agents/index.ts" = @{Category="Agents"}

    # Workspace (3 files)
    "apps/core/cardbey-core/src/development/workspace/WorkspaceManager.ts" = @{Category="Workspace"}
    "apps/core/cardbey-core/src/development/workspace/CommandPolicy.ts" = @{Category="Workspace"}
    "apps/core/cardbey-core/src/development/workspace/index.ts" = @{Category="Workspace"}

    # GitHub (3 files)
    "apps/core/cardbey-core/src/development/github/GitHubClient.ts" = @{Category="GitHub"}
    "apps/core/cardbey-core/src/development/github/GitHubApp.ts" = @{Category="GitHub"}
    "apps/core/cardbey-core/src/development/github/index.ts" = @{Category="GitHub"}

    # Manifest (2 files)
    "apps/core/cardbey-core/src/development/manifest/RepositoryManifest.ts" = @{Category="Manifest"}
    "apps/core/cardbey-core/src/development/manifest/index.ts" = @{Category="Manifest"}

    # API Routes (1 file)
    "apps/core/cardbey-core/src/routes/development.routes.ts" = @{Category="API Routes"}

    # Index file
    "apps/core/cardbey-core/src/development/index.ts" = @{Category="Index"}
}

# Frontend Components (8 files)
$frontendComponents = @(
    "DevelopmentMissionCard.tsx"
    "DevelopmentImpactReviewCard.tsx"
    "DevelopmentDesignReviewCard.tsx"
    "DevelopmentPatchReviewCard.tsx"
    "DevelopmentCheckResultsCard.tsx"
    "DevelopmentPullRequestCard.tsx"
    "DevelopmentStagingVerificationCard.tsx"
    "DevelopmentReleaseApprovalCard.tsx"
    "index.ts"
)

$frontendPath = "apps/dashboard/cardbey-marketing-dashboard/src/components/development/"

$allFilesPresent = $true
$missingFiles = @()
$presentFiles = @()

Write-Host "🔍 Checking core files..." -ForegroundColor Yellow
Write-Host ""

# Check all expected files
foreach ($file in $expectedFiles.Keys) {
    $category = $expectedFiles[$file].Category
    if (Test-Path $file) {
        Write-Host "  ✅ [$category] $file" -ForegroundColor Green
        $presentFiles += $file
    } else {
        Write-Host "  ❌ [$category] $file - MISSING" -ForegroundColor Red
        $missingFiles += $file
        $allFilesPresent = $false
    }
}

# Check frontend components
Write-Host ""
Write-Host "🔍 Checking frontend components..." -ForegroundColor Yellow
Write-Host ""

foreach ($component in $frontendComponents) {
    $fullPath = $frontendPath + $component
    if (Test-Path $fullPath) {
        Write-Host "  ✅ $fullPath" -ForegroundColor Green
        $presentFiles += $fullPath
    } else {
        Write-Host "  ❌ $fullPath - MISSING" -ForegroundColor Red
        $missingFiles += $fullPath
        $allFilesPresent = $false
    }
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$totalCoreFiles = $expectedFiles.Count
$totalFrontendFiles = $frontendComponents.Count
$totalFiles = $totalCoreFiles + $totalFrontendFiles
$presentCount = $presentFiles.Count
$missingCount = $missingFiles.Count

Write-Host "  Core Files:   $($expectedFiles.Count) expected, $($presentFiles.Count - $totalFrontendFiles) found" -ForegroundColor White
Write-Host "  Frontend:     $($frontendComponents.Count) expected, $($frontendComponents.Count - ($missingFiles | Where-Object { $_ -like "$frontendPath*" }).Count) found" -ForegroundColor White
Write-Host "  Total:        $totalFiles expected, $presentCount found, $missingCount missing" -ForegroundColor White
Write-Host ""

if ($allFilesPresent) {
    Write-Host "✅ ALL FILES ARE PRESENT!" -ForegroundColor Green
    Write-Host "🎉 The Development Runtime is complete!" -ForegroundColor Green
} else {
    Write-Host "❌ $missingCount files are missing!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Missing files:" -ForegroundColor Yellow
    foreach ($file in $missingFiles) {
        Write-Host "  - $file" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Please create the missing files before proceeding." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan