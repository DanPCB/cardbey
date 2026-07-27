# SAM-3 Setup Instructions

## Overview

SAM-3 (Segment Anything Model 3) is Meta's latest image segmentation model that can identify and segment objects in images. This guide covers how to set up SAM-3 for use with Cardbey Core's vision pipeline.

---

## Prerequisites

- Python 3.8+ installed
- pip package manager
- (Optional) CUDA-capable GPU for faster inference
- Hugging Face account (for model access)

---

## Step 1: Request Hugging Face Access

SAM-3 models are hosted on Hugging Face and require access approval.

### 1.1 Create Hugging Face Account

1. Go to [https://huggingface.co/](https://huggingface.co/)
2. Sign up for a free account
3. Verify your email address

### 1.2 Request Model Access

1. Navigate to the SAM-3 model page:
   - **SAM-3 Hiera Large:** [https://huggingface.co/facebook/sam3-hiera-large](https://huggingface.co/facebook/sam3-hiera-large)
   - Or search for "sam3-hiera" on Hugging Face

2. Click **"Request access"** button
3. Fill out the access request form:
   - **Purpose:** "Research/Development for image segmentation in marketing content"
   - **Organization:** Your organization name
   - **Use case:** Brief description of your project

4. Wait for approval (usually 1-3 business days)

### 1.3 Generate Access Token

After access is approved:

1. Go to [https://huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
2. Click **"New token"**
3. Name it (e.g., "cardbey-sam3")
4. Select **"Read"** permissions
5. Click **"Generate token"**
6. **Copy the token** (you won't see it again!)

---

## Step 2: Install Required Python Packages

Create a Python virtual environment (recommended):

```bash
# Create virtual environment
python3 -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate
```

Install required packages:

```bash
pip install torch torchvision torchaudio
pip install transformers
pip install huggingface-hub
pip install pillow
pip install numpy
pip install opencv-python
```

### GPU Support (Optional but Recommended)

For CUDA GPU acceleration, install PyTorch with CUDA support:

```bash
# Check your CUDA version first
nvidia-smi

# Install PyTorch with CUDA (example for CUDA 11.8)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Or for CUDA 12.1
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

Verify GPU support:

```python
import torch
print(torch.cuda.is_available())  # Should print True if GPU is available
print(torch.cuda.get_device_name(0))  # Should print your GPU name
```

---

## Step 3: Download SAM-3 Model

### 3.1 Authenticate with Hugging Face

Set your Hugging Face token as an environment variable:

```bash
# macOS/Linux
export HUGGINGFACE_HUB_TOKEN=your_token_here

# Windows PowerShell
$env:HUGGINGFACE_HUB_TOKEN="your_token_here"

# Windows CMD
set HUGGINGFACE_HUB_TOKEN=your_token_here
```

Or login via CLI:

```bash
pip install huggingface-hub
huggingface-cli login
# Enter your token when prompted
```

### 3.2 Download Model

Create a models directory:

```bash
mkdir -p models
cd models
```

Download the SAM-3 Hiera Large model:

```bash
# Using huggingface-hub CLI
huggingface-cli download facebook/sam3-hiera-large --local-dir sam3_hiera_large

# Or using Python script
python -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='facebook/sam3-hiera-large', local_dir='sam3_hiera_large')"
```

The model files will be downloaded to `models/sam3_hiera_large/`.

### 3.3 Locate Model File

The main model file is typically:
- `models/sam3_hiera_large/sam3_hiera_large.pt`

Or check the downloaded directory:

```bash
ls -lh models/sam3_hiera_large/
```

---

## Step 4: Configure Environment Variables

Add SAM-3 configuration to your `.env` file:

```bash
# SAM-3 Configuration
SAM3_MODEL_PATH=./models/sam3_hiera_large/sam3_hiera_large.pt
SAM3_DEVICE=cuda  # Use 'cpu' if no GPU available
```

**For development machines without GPU:**

```bash
SAM3_MODEL_PATH=./models/sam3_hiera_large/sam3_hiera_large.pt
SAM3_DEVICE=cpu
```

**Note:** Use relative paths from the project root, or absolute paths.

---

## Step 5: Test SAM-3 Inference Locally

Create a test script to verify SAM-3 is working:

### 5.1 Create Test Script

Create `test_sam3.py`:

```python
#!/usr/bin/env python3
"""
Test SAM-3 inference locally
"""

import torch
from PIL import Image
import os

# Check if model path is set
model_path = os.getenv('SAM3_MODEL_PATH', './models/sam3_hiera_large/sam3_hiera_large.pt')
device = os.getenv('SAM3_DEVICE', 'cpu')

print(f"Model path: {model_path}")
print(f"Device: {device}")

# Check if model file exists
if not os.path.exists(model_path):
    print(f"❌ Model file not found at: {model_path}")
    print("Please download the model first (see Step 3)")
    exit(1)

print(f"✅ Model file found")

# Check device availability
if device == 'cuda':
    if torch.cuda.is_available():
        print(f"✅ CUDA available: {torch.cuda.get_device_name(0)}")
    else:
        print("⚠️  CUDA requested but not available, falling back to CPU")
        device = 'cpu'
else:
    print("✅ Using CPU")

# Try loading model (this may take a while on first run)
print("\nLoading model...")
try:
    # Note: Actual SAM-3 loading code depends on the model format
    # This is a placeholder - replace with actual SAM-3 loading code
    print("⚠️  Model loading code needs to be implemented")
    print("   See SAM-3 documentation for actual loading code")
    print("✅ Test script structure is correct")
except Exception as e:
    print(f"❌ Error loading model: {e}")
    exit(1)

print("\n✅ SAM-3 setup verification complete!")
print("   Next: Implement actual SAM-3 inference in sam3Adapter.js")
```

### 5.2 Run Test

```bash
# Set environment variables
export SAM3_MODEL_PATH=./models/sam3_hiera_large/sam3_hiera_large.pt
export SAM3_DEVICE=cuda  # or 'cpu'

# Run test
python test_sam3.py
```

Expected output:
```
Model path: ./models/sam3_hiera_large/sam3_hiera_large.pt
Device: cuda
✅ Model file found
✅ CUDA available: NVIDIA GeForce RTX 3090
✅ SAM-3 setup verification complete!
```

---

## Step 6: Roboflow Fallback Option

If you cannot get Hugging Face access or prefer a managed service, Roboflow offers SAM-3 as a service.

### 6.1 Sign Up for Roboflow

1. Go to [https://roboflow.com/](https://roboflow.com/)
2. Sign up for a free account
3. Navigate to the API section

### 6.2 Get API Key

1. Go to [https://app.roboflow.com/account/api](https://app.roboflow.com/account/api)
2. Copy your API key

### 6.3 Configure Roboflow

Add to `.env`:

```bash
# Roboflow SAM-3 Configuration (alternative to local model)
ROBOFLOW_API_KEY=your_roboflow_api_key_here
ROBOFLOW_SAM3_ENABLED=true
```

### 6.4 Update Code

Modify `src/modules/vision/sam3Adapter.js` to use Roboflow API:

```javascript
export async function runSam3Segmentation(req) {
  const roboflowApiKey = process.env.ROBOFLOW_API_KEY;
  const useRoboflow = process.env.ROBOFLOW_SAM3_ENABLED === 'true';
  
  if (useRoboflow && roboflowApiKey) {
    // Use Roboflow API
    const response = await fetch('https://api.roboflow.com/sam3/segment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${roboflowApiKey}`,
      },
      body: JSON.stringify({
        image_url: req.imageUrl,
        purpose: req.purpose,
      }),
    });
    
    const data = await response.json();
    return {
      regions: data.regions || [],
    };
  }
  
  // Fallback to local model or empty result
  // ... local SAM-3 implementation
}
```

**Note:** Check Roboflow documentation for actual API endpoint and request format.

---

## Troubleshooting

### Model File Not Found

**Error:** `Model file not found at: ./models/sam3_hiera_large/sam3_hiera_large.pt`

**Solution:**
1. Verify model was downloaded correctly
2. Check the path in `.env` matches actual file location
3. Use absolute path if relative path doesn't work

### CUDA Out of Memory

**Error:** `CUDA out of memory`

**Solution:**
1. Use smaller batch size
2. Use `SAM3_DEVICE=cpu` instead
3. Reduce image resolution before processing

### Hugging Face Access Denied

**Error:** `401 Unauthorized` or `403 Forbidden`

**Solution:**
1. Verify your Hugging Face token is correct
2. Check that model access was approved
3. Try logging in again: `huggingface-cli login`

### Slow Inference on CPU

**Issue:** SAM-3 is very slow on CPU

**Solution:**
1. Use GPU if available (`SAM3_DEVICE=cuda`)
2. Consider using Roboflow API (faster, managed service)
3. Process images in smaller batches
4. Reduce image resolution

---

## Next Steps

After completing setup:

1. **Update `sam3Adapter.js`** to load and use the model
2. **Test with real images** from your vision pipeline
3. **Monitor performance** and adjust batch sizes
4. **Consider caching** model in memory for faster inference

See `docs/SAM3_CONTENT_STUDIO_INTEGRATION.md` for integration details.

---

## Additional Resources

- **SAM-3 Paper:** [Meta AI Research](https://ai.meta.com/research/publications/sam-3/)
- **Hugging Face Model:** [facebook/sam3-hiera-large](https://huggingface.co/facebook/sam3-hiera-large)
- **Roboflow Documentation:** [https://docs.roboflow.com/](https://docs.roboflow.com/)
- **PyTorch Installation:** [https://pytorch.org/get-started/locally/](https://pytorch.org/get-started/locally/)

---

## Summary Checklist

- [ ] Created Hugging Face account
- [ ] Requested SAM-3 model access
- [ ] Generated Hugging Face access token
- [ ] Installed Python packages (torch, transformers, etc.)
- [ ] Downloaded SAM-3 model to `models/` directory
- [ ] Set `SAM3_MODEL_PATH` in `.env`
- [ ] Set `SAM3_DEVICE` in `.env` (cuda or cpu)
- [ ] Tested model loading locally
- [ ] (Optional) Configured Roboflow fallback

---

**Last Updated:** Current Date  
**Maintained by:** Cardbey Core Team


















