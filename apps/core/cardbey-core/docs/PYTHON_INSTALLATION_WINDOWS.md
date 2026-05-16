# Python Installation for Windows

## Quick Install (Recommended)

### Option 1: Microsoft Store (Easiest - No Admin Required)

1. Open **Microsoft Store** (search for "Microsoft Store" in Start menu)
2. Search for **"Python 3.12"** or **"Python 3.11"**
3. Click **Install** (no admin rights needed!)
4. Wait for installation to complete
5. Verify installation:
   ```powershell
   python --version
   ```
   Should show: `Python 3.12.x` (or similar)

### Option 2: Official Python Installer

1. Go to: https://www.python.org/downloads/
2. Click **Download Python 3.12.x** (latest version)
3. Run the installer
4. **IMPORTANT**: Check the box **"Add Python to PATH"** during installation
5. Click **Install Now**
6. Verify installation:
   ```powershell
   python --version
   ```

### Option 3: Using Chocolatey (If you have it)

```powershell
choco install python3
```

## Verify Installation

After installation, restart your terminal/PowerShell and run:

```powershell
python --version
python3 --version
```

Both should show the Python version.

## Troubleshooting

### Python not found after installation

1. **Restart your terminal/PowerShell** (required to refresh PATH)
2. **Restart your IDE/editor** (if running Node.js from there)
3. **Check PATH manually**:
   ```powershell
   $env:PATH -split ';' | Select-String -Pattern 'python'
   ```
   Should show Python installation path

### Still not working?

Set the Python path manually in your `.env` file:

```env
PYTHON_COMMAND=C:\Users\YourUsername\AppData\Local\Programs\Python\Python312\python.exe
```

Or find your Python installation:
```powershell
where.exe python
```

## After Installation

Once Python is installed:

1. **Restart your Node.js server**:
   ```powershell
   npm run dev
   ```

2. **Install Python dependencies** (if needed):
   ```powershell
   pip install torch torchvision pillow opencv-python numpy
   ```

3. **Test SAM-3 script**:
   ```powershell
   python scripts/sam3_inference.py --help
   ```

## Next Steps

After Python is installed, the SAM-3 backend will automatically detect it and use it for image processing.













