# Python Download Links for Windows

## ⚠️ Important: Python 3.12.12+ No Longer Has Installers

Python 3.12.12 and later are in "security fixes only" stage and **do not have Windows installers**. Only source code is available.

## ✅ Recommended: Python 3.12.10 (Last Version with Installers)

**Direct Download Link:**
https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe

**Or go to:**
https://www.python.org/downloads/release/python-31210/

Look for: **"Windows installer (64-bit)"** - the `.exe` file (~25-30 MB)

## ✅ Alternative: Python 3.11 (Fully Supported)

Python 3.11 is still fully supported and has excellent package compatibility:

**Direct Download Link:**
https://www.python.org/ftp/python/3.11.11/python-3.11.11-amd64.exe

**Or go to:**
https://www.python.org/downloads/release/python-31111/

Look for: **"Windows installer (64-bit)"** - the `.exe` file

## Installation Steps

1. **Download** the `.exe` installer (not source code)
2. **Run** the installer
3. **Check** ✅ "Add Python to PATH" at the bottom
4. **Click** "Install Now"
5. **Wait** for installation (2-3 minutes)

## After Installation

1. **Open NEW PowerShell** (to refresh PATH)
2. **Verify**: `python --version` should show Python 3.12.10 or 3.11.x
3. **Install packages**: `python -m pip install torch torchvision pillow opencv-python numpy`
4. **Set in .env**: `PYTHON_COMMAND=C:\Users\desig\AppData\Local\Programs\Python\Python312\python.exe`
5. **Restart server**: `npm run dev`













