# Install SAM-3 Python Dependencies
# Run this script to install all required Python packages for SAM-3

Write-Host "Installing SAM-3 Python dependencies..." -ForegroundColor Cyan

# Detect Python
$pythonCmd = $null

# Try python first
try {
    $version = python --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $pythonCmd = "python"
        Write-Host "Found Python: $version" -ForegroundColor Green
    }
} catch {
    # Continue
}

# Try python3 if python didn't work
if (-not $pythonCmd) {
    try {
        $version = python3 --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $pythonCmd = "python3"
            Write-Host "Found Python: $version" -ForegroundColor Green
        }
    } catch {
        # Continue
    }
}

# Try common Windows paths
if (-not $pythonCmd) {
    $userHome = $env:USERPROFILE
    $commonPaths = @(
        "$userHome\AppData\Local\Programs\Python\Python314\python.exe",
        "$userHome\AppData\Local\Programs\Python\Python313\python.exe",
        "$userHome\AppData\Local\Programs\Python\Python312\python.exe",
        "$userHome\AppData\Local\Programs\Python\Python311\python.exe"
    )
    
    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            $pythonCmd = $path
            Write-Host "Found Python at: $path" -ForegroundColor Green
            break
        }
    }
}

if (-not $pythonCmd) {
    Write-Host "ERROR: Python not found!" -ForegroundColor Red
    Write-Host "Please install Python from python.org or Microsoft Store" -ForegroundColor Yellow
    Write-Host "See docs/PYTHON_INSTALLATION_WINDOWS.md for instructions" -ForegroundColor Yellow
    exit 1
}

Write-Host "`nInstalling packages with: $pythonCmd" -ForegroundColor Cyan
Write-Host "This may take several minutes..." -ForegroundColor Yellow

# Upgrade pip first
Write-Host "`nUpgrading pip..." -ForegroundColor Cyan
& $pythonCmd -m pip install --upgrade pip

# Install packages with pre-built wheels (avoid building from source)
Write-Host "`nInstalling packages (using pre-built wheels)..." -ForegroundColor Cyan

# Install packages one by one with specific versions that have pre-built wheels
# For Python 3.14, we may need to use compatible versions

# Try to install numpy first with a specific version that has wheels
Write-Host "`nInstalling numpy (this may take a while)..." -ForegroundColor Cyan
& $pythonCmd -m pip install --only-binary :all: numpy
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: numpy installation failed, trying without --only-binary..." -ForegroundColor Yellow
    & $pythonCmd -m pip install numpy
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install numpy" -ForegroundColor Red
        Write-Host "Python 3.14 may not have pre-built wheels for all packages." -ForegroundColor Yellow
        Write-Host "Consider using Python 3.11 or 3.12 for better package compatibility." -ForegroundColor Yellow
        exit 1
    }
}

# Install other packages
$packages = @(
    "pillow",
    "opencv-python"
)

foreach ($package in $packages) {
    Write-Host "`nInstalling $package..." -ForegroundColor Cyan
    & $pythonCmd -m pip install $package
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install $package" -ForegroundColor Red
        exit 1
    }
}

# Install PyTorch (this is large and may take a while)
Write-Host "`nInstalling PyTorch (this will take several minutes)..." -ForegroundColor Cyan
Write-Host "Installing torch..." -ForegroundColor Cyan
& $pythonCmd -m pip install torch --index-url https://download.pytorch.org/whl/cpu
if ($LASTEXITCODE -ne 0) {
    Write-Host "Trying torch without index URL..." -ForegroundColor Yellow
    & $pythonCmd -m pip install torch
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install torch" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Installing torchvision..." -ForegroundColor Cyan
& $pythonCmd -m pip install torchvision
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install torchvision" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ All packages installed successfully!" -ForegroundColor Green
Write-Host "`nYou can now restart your Node.js server." -ForegroundColor Cyan

