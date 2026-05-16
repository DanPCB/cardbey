# Quick Setup: Python 3.12 for SAM-3

## Step 1: Install Python 3.12

1. **Find the installer** you downloaded (usually in Downloads folder)
   - Look for: `python-3.12.x-amd64.exe` or similar

2. **Run the installer**
   - Double-click the `.exe` file
   - **CRITICAL**: Check ✅ **"Add Python 3.12 to PATH"** at the bottom
   - Click **"Install Now"**
   - Wait for installation (2-3 minutes)

## Step 2: Verify Installation

Open a **NEW PowerShell window** and run:

```powershell
python --version
```

Should show: `Python 3.12.x`

If it still shows 3.14, Python 3.12 is installed but not in PATH. Continue to Step 3.

## Step 3: Find Python 3.12 Path

Run this to find where Python 3.12 was installed:

```powershell
Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\" -Directory | Select-Object Name
```

Look for `Python312` folder. The full path will be:
```
C:\Users\desig\AppData\Local\Programs\Python\Python312\python.exe
```

## Step 4: Configure Backend

Create or edit `.env` file in your project root:

```env
PYTHON_COMMAND=C:\Users\desig\AppData\Local\Programs\Python\Python312\python.exe
```

(Use the actual path from Step 3)

## Step 5: Install Packages

Run this command (use the full path if Python 3.12 isn't in PATH):

```powershell
# If Python 3.12 is in PATH:
python -m pip install torch torchvision pillow opencv-python numpy

# Or use full path:
C:\Users\desig\AppData\Local\Programs\Python\Python312\python.exe -m pip install torch torchvision pillow opencv-python numpy
```

**Note**: This will take 5-15 minutes (PyTorch is large).

## Step 6: Restart Server

Stop your Node.js server (Ctrl+C) and restart:

```powershell
npm run dev
```

Check logs for:
```
[SAM3] ✅ Python detected and ready
command: C:\Users\desig\AppData\Local\Programs\Python\Python312\python.exe
version: Python 3.12.x
```

## Step 7: Test

Try your background removal request again - it should work now! 🎉













