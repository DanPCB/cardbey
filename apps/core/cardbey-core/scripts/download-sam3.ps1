# Download SAM-3 Model from Hugging Face
# This script downloads SAM-3 without requiring Python installation

param(
    [string]$Token = "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",
    [string]$ModelRepo = "facebook/sam3-hiera-large",
    [string]$OutputDir = "models/sam3_hiera_large"
)

Write-Host "=== SAM-3 Model Download Script ===" -ForegroundColor Cyan
Write-Host ""

# Create output directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    Write-Host "Created directory: $OutputDir" -ForegroundColor Green
}

# Check if we can use Python (if available)
$pythonCmd = $null
$python3Cmd = $null

if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    $python3Cmd = "python3"
}

if ($pythonCmd -or $python3Cmd) {
    Write-Host "Python found! Using Python to download model..." -ForegroundColor Green
    
    $pythonExe = if ($pythonCmd) { $pythonCmd } else { $python3Cmd }
    
    # Install huggingface-hub if needed
    Write-Host "Installing huggingface-hub..." -ForegroundColor Yellow
    & $pythonExe -m pip install --quiet huggingface-hub 2>&1 | Out-Null
    
    # Download model
    Write-Host "Downloading SAM-3 model from Hugging Face..." -ForegroundColor Yellow
    Write-Host "Repository: $ModelRepo" -ForegroundColor Gray
    Write-Host "Output: $OutputDir" -ForegroundColor Gray
    Write-Host ""
    
    $downloadScript = @"
import os
from huggingface_hub import snapshot_download
import sys

try:
    token = "$Token"
    repo_id = "$ModelRepo"
    local_dir = "$OutputDir"
    
    print(f"Downloading {repo_id} to {local_dir}...")
    snapshot_download(
        repo_id=repo_id,
        local_dir=local_dir,
        token=token,
        local_dir_use_symlinks=False
    )
    print("Download complete!")
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
"@
    
    $downloadScript | & $pythonExe - 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Model downloaded successfully!" -ForegroundColor Green
        Write-Host "Location: $OutputDir" -ForegroundColor Cyan
    } else {
        Write-Host ""
        Write-Host "❌ Download failed. Trying alternative method..." -ForegroundColor Red
    }
}

# Alternative: Use curl/wget to download files directly
if (-not (Test-Path "$OutputDir/sam3_hiera_large.pt")) {
    Write-Host ""
    Write-Host "=== Alternative: Direct Download ===" -ForegroundColor Yellow
    Write-Host "Note: This requires manual Hugging Face API calls" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To download manually:" -ForegroundColor Cyan
    Write-Host "1. Go to: https://huggingface.co/$ModelRepo" -ForegroundColor White
    Write-Host "2. Click 'Files and versions' tab" -ForegroundColor White
    Write-Host "3. Download 'sam3_hiera_large.pt' file" -ForegroundColor White
    Write-Host "4. Save to: $OutputDir" -ForegroundColor White
    Write-Host ""
    Write-Host "Or use Hugging Face CLI (if installed):" -ForegroundColor Cyan
    Write-Host "  huggingface-cli download $ModelRepo --local-dir $OutputDir --token $Token" -ForegroundColor White
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan


















