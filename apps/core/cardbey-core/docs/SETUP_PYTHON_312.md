# Setting Up Python 3.12 for SAM-3

## Step 1: Install Python 3.12

1. Run the Python 3.12 installer you downloaded
2. **IMPORTANT**: Check the box **"Add Python 3.12 to PATH"** during installation
3. Click "Install Now"
4. Wait for installation to complete

## Step 2: Verify Installation

Open a **NEW** PowerShell window (important - to refresh PATH) and run:

```powershell
python --version
```

Should show: `Python 3.12.x`

If it still shows 3.14, Python 3.12 might not be in PATH. Continue to Step 3.

## Step 3: Find Python 3.12 Installation Path

Find where Python 3.12 was installed:

```powershell
where.exe python
```

Or check common locations:
- `C:\Users\desig\AppData\Local\Programs\Python\Python312\python.exe`
- `C:\Python312\python.exe`
- `C:\Program Files\Python312\python.exe`

## Step 4: Configure Backend to Use Python 3.12

Add this to your `.env` file in the project root:

```env
PYTHON_COMMAND=C:\Users\desig\AppData\Local\Programs\Python\Python312\python.exe
```

(Replace with your actual Python 3.12 path from Step 3)

## Step 5: Install Required Packages

Run this command (using Python 3.12):

```powershell
# If Python 3.12 is in PATH:
python -m pip install torch torchvision pillow opencv-python numpy

# Or use the full path:
C:\Users\desig\AppData\Local\Programs\Python\Python312\python.exe -m pip install torch torchvision pillow opencv-python numpy
```

## Step 6: Restart Node.js Server

Stop your server (Ctrl+C) and restart:

```powershell
npm run dev
```

## Step 7: Verify It's Working

Check the server logs - you should see:

```
[SAM3] ✅ Python detected and ready
command: C:\Users\desig\AppData\Local\Programs\Python\Python312\python.exe
version: Python 3.12.x
```

Then try your background removal request again!













