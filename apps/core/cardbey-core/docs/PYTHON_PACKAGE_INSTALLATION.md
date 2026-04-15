# Python Package Installation for SAM-3

## Issue: NumPy Build Error on Python 3.14

Python 3.14 is very new and some packages (like NumPy) may not have pre-built wheels available yet, causing build errors.

## Solutions

### Option 1: Use Pre-built Wheels (Recommended)

Try installing with pre-built wheels only:

```powershell
python -m pip install --only-binary :all: numpy torch torchvision pillow opencv-python
```

### Option 2: Install Visual Studio Build Tools

If you need to build from source, install Visual Studio Build Tools:

1. Download: https://visualstudio.microsoft.com/downloads/
2. Install "Desktop development with C++" workload
3. Restart PowerShell
4. Try installing packages again

### Option 3: Use Python 3.11 or 3.12 (Best Compatibility)

Python 3.11 and 3.12 have better package support:

1. Install Python 3.12 from [python.org](https://www.python.org/downloads/)
2. Set in `.env`:
   ```env
   PYTHON_COMMAND=C:\Users\desig\AppData\Local\Programs\Python\Python312\python.exe
   ```
3. Restart server and install packages

### Option 4: Install Packages Individually

Install packages one at a time to see which ones work:

```powershell
# These usually work with pre-built wheels
python -m pip install pillow
python -m pip install opencv-python

# NumPy - try pre-built wheel first
python -m pip install --only-binary :all: numpy
# If that fails, try without the flag
python -m pip install numpy

# PyTorch - use CPU version (smaller, faster to install)
python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
python -m pip install torchvision
```

## Quick Fix Script

Run the updated installation script:

```powershell
.\scripts\install-sam3-dependencies.ps1
```

This script will:
- Try to use pre-built wheels
- Handle errors gracefully
- Provide helpful suggestions

## Verify Installation

After installation, test Python packages:

```powershell
python -c "import torch; import numpy; import cv2; from PIL import Image; print('All packages installed!')"
```

If this works, restart your Node.js server and try SAM-3 again.













