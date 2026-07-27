# SAM-3 Download Instructions

## Issue Summary

The Python installation was blocked by Windows (error `0x80070642`), and the Hugging Face API shows "Repository not found" which typically means:
1. **Access not approved** - SAM-3 models require manual approval from Meta
2. **Token permissions** - Token may need read access to gated repositories
3. **Repository name** - The exact repository path may differ

## ✅ Fixed: Windows Installer Service

The Windows Installer service (`msiserver`) was stopped. It has been started:
```powershell
Start-Service -Name "msiserver"
```

## Solutions

### Option 1: Install Python via Microsoft Store (Recommended - No Admin Needed!)

1. Open **Microsoft Store**
2. Search for **"Python 3.12"** or **"Python 3.11"**
3. Click **Install** (no admin rights required!)
4. After installation, run:
   ```powershell
   python --version
   ```

### Option 2: Manual Download from Hugging Face

Since the repository requires access approval:

1. **Request Access:**
   - Go to: https://huggingface.co/facebook/sam3-hiera-large
   - Click **"Request access"** button
   - Fill out the form (usually approved in 1-3 days)

2. **After Approval:**
   - Login to Hugging Face with your account
   - Go to: https://huggingface.co/facebook/sam3-hiera-large/tree/main
   - Download `sam3_hiera_large.pt` file manually
   - Save to: `apps/core/cardbey-core/models/sam3_hiera_large/`

3. **Or Use Python (after installing):**
   ```bash
   pip install huggingface-hub
   huggingface-cli login
   # Enter token: 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
   huggingface-cli download facebook/sam3-hiera-large --local-dir models/sam3_hiera_large
   ```

### Option 3: Use Node.js Script (After Access Approval)

Once you have access, the Node.js script will work:

```powershell
# Set token
$env:HUGGINGFACE_HUB_TOKEN = "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"

# Run download script
node scripts/download-sam3-node.js
```

## Current Status

- ✅ Windows Installer service: **Running**
- ❌ Python: **Not installed** (blocked by Windows)
- ❌ SAM-3 Access: **Repository not found** (likely needs approval)
- ✅ Download script: **Created** (`scripts/download-sam3-node.js`)

## Next Steps

1. **Install Python** via Microsoft Store (easiest option)
2. **Request Hugging Face access** to `facebook/sam3-hiera-large`
3. **Wait for approval** (1-3 business days)
4. **Download model** using Python or Node.js script

## Alternative: Use Roboflow SAM-3 API

If Hugging Face access is delayed, you can use Roboflow's managed SAM-3 service:

1. Sign up at: https://roboflow.com/
2. Get API key from: https://app.roboflow.com/account/api
3. Add to `.env`:
   ```bash
   ROBOFLOW_API_KEY=your_key_here
   ROBOFLOW_SAM3_ENABLED=true
   ```

See `docs/SAM3_SETUP.md` for Roboflow integration details.

---

**Last Updated:** Current Date  
**Token:** `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` (stored in script)


















