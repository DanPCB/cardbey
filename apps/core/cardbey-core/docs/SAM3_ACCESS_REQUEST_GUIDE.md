# SAM-3 Access Request Guide

## Current Status

✅ **Empty file deleted** - Ready for download  
⚠️ **Repository requires access** - 401 Unauthorized (needs approval)  
✅ **Download script ready** - Will work after access is granted

## Step-by-Step Access Request

### Step 1: Login to Hugging Face

1. Go to: https://huggingface.co/login
2. Login with your account (or create one if needed)
3. Verify you're logged in (check top right corner)

### Step 2: Request Access to SAM-3 Repository

1. **Navigate to the repository:**
   - Go to: https://huggingface.co/facebook/sam3-hiera-large
   - Or search for "sam3-hiera-large" on Hugging Face

2. **Request Access:**
   - Look for a button that says:
     - **"Request access"** or
     - **"Access Repository"** or
     - **"Request access to this model"**
   - Click the button

3. **Fill out the access form:**
   - **Purpose:** "Research/Development for image segmentation in marketing content"
   - **Organization:** Your organization name (or "Personal")
   - **Use case:** "Image segmentation for marketing content studio - identifying objects in product images for automated content generation"
   - **Agree to terms** if presented

4. **Submit the request**

### Step 3: Wait for Approval

- Approval typically takes **1-3 business days**
- You'll receive an email notification when approved
- Check your Hugging Face notifications: https://huggingface.co/notifications

### Step 4: Verify Access

After approval, verify access:

```powershell
# Test access with your token
$token = "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"
$headers = @{
    "Authorization" = "Bearer $token"
    "User-Agent" = "cardbey-sam3-downloader/1.0"
}

try {
    $response = Invoke-RestMethod -Uri "https://huggingface.co/api/models/facebook/sam3-hiera-large" -Headers $headers
    Write-Host "✅ Access granted! Repository details:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 2
} catch {
    Write-Host "❌ Still waiting for access: $($_.Exception.Message)" -ForegroundColor Yellow
}
```

### Step 5: Download the Model

Once access is granted, download using one of these methods:

#### Option A: Using Node.js Script (Recommended)

```powershell
# Set token
$env:HUGGINGFACE_HUB_TOKEN = "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"

# Run download script
node scripts/download-sam3-node.js
```

#### Option B: Using Python (if installed)

```bash
# Install huggingface-hub
pip install huggingface-hub

# Login
huggingface-cli login
# Enter token when prompted: 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

# Download model
huggingface-cli download facebook/sam3-hiera-large --local-dir models/sam3_hiera_large
```

#### Option C: Manual Download

1. Go to: https://huggingface.co/facebook/sam3-hiera-large/tree/main
2. Click on `sam3_hiera_large.pt`
3. Click "Download" button
4. Save to: `apps/core/cardbey-core/models/sam3_hiera_large/`

## Troubleshooting

### Still Getting 404/401 After Approval?

1. **Clear browser cache** and try again
2. **Log out and log back in** to Hugging Face
3. **Verify token** is still valid:
   - Go to: https://huggingface.co/settings/tokens
   - Check that token `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` exists and has "Read" permissions

### Token Not Working?

1. **Generate new token:**
   - Go to: https://huggingface.co/settings/tokens
   - Click "New token"
   - Name: "cardbey-sam3"
   - Permissions: **Read**
   - Copy the new token

2. **Update scripts** with new token:
   ```powershell
   # Update environment variable
   $env:HUGGINGFACE_HUB_TOKEN = "your_new_token_here"
   ```

### Alternative: Use Roboflow SAM-3 API

If Hugging Face access is delayed, use Roboflow's managed service:

1. Sign up: https://roboflow.com/
2. Get API key: https://app.roboflow.com/account/api
3. Add to `.env`:
   ```bash
   ROBOFLOW_API_KEY=your_key_here
   ROBOFLOW_SAM3_ENABLED=true
   ```

See `docs/SAM3_SETUP.md` for Roboflow integration.

## Verification

After successful download:

```powershell
# Check file exists and has content
$file = Get-Item "models\sam3_hiera_large\sam3_hiera_large.pt"
Write-Host "File: $($file.FullName)"
Write-Host "Size: $([math]::Round($file.Length / 1MB, 2)) MB"
Write-Host "Date: $($file.LastWriteTime)"

# Should show ~2-3 GB (not 0 bytes!)
```

## Next Steps After Download

1. **Update `.env` file:**
   ```bash
   SAM3_MODEL_PATH=./models/sam3_hiera_large/sam3_hiera_large.pt
   SAM3_DEVICE=cuda  # or 'cpu' for development
   ```

2. **Test SAM-3 integration:**
   - See `docs/SAM3_SETUP.md` for testing instructions
   - Run: `node scripts/sam3_inference.py` (if Python available)

3. **Integrate with Content Studio:**
   - See `docs/SAM3_CONTENT_STUDIO_INTEGRATION.md`

---

**Current Status:** Waiting for Hugging Face access approval  
**Token:** `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`  
**Repository:** `facebook/sam3-hiera-large`  
**Last Updated:** Current Date


















