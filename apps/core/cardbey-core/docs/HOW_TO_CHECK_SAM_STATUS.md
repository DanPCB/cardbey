# How to Check SAM-2/SAM-3 Status from Backend Logs

## Quick Answer

After restarting your backend, look for this log message at startup:

```
[SAM] SAM-2 Configuration: {
  model: 'SAM-2',
  path: './models/sam2_hiera_large/sam2_hiera_large.pt',
  exists: true,
  size: '856.35 MB',
  device: 'cuda',
  status: '✅ Ready'
}
```

## What to Look For

### ✅ SAM-2/SAM-3 is Configured and Ready

You'll see:
```
[SAM] SAM-2 Configuration: {
  model: 'SAM-2',
  path: './models/sam2_hiera_large/sam2_hiera_large.pt',
  exists: true,
  size: '856.35 MB',
  device: 'cuda',
  status: '✅ Ready'
}
```

**Meaning:** SAM-2 is configured and the model file exists. Ready to use!

### ❌ Model File Not Found

You'll see:
```
[SAM] SAM-2 Configuration: {
  model: 'SAM-2',
  path: './models/sam2_hiera_large/sam2_hiera_large.pt',
  exists: false,
  size: 'NOT FOUND',
  device: 'cuda',
  status: '❌ Model file not found'
}
[SAM] ⚠️  Model file not found at: ./models/sam2_hiera_large/sam2_hiera_large.pt
[SAM] SAM-2/SAM-3 segmentation will be disabled until model is available
```

**Fix:** Check that the path in `.env` matches the actual file location.

### ⚠️ Not Configured

You'll see:
```
[SAM] SAM-2/SAM-3 not configured (SAM2_MODEL_PATH or SAM3_MODEL_PATH not set)
[SAM] Vision pipeline will use OCR-only mode
```

**Fix:** Add to `.env`:
```bash
SAM2_MODEL_PATH=./models/sam2_hiera_large/sam2_hiera_large.pt
SAM2_DEVICE=cuda  # or 'cpu'
```

## During Runtime

When SAM-2/SAM-3 is used for segmentation, you'll see:

```
[SAM-2] Running segmentation {
  imagePath: '/tmp/sam3-vision-123456.png',
  prompt: 'Identify menu items, prices, sections, and text',
  device: 'cuda',
  modelPath: '.../sam2_hiera_large.pt',
  isVideo: false
}

[SAM-2] Segmentation complete {
  regionCount: 15,
  hasError: false
}

[SAM-2] Segmentation result {
  purpose: 'menu',
  regionCount: 15,
  imageUrl: 'http://192.168.1.12:3001/uploads/media/...'
}
```

## Check Current Status

### Option 1: Check Logs

Look at your backend startup logs for the `[SAM]` message.

### Option 2: Check Environment Variables

```powershell
# Check if SAM-2/SAM-3 is configured
Get-Content .env | Select-String -Pattern "SAM"
```

Should show:
```
SAM2_MODEL_PATH=./models/sam2_hiera_large/sam2_hiera_large.pt
SAM2_DEVICE=cuda
```

### Option 3: Check Model File

```powershell
# Verify model file exists
Get-Item models\sam2_hiera_large\sam2_hiera_large.pt | Select-Object FullName, Length, LastWriteTime
```

Should show:
```
FullName    : C:\Projects\cardbey\apps\core\cardbey-core\models\sam2_hiera_large\sam2_hiera_large.pt
Length      : 897581056  (856.35 MB)
LastWriteTime: 12/4/2025 4:02:52 PM
```

## Troubleshooting

### Model Not Loading?

1. **Check .env file:**
   ```powershell
   Get-Content .env | Select-String -Pattern "SAM"
   ```

2. **Verify file path is correct:**
   ```powershell
   Test-Path "models\sam2_hiera_large\sam2_hiera_large.pt"
   ```
   Should return `True`

3. **Check file size:**
   ```powershell
   (Get-Item "models\sam2_hiera_large\sam2_hiera_large.pt").Length / 1MB
   ```
   Should be ~856 MB (not 0!)

4. **Restart backend** after updating `.env`

### Wrong Device?

If you see errors about CUDA, change device to CPU:

```bash
SAM2_DEVICE=cpu
```

Then restart backend.

## Summary

**Look for:** `[SAM]` log messages at startup  
**Good sign:** `status: '✅ Ready'`  
**Bad sign:** `exists: false` or `not configured`

---

**Current Status:** SAM-2 model downloaded and ready  
**Next:** Restart backend to see status in logs


















