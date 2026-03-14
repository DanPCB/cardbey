# Complete Overview: Menu Photo Upload & Text Extraction Process

## Table of Contents
1. [Frontend Upload Flow](#frontend-upload-flow)
2. [Backend Processing Pipeline](#backend-processing-pipeline)
3. [Image Processing Steps](#image-processing-steps)
4. [OCR/Text Extraction](#ocrtext-extraction)
5. [Post-Processing & Validation](#post-processing--validation)
6. [Data Flow Diagram](#data-flow-diagram)
7. [Current Issues & Pain Points](#current-issues--pain-points)
8. [Components & Files](#components--files)

---

## Frontend Upload Flow

### 1. User Interface
**File**: `apps/dashboard/cardbey-marketing-dashboard/src/features/business-builder/onboarding/steps/Step4MenuImport.tsx`

**Components**:
- File input (Browse button)
- Upload status display
- Extract Items button
- Extracted items cards (with thumbnails, names, descriptions)
- Save Selected button

**State Management**:
```typescript
- file: File | null                    // Selected file
- uploadUrl: string | null             // Uploaded image URL
- uploading: boolean                   // Upload in progress
- extracting: boolean                 // Extraction in progress
- multiItems: DetectedItem[]           // Extracted items
- selected: Record<string, boolean>    // Selected items
- editingItems: Record<string, {...}>  // User-edited names/descriptions
- targetCategory: string              // Target category (default: 'Coffee')
```

### 2. Upload Process
**Function**: `handleUpload(f: File)`

**Steps**:
1. Validate file type (must be image)
2. Clear previous extraction results
3. Call `uploadFile(file, undefined, userId)` from `@/lib/uploadMedia`
4. Store returned `uploadUrl` in state
5. Display upload success message

**Upload Endpoint**: `POST /api/upload`
- Accepts multipart/form-data
- Validates file type and size
- Uploads to S3 (or local storage fallback)
- Creates Media record in database
- Returns normalized URL

### 3. Extraction Trigger
**Function**: `handleExtract()`

**Guards**:
- ✅ `effectiveTenantId` must be available
- ✅ `effectiveStoreId` must be available
- ✅ `uploadUrl` must exist
- ✅ Not already extracting (ref guard: `isExtractingRef`)
- ✅ Context ready (`canRun`)

**API Call**: `POST /api/menu/extract-items`
```json
{
  "tenantId": "...",
  "storeId": "...",
  "imageUrl": "http://192.168.1.3:3001/uploads/media/...",
  "locale": "en",
  "targetCategory": "Coffee",
  "grid": { "rows": null, "cols": null }  // Optional override
}
```

---

## Backend Processing Pipeline

### 1. API Endpoint
**File**: `apps/core/cardbey-core/src/routes/menuRoutes.js`
**Route**: `POST /api/menu/extract-items`

**Validation**:
- ✅ `tenantId` required
- ✅ `storeId` required
- ✅ `imageUrl` required

**Processing**:
```javascript
extractBulkItemsOcr({
  imageUrl,      // Absolute URL
  storeId,
  locale: 'en',
  targetCategory: 'Coffee',
  grid: null,    // Auto-detect or override
  req,           // For URL resolution
})
```

### 2. Bulk Extraction Service
**File**: `apps/core/cardbey-core/src/services/menuOcrBulkItems.js`
**Function**: `extractBulkItemsOcr()`

**Pipeline Steps**:

#### Step 1: URL Normalization
- Ensure `imageUrl` is absolute
- Convert relative URLs to absolute using `absolutizeUrl()`
- Handle private URLs (192.168.x.x, localhost)

#### Step 2: Full Image OCR (Structured Extraction)
**Priority**: Structured extraction first (more reliable)

**Method**: `extractMenuFromImageStructured()`
- Uses OpenAI Vision API with JSON output prompt
- Returns structured items: `[{ name, category, price, description }]`
- Filters out refusals and invalid items
- Converts to OCR-like text format for compatibility

**Fallback**: If structured extraction fails
- Falls back to `performMenuOcr()` (raw OCR)
- Returns plain text extracted from full image

#### Step 3: Grid Cell Detection
**File**: `apps/core/cardbey-core/src/lib/menuCropper.js`
**Function**: `processMenuImageForBulkExtraction()`

**Process**:
1. Download full image buffer
2. Detect grid cells (auto-detect or use provided `rows`/`cols`)
3. For each cell:
   - Apply inner padding (8-12px) to avoid neighbor bleed
   - Extract cell image
   - Find photo region within cell (upper 60%, high variance)
   - Crop photo region with padding
   - Upload cropped photo → get `originalCropUrl`
   - Calculate `photoRatio` (photoArea / cellArea)

**Output**: Array of `cellResults`:
```javascript
{
  cellIndex: number,
  cellRect: { x, y, w, h },
  photoBuffer: Buffer,
  photoRegion: { x, y, w, h } | null,
  photoRatio: number,
  croppedPhotoUrl: string,
  skippedReason?: string
}
```

#### Step 4: Per-Cell Extraction
**Concurrency**: 3 cells at a time (to avoid overwhelming API)

**For each cell**:
1. Upload cell region image → get `regionImageUrl`
2. Call `menuExtractOne()` (unified extraction pipeline)
3. Process result:
   - Validate name (reject refusals, single letters, etc.)
   - Check for duplicates (normalized name comparison)
   - Return item or skip with reason

**Output**: Array of items or skipped items with reasons

---

## Image Processing Steps

### 1. Grid Detection
**File**: `apps/core/cardbey-core/src/lib/menuCropper.js`

**Auto-Detection**:
- Analyzes image dimensions
- Estimates grid based on aspect ratio
- Defaults to 4×3 grid if uncertain

**Manual Override**:
- User can provide `{ rows, cols }` in request
- Used when auto-detection is unreliable

### 2. Cell Cropping
**Function**: `cropCellWithPhotoRegion()`

**Process**:
1. Apply inner padding (10px default) to cell bounds
2. Extract cell image using Sharp
3. Find photo region:
   - Focus on upper 60% of cell
   - Detect high-variance regions (edge density)
   - Return bounding box of photo region
4. Crop to photo region + 6px padding
5. Ensure minimum size (100×100px)

**Output**: Cropped photo buffer ready for upload

### 3. Photo Region Detection
**Function**: `findPhotoRegionInCell()`

**Heuristic**:
- Analyzes upper 60% of cell
- Uses grayscale + variance calculation
- Finds largest high-variance region
- Skips detection if cell < 150×150px (uses entire cell)

### 4. SAM-3 Cutout (Optional)
**File**: `apps/core/cardbey-core/src/lib/sam3Cutout.js`
**Function**: `extractPhotoCutout()`

**Process**:
1. Pre-crop to left 45% (isolate photo from text)
2. Calculate seed point (default: 18% x, 35% y)
3. Run SAM-3 segmentation:
   - Try point prompt first (x,y coordinates)
   - Fallback to text prompt
   - Try alternative seed points if needed
4. Extract largest mask region
5. Apply mask to create transparent PNG
6. Upload PNG → get `cutoutUrl`

**Current Issues**:
- SAM-3 often returns 0 regions
- Model path resolution issues
- Small images (< 50×50px) skipped

### 5. Image Upload
**File**: `apps/core/cardbey-core/src/menu/imageExtractors/uploadCrop.js`
**Function**: `uploadCropImage()`

**Process**:
1. Upload buffer to S3 (or local storage)
2. Get storage URL
3. Normalize URL (relative for DB, absolute for API)
4. Extract metadata (width, height) using Sharp
5. Create Media record in database
6. Return absolute URL for API response

---

## OCR/Text Extraction

### 1. Primary Method: OpenAI Vision API
**File**: `apps/core/cardbey-core/src/ai/engines/openaiVisionEngine.js`
**Model**: `gpt-4o`

**Prompt** (for menu task):
```
"Extract all visible text from this menu image. This is a menu with food items, names, and descriptions. Return ONLY the text content you can see, line by line, exactly as it appears. Do not refuse or say you cannot read it - return whatever text is visible, even if partial."
```

**Image Handling**:
- Private URLs (192.168.x.x, localhost) → Converted to base64
- Public URLs → Sent directly to OpenAI
- Base64 data URLs → Used as-is

**Response**: Raw text (or refusal message)

### 2. Structured Extraction
**File**: `apps/core/cardbey-core/src/engines/menu/extractMenuStructured.js`
**Function**: `extractMenuFromImageStructured()`

**Prompt**: Asks for JSON format:
```json
{
  "currency": "AUD",
  "items": [
    {
      "name": "Item Name",
      "category": "Category",
      "price": 5.0,
      "description": "..."
    }
  ]
}
```

**Advantages**:
- Less likely to refuse (asks for structured data, not transcription)
- Already parsed and validated
- Includes prices and categories

**Disadvantages**:
- Sometimes only finds 1 item when there are multiple
- May miss items if image is complex

### 3. SAM-3 Guided OCR (Experimental)
**File**: `apps/core/cardbey-core/src/lib/sam3TextRegion.js`
**Function**: `extractTextWithSam3()`

**Process**:
1. Run SAM-3 to detect text regions
2. Crop to each text region
3. Run OCR on each cropped region
4. Combine all OCR text

**Status**: Implemented but may not be fully working

### 4. OCR Text Normalization
**File**: `apps/core/cardbey-core/src/modules/menu/performMenuOcr.js`

**Process**:
1. Run OCR via `runOcr()` → `openaiVisionEngine.analyzeImage()`
2. Normalize text:
   - Normalize line endings (Windows → Unix)
   - Trim each line
   - Remove empty lines
   - Join with single newlines

**Output**: Clean, normalized OCR text

---

## Post-Processing & Validation

### 1. Name Parsing
**File**: `apps/core/cardbey-core/src/services/menuOcrSingleItem.js`
**Function**: `parseOcrText()`

**Process**:
1. **Refusal Detection** (6 strategies):
   - Check if text starts with refusal phrase
   - Count refusal markers (2+ = refusal)
   - Check for long refusal patterns
   - Check short text + marker
   - Check "feel free to ask" pattern
   - Check "does not contain" / "too faint" patterns

2. **Name Extraction**:
   - Split into lines
   - Filter out prices, category words
   - Score lines (length + Title Case bonus)
   - Return best candidate

3. **Name Normalization**:
   - Remove UI markers (bullets, checkmarks)
   - Remove single letters
   - Validate length (≥ 2 chars)
   - Check for letters (not just punctuation)

**Output**: `{ name: string | null, description: string | null }`

### 2. Name Validation
**File**: `apps/core/cardbey-core/src/services/menuExtractOne.js`

**Validation Rules**:
- ✅ Name length ≥ 2 characters
- ✅ Not single letter (`/^[A-Z]$/`)
- ✅ Contains letters (`/[a-zA-Z]/`)
- ✅ Not ellipsis (`/^(\.\.\.|…)$/`)
- ✅ Not mostly separators
- ✅ Not UI artifacts ('V', '|', '•', etc.)
- ✅ Not refusal message

**Rejection Reasons**:
- `invalid_name`: Name failed validation
- `duplicate`: Normalized name already seen
- `upload_failed`: Failed to upload region image
- `photo_too_small`: Photo region < 18% of cell (deprecated)

### 3. Duplicate Detection
**File**: `apps/core/cardbey-core/src/services/menuOcrBulkItems.js`

**Normalization**:
```javascript
function normalizeItemName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')  // Remove punctuation
    .replace(/\s+/g, ' ');    // Normalize whitespace
}
```

**Process**:
- Track seen names in `Set`
- Normalize each item name
- Skip if normalized name already seen
- Mark as `duplicate` reason

### 4. Structured Item Matching
**File**: `apps/core/cardbey-core/src/services/menuExtractOne.js`

**Logic**:
- If structured extraction found items:
  - Check if enough items (≥ 3, or ≥ 2 and regionIndex in range)
  - Match by `regionIndex % parsedItemsFromFullOcr.length`
  - Validate matched item name (not refusal)
  - Use matched item if valid
- Otherwise: Prefer per-cell OCR to avoid duplicates

**Issue**: If only 1 structured item found, all regions get same name → duplicates

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND: Step4MenuImport.tsx                                   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────┐
        │ 1. User selects file              │
        │ 2. handleUpload(file)             │
        │ 3. uploadFile() → POST /upload    │
        └───────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────┐
        │ BACKEND: /api/upload              │
        │ - Validate file                   │
        │ - Upload to S3/local              │
        │ - Create Media record             │
        │ - Return normalized URL           │
        └───────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────┐
        │ 4. handleExtract()                │
        │ 5. POST /api/menu/extract-items   │
        └───────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ BACKEND: menuRoutes.js → extractBulkItemsOcr()                  │
└─────────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        │                                         │
        ▼                                         ▼
┌──────────────────────┐              ┌──────────────────────┐
│ Structured Extract   │              │ Full Image OCR       │
│ (Priority 1)         │              │ (Fallback)           │
│                      │              │                      │
│ extractMenuFrom      │              │ performMenuOcr()      │
│ ImageStructured()    │              │ → runOcr()           │
│                      │              │ → openaiVisionEngine │
│ Returns:             │              │                      │
│ [{name, price, ...}] │              │ Returns: plain text  │
└──────────────────────┘              └──────────────────────┘
        │                                         │
        └───────────────────┬───────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────┐
        │ Grid Detection                    │
        │ processMenuImageForBulkExtraction()│
        │                                   │
        │ - Detect cells (auto or manual)   │
        │ - For each cell:                  │
        │   • Crop with padding             │
        │   • Find photo region             │
        │   • Upload crop → originalCropUrl │
        └───────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────┐
        │ Per-Cell Extraction (3 concurrent)│
        │                                   │
        │ For each cell:                    │
        │   1. Upload region image          │
        │   2. menuExtractOne()            │
        │      ├─ SAM3-guided OCR          │
        │      ├─ Fallback to full OCR     │
        │      ├─ Parse name/description   │
        │      ├─ Validate name             │
        │      ├─ Crop photo (left/top)    │
        │      ├─ SAM-3 cutout (optional)  │
        │      └─ Return item or null      │
        │   3. Check duplicates             │
        │   4. Return item or skip          │
        └───────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────┐
        │ Response Normalization             │
        │ - Ensure absolute URLs             │
        │ - Map cutoutUrl/originalCropUrl   │
        │ - Return items array               │
        └───────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND: Display Results                                       │
│ - Show extracted items as cards                                │
│ - Allow editing names/descriptions                             │
│ - Select items to save                                         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────┐
        │ Save Selected                     │
        │ POST /api/menu/configure-from-photo│
        │ - Create/update products          │
        │ - Handle duplicates               │
        │ - Assign categories                │
        └───────────────────────────────────┘
```

---

## Current Issues & Pain Points

### 1. OCR Refusals
**Problem**: GPT-4o sometimes returns refusal messages even when text is visible
- "I'm unable to extract text from this image"
- "The image does not contain any visible text"
- "The image is too faint to extract any visible text"

**Impact**: Refusals slip through validation and appear as item names

**Current Mitigation**:
- Multi-strategy refusal detection (6 strategies)
- Pattern matching for common refusal phrases
- Still not 100% effective

### 2. Grid Detection Over-Segmentation
**Problem**: Single-item images detected as 9 regions (3×3 grid)
- Auto-detection assumes grid layout
- No single-item detection logic

**Impact**: 8 duplicate items with same name

**Current Mitigation**: None (needs improvement)

### 3. SAM-3 Cutout Failing
**Problem**: SAM-3 returns 0 regions even for clear product photos
- Model path resolution issues
- Seed point selection not optimal
- Small images skipped

**Impact**: No transparent cutouts, only regular crops

**Current Mitigation**:
- Minimum size check (50×50px)
- Alternative seed points
- Fallback to regular crop

### 4. Structured Extraction Finding Only 1 Item
**Problem**: When menu has multiple items, structured extraction sometimes only finds one
- All regions get matched to same item
- Creates duplicates

**Current Mitigation**:
- Only use structured items if ≥ 3 items found
- Otherwise prefer per-cell OCR

### 5. Duplicate Detection Too Aggressive
**Problem**: Normalized name comparison too strict
- "Fruit Cake" and "Fruit Topped Cake" might be considered duplicates
- Punctuation removal loses important distinctions

**Current Mitigation**: None (needs improvement)

### 6. Image Size Issues
**Problem**: Cropped images sometimes too small (11×11, 26×26 pixels)
- Additional cropping on already-small images
- Minimum size checks not always effective

**Current Mitigation**:
- MIN_SIZE = 100px checks
- Skip additional crop if already small

### 7. URL Normalization Issues
**Problem**: Relative vs absolute URL confusion
- Backend stores relative URLs
- Frontend needs absolute URLs
- Private URLs (192.168.x.x) need base64 conversion

**Current Mitigation**:
- `absolutizeUrl()` helper
- Base64 conversion for private URLs
- Normalization in response

---

## Components & Files

### Frontend
- **Main Component**: `apps/dashboard/cardbey-marketing-dashboard/src/features/business-builder/onboarding/steps/Step4MenuImport.tsx`
- **Upload Helper**: `apps/dashboard/cardbey-marketing-dashboard/src/lib/uploadMedia.js`
- **API Client**: `apps/dashboard/cardbey-marketing-dashboard/src/lib/api.ts`

### Backend Routes
- **Upload**: `apps/core/cardbey-core/src/routes/upload.js`
- **Menu Extraction**: `apps/core/cardbey-core/src/routes/menuRoutes.js`

### Backend Services
- **Bulk Extraction**: `apps/core/cardbey-core/src/services/menuOcrBulkItems.js`
- **Single Item Extraction**: `apps/core/cardbey-core/src/services/menuExtractOne.js`
- **OCR Parsing**: `apps/core/cardbey-core/src/services/menuOcrSingleItem.js`
- **Structured Extraction**: `apps/core/cardbey-core/src/engines/menu/extractMenuStructured.js`

### Image Processing
- **Grid Cropper**: `apps/core/cardbey-core/src/lib/menuCropper.js`
- **SAM-3 Cutout**: `apps/core/cardbey-core/src/lib/sam3Cutout.js`
- **SAM-3 Text Region**: `apps/core/cardbey-core/src/lib/sam3TextRegion.js`
- **Crop Upload**: `apps/core/cardbey-core/src/menu/imageExtractors/uploadCrop.js`

### OCR/Vision
- **OCR Runner**: `apps/core/cardbey-core/src/modules/vision/runOcr.js`
- **Menu OCR**: `apps/core/cardbey-core/src/modules/menu/performMenuOcr.js`
- **OpenAI Vision Engine**: `apps/core/cardbey-core/src/ai/engines/openaiVisionEngine.js`

### Utilities
- **URL Resolution**: `apps/core/cardbey-core/src/lib/url.js`
- **Media URL Normalization**: `apps/core/cardbey-core/src/utils/normalizeMediaUrl.js`

---

## Key Metrics & Statistics

### Current Performance
- **Grid Detection**: Auto-detects 4×3 grid (12 cells) by default
- **Concurrency**: 3 cells processed simultaneously
- **OCR Timeout**: 30 seconds per call
- **Max Retries**: 2 attempts for OpenAI API
- **Minimum Image Size**: 100×100px for crops, 50×50px for SAM-3

### Success Rates (Estimated)
- **Structured Extraction**: ~60% success (finds items, but may miss some)
- **Per-Cell OCR**: ~70% success (refusals common on small crops)
- **SAM-3 Cutout**: ~20% success (often returns 0 regions)
- **Name Validation**: ~90% accuracy (some refusals slip through)

---

## Recommendations for Improvement

1. **Better Prompt Engineering**: More directive prompts to reduce refusals
2. **Confidence Scoring**: Add confidence scores to OCR responses
3. **Retry Logic**: Retry with different prompts if refusal detected
4. **Single-Item Detection**: Detect single-item images before grid detection
5. **Better Duplicate Detection**: Use fuzzy matching instead of exact normalized names
6. **Image Quality Checks**: Validate image quality before processing
7. **Progress Indicators**: Show extraction progress for better UX
8. **Error Recovery**: Better handling of partial failures

---

**Last Updated**: 2025-01-17
**Status**: Active development, multiple issues identified
















