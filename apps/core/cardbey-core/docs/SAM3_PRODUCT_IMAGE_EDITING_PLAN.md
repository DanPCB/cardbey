# SAM-3 Product Image Editing & Catalog Management - Implementation Plan

## Overview

This plan outlines the implementation of **Product Image Editing & Catalog Management** features using SAM-2/SAM-3 segmentation in Content Studio. This will enable users to automatically segment products from images, remove/replace backgrounds, and manage product catalogs.

---

## 🎯 Goals

1. **Product Segmentation**: Automatically identify and segment products from images
2. **Background Editing**: Remove or replace backgrounds with AI assistance
3. **Catalog Management**: Extract product information and create catalog entries
4. **Batch Processing**: Process multiple product images at once
5. **Smart Cropping**: Auto-crop products with proper padding

---

## 📋 Feature Breakdown

### Phase 1: Product Segmentation (Foundation)

#### 1.1 Product Detection & Segmentation
**Goal**: Identify products in images and create segmentation masks

**User Flow**:
1. User uploads product image to Content Studio
2. Clicks "Detect Products" button
3. SAM-2/SAM-3 analyzes image and segments products
4. Shows detected products with bounding boxes and masks
5. User can select which products to keep/edit

**UI Components**:
- **ProductDetectionPanel** (new component)
  - Upload/select image button
  - "Detect Products" button with loading state
  - Product list with thumbnails
  - Selection checkboxes
  - "Extract Selected" button

**Backend API**:
```
POST /api/vision/product-segment
Body: {
  imageUrl: string,
  imageBuffer?: Buffer,
  options?: {
    minConfidence?: number,  // Default: 0.7
    maxProducts?: number,    // Default: 10
    includeBackground?: boolean
  }
}
Response: {
  ok: true,
  products: [{
    id: string,
    bbox: { x, y, width, height },
    mask: string,  // Base64 mask or path
    confidence: number,
    label?: string,  // "product", "text", "background", etc.
    thumbnail?: string
  }]
}
```

**Implementation**:
- Extend `sam3Adapter.js` with product-specific segmentation
- Add product detection mode to SAM-3 inference
- Return structured product data with masks

---

#### 1.2 Product Selection & Mask Preview
**Goal**: Visual feedback for detected products

**UI Components**:
- **ProductMaskOverlay** (canvas overlay)
  - Shows bounding boxes on detected products
  - Highlights selected products
  - Shows confidence scores
  - Click to select/deselect

- **ProductThumbnailList** (sidebar component)
  - Grid/list of detected products
  - Thumbnail preview
  - Confidence badge
  - Selection checkbox
  - Quick actions (extract, edit, delete)

**Canvas Integration**:
- Add overlay layer to `CanvasStage.tsx`
- Render bounding boxes and masks
- Handle click events for selection
- Sync selection with sidebar

---

### Phase 2: Background Editing

#### 2.1 Background Removal
**Goal**: Remove background from selected products

**User Flow**:
1. User selects one or more products
2. Clicks "Remove Background"
3. SAM-2/SAM-3 creates mask and removes background
4. Product appears on transparent background
5. User can export as PNG with transparency

**UI Components**:
- **BackgroundToolsPanel** (new component)
  - "Remove Background" button
  - "Replace Background" button
  - Background color picker
  - Background image upload
  - "Restore Original" button

**Backend API**:
```
POST /api/vision/remove-background
Body: {
  imageUrl: string,
  productIds: string[],  // From segmentation result
  options?: {
    feather?: number,     // Edge feathering (0-10)
    refine?: boolean      // Use refinement (slower but better)
  }
}
Response: {
  ok: true,
  result: {
    imageUrl: string,     // PNG with transparency
    maskUrl: string,      // Mask image
    originalSize: { width, height },
    productSize: { width, height }
  }
}
```

**Implementation**:
- Use SAM-2/SAM-3 mask to create alpha channel
- Apply edge refinement (optional)
- Export as PNG with transparency
- Store processed images in uploads/

---

#### 2.2 Background Replacement
**Goal**: Replace background with solid color or image

**User Flow**:
1. User selects product with removed background
2. Chooses background type (color/image)
3. Selects color or uploads image
4. Preview shows product on new background
5. User can adjust product position/size
6. Apply changes

**UI Components**:
- **BackgroundReplacementPanel** (extends BackgroundToolsPanel)
  - Background type selector (Color / Image / Gradient)
  - Color picker
  - Image upload
  - Gradient editor
  - Preview toggle
  - "Apply" button

**Backend API**:
```
POST /api/vision/replace-background
Body: {
  productImageUrl: string,  // Product with transparency
  background: {
    type: "color" | "image" | "gradient",
    color?: string,
    imageUrl?: string,
    gradient?: { start: string, end: string, angle: number }
  },
  options?: {
    blendMode?: "normal" | "multiply" | "screen",
    opacity?: number
  }
}
Response: {
  ok: true,
  result: {
    imageUrl: string,
    compositeUrl: string  // Final composite image
  }
}
```

---

### Phase 3: Catalog Management

#### 3.1 Product Extraction
**Goal**: Extract product information and create catalog entries

**User Flow**:
1. User segments products from image
2. Selects products to extract
3. Clicks "Add to Catalog"
4. System extracts:
   - Product image (cropped, background removed)
   - Product name (from OCR if text detected)
   - Product description (AI-generated)
   - Product category (AI-classified)
   - Product tags (auto-generated)
5. User reviews and edits information
6. Saves to catalog

**UI Components**:
- **ProductCatalogPanel** (new component)
  - Product list view
  - Product detail view
  - "Add to Catalog" button
  - Product form (name, description, category, tags, price)
  - Catalog search/filter
  - Bulk actions

**Backend API**:
```
POST /api/catalog/extract-product
Body: {
  productId: string,  // From segmentation
  imageUrl: string,
  options?: {
    extractText?: boolean,
    generateDescription?: boolean,
    classifyCategory?: boolean
  }
}
Response: {
  ok: true,
  product: {
    id: string,
    name?: string,
    description?: string,
    category?: string,
    tags: string[],
    imageUrl: string,
    thumbnailUrl: string,
    metadata: {
      dimensions: { width, height },
      confidence: number,
      extractedAt: string
    }
  }
}

POST /api/catalog/products
Body: {
  name: string,
  description?: string,
  category?: string,
  tags?: string[],
  imageUrl: string,
  thumbnailUrl?: string,
  price?: number,
  sku?: string
}
Response: {
  ok: true,
  product: CatalogProduct
}
```

**Database Schema** (Prisma):
```prisma
model CatalogProduct {
  id            String   @id @default(cuid())
  name          String
  description   String?
  category      String?
  tags          String[]
  imageUrl      String
  thumbnailUrl  String
  price         Float?
  sku           String?  @unique
  metadata      Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  // Relations
  storeId       String?
  store         Store?   @relation(fields: [storeId], references: [id])
  
  @@index([storeId])
  @@index([category])
  @@index([tags])
}
```

---

#### 3.2 Batch Processing
**Goal**: Process multiple product images at once

**User Flow**:
1. User uploads multiple images (or selects from gallery)
2. Clicks "Batch Process"
3. System processes all images:
   - Detects products in each image
   - Removes backgrounds
   - Extracts product information
4. Shows progress bar
5. Displays results grid
6. User can review and edit each product
7. Bulk add to catalog

**UI Components**:
- **BatchProcessingPanel** (new component)
  - Image upload (multiple files)
  - Processing queue list
  - Progress indicator
  - Results grid
  - Bulk selection
  - "Add All to Catalog" button

**Backend API**:
```
POST /api/vision/batch-segment
Body: {
  images: [{
    url: string,
    filename?: string
  }],
  options?: {
    removeBackground?: boolean,
    extractInfo?: boolean
  }
}
Response: {
  ok: true,
  results: [{
    imageId: string,
    products: ProductSegment[],
    processed: boolean,
    error?: string
  }],
  summary: {
    total: number,
    processed: number,
    failed: number
  }
}
```

**Implementation**:
- Queue processing jobs
- Process in parallel (limit concurrency)
- Store results in database
- Return progress updates via SSE

---

### Phase 4: Smart Cropping & Optimization

#### 4.1 Auto-Crop Products
**Goal**: Automatically crop products with optimal padding

**User Flow**:
1. User selects product
2. Clicks "Auto Crop"
3. System analyzes product bounds
4. Applies smart cropping with padding
5. User can adjust padding
6. Apply crop

**UI Components**:
- **CropToolsPanel** (new component)
  - "Auto Crop" button
  - Padding slider (0-50px)
  - Aspect ratio selector (1:1, 4:3, 16:9, custom)
  - Crop preview
  - "Apply Crop" button

**Backend API**:
```
POST /api/vision/auto-crop
Body: {
  imageUrl: string,
  productId: string,
  options?: {
    padding?: number,      // Default: 10
    aspectRatio?: string,  // "1:1", "4:3", "16:9", "auto"
    minSize?: { width, height }
  }
}
Response: {
  ok: true,
  result: {
    imageUrl: string,
    crop: { x, y, width, height },
    originalSize: { width, height },
    croppedSize: { width, height }
  }
}
```

---

#### 4.2 Product Image Optimization
**Goal**: Optimize product images for web/catalog

**User Flow**:
1. User selects product image
2. Clicks "Optimize"
3. System:
   - Resizes to catalog dimensions
   - Compresses image
   - Generates thumbnail
   - Converts to WebP (optional)
4. Shows before/after comparison
5. User can apply or revert

**Backend API**:
```
POST /api/vision/optimize-product-image
Body: {
  imageUrl: string,
  options?: {
    maxWidth?: number,     // Default: 1200
    maxHeight?: number,    // Default: 1200
    quality?: number,      // Default: 85
    format?: "jpg" | "png" | "webp",
    generateThumbnail?: boolean  // Default: true
  }
}
Response: {
  ok: true,
  result: {
    optimizedUrl: string,
    thumbnailUrl?: string,
    originalSize: number,
    optimizedSize: number,
    savings: number  // Percentage
  }
}
```

---

## 🏗️ Architecture

### Frontend Structure

```
src/features/contents-studio/
├── components/
│   ├── ProductDetectionPanel.tsx      # NEW: Product detection UI
│   ├── ProductMaskOverlay.tsx         # NEW: Canvas overlay for masks
│   ├── ProductThumbnailList.tsx       # NEW: Product list sidebar
│   ├── BackgroundToolsPanel.tsx       # NEW: Background editing tools
│   ├── ProductCatalogPanel.tsx        # NEW: Catalog management
│   ├── BatchProcessingPanel.tsx       # NEW: Batch processing UI
│   └── CropToolsPanel.tsx             # NEW: Cropping tools
├── hooks/
│   ├── useProductSegmentation.ts      # NEW: Product detection hook
│   ├── useBackgroundRemoval.ts       # NEW: Background removal hook
│   └── useCatalogManagement.ts        # NEW: Catalog operations hook
├── stores/
│   └── productCatalogStore.ts         # NEW: Catalog state management
└── types/
    └── productTypes.ts                # NEW: Product-related types
```

### Backend Structure

```
src/
├── routes/
│   ├── visionRoutes.js                # NEW: Vision API routes
│   └── catalogRoutes.js               # NEW: Catalog API routes
├── modules/
│   └── vision/
│       ├── sam3Adapter.js             # EXTEND: Add product segmentation
│       ├── productSegmenter.js        # NEW: Product segmentation logic
│       ├── backgroundRemover.js      # NEW: Background removal logic
│       └── imageOptimizer.js          # NEW: Image optimization
├── services/
│   └── catalogService.js              # NEW: Catalog management service
└── prisma/
    └── schema.prisma                  # EXTEND: Add CatalogProduct model
```

---

## 🔄 User Workflow Examples

### Workflow 1: Single Product Extraction

1. **Upload Image**
   - User drags product image to Content Studio
   - Image appears on canvas

2. **Detect Products**
   - User clicks "Detect Products" in Product Detection Panel
   - SAM-2/SAM-3 analyzes image
   - Products appear with bounding boxes

3. **Select Product**
   - User clicks on desired product
   - Product highlights and shows in sidebar

4. **Remove Background**
   - User clicks "Remove Background"
   - Background is removed, product on transparent background

5. **Add to Catalog**
   - User clicks "Add to Catalog"
   - Product form appears with auto-filled information
   - User reviews/edits and saves

### Workflow 2: Batch Catalog Creation

1. **Upload Multiple Images**
   - User selects 10 product images
   - Images added to batch queue

2. **Batch Process**
   - User clicks "Process All"
   - System processes each image:
     - Detects products
     - Removes backgrounds
     - Extracts information
   - Progress bar shows status

3. **Review Results**
   - Results grid shows all detected products
   - User can edit individual products
   - Bulk select products to add

4. **Bulk Add to Catalog**
   - User selects multiple products
   - Clicks "Add Selected to Catalog"
   - Products added with auto-generated info

### Workflow 3: Product Image Editing

1. **Open Product from Catalog**
   - User opens catalog
   - Selects product
   - Product image loads in Content Studio

2. **Edit Background**
   - User selects product
   - Chooses "Replace Background"
   - Selects new background color/image
   - Preview shows updated product

3. **Optimize Image**
   - User clicks "Optimize"
   - System resizes and compresses
   - Shows before/after comparison
   - User applies changes

4. **Update Catalog**
   - Changes saved to catalog
   - Product image updated

---

## 📊 Data Flow

### Product Segmentation Flow

```
User Uploads Image
    ↓
Frontend: ProductDetectionPanel
    ↓
API: POST /api/vision/product-segment
    ↓
Backend: sam3Adapter.runSam3Segmentation()
    ↓
Python: sam3_inference.py (SAM-2/SAM-3)
    ↓
Returns: Product regions with masks
    ↓
Backend: Process masks, create thumbnails
    ↓
Response: Product list with metadata
    ↓
Frontend: Display products in UI
```

### Background Removal Flow

```
User Selects Product
    ↓
Frontend: BackgroundToolsPanel
    ↓
API: POST /api/vision/remove-background
    ↓
Backend: Use product mask to create alpha channel
    ↓
Image Processing: Apply mask, remove background
    ↓
Storage: Save PNG with transparency
    ↓
Response: Processed image URL
    ↓
Frontend: Update canvas with new image
```

---

## 🎨 UI/UX Design

### Product Detection Panel

```
┌─────────────────────────────────┐
│ 🎯 Product Detection            │
├─────────────────────────────────┤
│                                 │
│ [📤 Upload Image]               │
│                                 │
│ [🔍 Detect Products]            │
│                                 │
│ Detected Products (3)           │
│ ┌─────┐ ┌─────┐ ┌─────┐       │
│ │ ☑️  │ │ ☐️  │ │ ☐️  │       │
│ │ 95% │ │ 87% │ │ 72% │       │
│ └─────┘ └─────┘ └─────┘       │
│                                 │
│ [Extract Selected]             │
└─────────────────────────────────┘
```

### Background Tools Panel

```
┌─────────────────────────────────┐
│ 🎨 Background Tools             │
├─────────────────────────────────┤
│                                 │
│ [Remove Background]             │
│                                 │
│ Replace Background:             │
│ ○ Color  ● Image  ○ Gradient   │
│                                 │
│ [Color Picker]                 │
│ ████████████ #FFFFFF           │
│                                 │
│ [Upload Image]                  │
│                                 │
│ [Restore Original]              │
└─────────────────────────────────┘
```

### Catalog Panel

```
┌─────────────────────────────────┐
│ 📦 Product Catalog              │
├─────────────────────────────────┤
│ [Search...] [Filter ▼]         │
│                                 │
│ ┌─────────┐ Product Name        │
│ │         │ Category: Electronics│
│ │ Image   │ Tags: #phone #new   │
│ │         │ [Edit] [Delete]     │
│ └─────────┘                     │
│                                 │
│ ┌─────────┐ Product Name        │
│ │         │ ...                 │
│ └─────────┘                     │
│                                 │
│ [+ Add Product]                 │
└─────────────────────────────────┘
```

---

## 🔌 API Endpoints Summary

### Vision Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/vision/product-segment` | Detect and segment products |
| POST | `/api/vision/remove-background` | Remove background from product |
| POST | `/api/vision/replace-background` | Replace background |
| POST | `/api/vision/auto-crop` | Auto-crop product with padding |
| POST | `/api/vision/optimize-product-image` | Optimize image for catalog |
| POST | `/api/vision/batch-segment` | Process multiple images |

### Catalog Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/catalog/products` | List products |
| POST | `/api/catalog/products` | Create product |
| GET | `/api/catalog/products/:id` | Get product |
| PATCH | `/api/catalog/products/:id` | Update product |
| DELETE | `/api/catalog/products/:id` | Delete product |
| POST | `/api/catalog/extract-product` | Extract product info from image |
| POST | `/api/catalog/bulk-create` | Bulk create products |

---

## 📝 Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Extend `sam3Adapter.js` for product segmentation
- [ ] Create `productSegmenter.js` service
- [ ] Add `ProductDetectionPanel` component
- [ ] Add `ProductMaskOverlay` canvas component
- [ ] Implement `POST /api/vision/product-segment`
- [ ] Test product detection on sample images

### Phase 2: Background Editing (Week 3-4)
- [ ] Create `backgroundRemover.js` service
- [ ] Add `BackgroundToolsPanel` component
- [ ] Implement background removal API
- [ ] Implement background replacement API
- [ ] Add image processing utilities
- [ ] Test background removal/replacement

### Phase 3: Catalog Management (Week 5-6)
- [ ] Add `CatalogProduct` model to Prisma schema
- [ ] Create `catalogService.js`
- [ ] Add catalog API routes
- [ ] Create `ProductCatalogPanel` component
- [ ] Implement product extraction
- [ ] Add catalog CRUD operations
- [ ] Test catalog workflows

### Phase 4: Batch Processing (Week 7)
- [ ] Create `BatchProcessingPanel` component
- [ ] Implement batch segmentation API
- [ ] Add job queue for batch processing
- [ ] Add progress tracking (SSE)
- [ ] Test batch processing

### Phase 5: Optimization (Week 8)
- [ ] Create `imageOptimizer.js` service
- [ ] Add `CropToolsPanel` component
- [ ] Implement auto-crop API
- [ ] Implement image optimization API
- [ ] Add before/after comparison UI
- [ ] Test optimization features

---

## 🧪 Testing Strategy

### Unit Tests
- Product segmentation logic
- Background removal algorithms
- Image optimization functions
- Catalog service methods

### Integration Tests
- API endpoints with real images
- SAM-2/SAM-3 integration
- Database operations
- File upload/storage

### E2E Tests
- Complete product extraction workflow
- Batch processing workflow
- Catalog management workflow

---

## 📚 Dependencies

### Frontend
- React Konva (canvas overlay)
- React Query (API state management)
- Zustand (catalog store)
- Image processing libraries

### Backend
- Sharp (image processing)
- SAM-2/SAM-3 Python scripts
- Prisma (database)
- File storage (S3 or local)

---

## 🚀 Next Steps

1. **Review and approve plan**
2. **Set up development environment**
3. **Start Phase 1 implementation**
4. **Create feature branch**: `feature/product-image-editing`
5. **Set up testing infrastructure**

---

## 📖 Related Documentation

- `docs/SAM3_SETUP.md` - SAM-2/SAM-3 setup instructions
- `docs/SAM3_CONTENT_STUDIO_INTEGRATION.md` - Current SAM-3 integration
- `SAM3_INTEGRATION_STATUS_REPORT.md` - Integration status

---

**Last Updated:** Current Date  
**Status:** Planning Phase  
**Estimated Timeline:** 8 weeks  
**Priority:** High


















