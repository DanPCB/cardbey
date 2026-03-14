# Product Image Editing & Catalog Management - Task Assignments

**Created:** Current Date  
**Status:** Ready for Implementation  
**Timeline:** 8 weeks (5 phases)  
**Repositories:** Backend (cardbey-core), Frontend (cardbey-marketing-dashboard)

---

## 📋 Task Summary by Repository

| Repository | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Total |
|------------|---------|---------|---------|---------|---------|-------|
| **cardbey-core** (Backend) | 8 | 6 | 10 | 4 | 4 | 32 |
| **cardbey-marketing-dashboard** (Frontend) | 6 | 5 | 8 | 3 | 3 | 25 |
| **Database** (Prisma) | 1 | 0 | 1 | 0 | 0 | 2 |
| **Testing** | 2 | 2 | 3 | 2 | 2 | 11 |
| **Documentation** | 1 | 1 | 1 | 1 | 1 | 5 |
| **TOTAL** | **18** | **14** | **23** | **10** | **10** | **75** |

---

## 🏗️ Phase 1: Foundation - Product Segmentation

**Timeline:** Weeks 1-2  
**Priority:** 🔴 CRITICAL

---

### Repository: `apps/core/cardbey-core` (Backend)

#### Task BACKEND-001: Extend SAM-3 Adapter for Product Segmentation
**File:** `src/modules/vision/sam3Adapter.js`  
**Assignee:** Backend Team  
**Estimated Time:** 4 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Extend `runSam3Segmentation()` to support product-specific segmentation with product detection mode.

**Acceptance Criteria:**
- [ ] Add `purpose: 'product'` support to segmentation
- [ ] Add product detection prompt: "Identify all products, objects, and items in this image"
- [ ] Filter results to focus on product-like regions (confidence > 0.7)
- [ ] Return structured product data with bounding boxes and masks
- [ ] Add logging for product detection

**Implementation Notes:**
```javascript
// Add to purposePrompts in runSam3Segmentation()
product: 'Identify all products, objects, and items in this image. Focus on distinct products that can be extracted.',

// Filter regions to product-like items
const productRegions = regions.filter(r => 
  r.confidence > 0.7 && 
  (r.label === 'product' || r.label === 'object' || !r.label)
);
```

**Testing:**
- [ ] Test with product images (single product)
- [ ] Test with multiple products
- [ ] Test with complex backgrounds
- [ ] Verify bounding boxes are accurate

---

#### Task BACKEND-002: Create Product Segmenter Service
**File:** `src/modules/vision/productSegmenter.js` (NEW)  
**Assignee:** Backend Team  
**Estimated Time:** 6 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Create a dedicated service for product segmentation that wraps SAM-3 adapter and adds product-specific logic.

**Acceptance Criteria:**
- [ ] Create `productSegmenter.js` file
- [ ] Implement `segmentProducts(imageUrl, options)` function
- [ ] Add product filtering logic (min confidence, max products)
- [ ] Generate thumbnails for detected products
- [ ] Return structured product data with IDs
- [ ] Add error handling and validation

**Implementation:**
```javascript
export async function segmentProducts(imageUrl, options = {}) {
  const {
    minConfidence = 0.7,
    maxProducts = 10,
    includeBackground = false
  } = options;
  
  // Call SAM-3 segmentation
  const result = await runSam3Segmentation({
    imageUrl,
    purpose: 'product',
    imageBuffer: null,
    isVideo: false
  });
  
  // Filter and process products
  const products = result.regions
    .filter(r => r.confidence >= minConfidence)
    .slice(0, maxProducts)
    .map((region, idx) => ({
      id: `product_${Date.now()}_${idx}`,
      bbox: region.bbox,
      mask: region.maskId,
      confidence: region.confidence,
      label: region.label || 'product',
      thumbnail: null // Will be generated
    }));
  
  // Generate thumbnails (async)
  // ... thumbnail generation logic
  
  return { products };
}
```

**Testing:**
- [ ] Unit tests for filtering logic
- [ ] Integration tests with real images
- [ ] Test thumbnail generation

---

#### Task BACKEND-003: Create Product Segmentation API Endpoint
**File:** `src/routes/visionRoutes.js` (NEW)  
**Assignee:** Backend Team  
**Estimated Time:** 3 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Create API endpoint for product segmentation.

**Acceptance Criteria:**
- [ ] Create `visionRoutes.js` file
- [ ] Add `POST /api/vision/product-segment` endpoint
- [ ] Accept `imageUrl` or `imageBuffer` (multipart)
- [ ] Accept options (minConfidence, maxProducts)
- [ ] Call `productSegmenter.segmentProducts()`
- [ ] Return structured response
- [ ] Add authentication middleware
- [ ] Add request validation

**Implementation:**
```javascript
router.post('/product-segment', requireAuth, async (req, res) => {
  try {
    const { imageUrl, options } = req.body;
    const imageBuffer = req.file?.buffer;
    
    if (!imageUrl && !imageBuffer) {
      return res.status(400).json({
        ok: false,
        error: 'image_required',
        message: 'imageUrl or image file is required'
      });
    }
    
    const result = await segmentProducts(imageUrl || imageBuffer, options);
    
    res.json({
      ok: true,
      products: result.products
    });
  } catch (error) {
    console.error('[Vision] Product segmentation error:', error);
    res.status(500).json({
      ok: false,
      error: 'segmentation_failed',
      message: error.message
    });
  }
});
```

**Testing:**
- [ ] Test with imageUrl
- [ ] Test with file upload
- [ ] Test with options
- [ ] Test error handling

---

#### Task BACKEND-004: Add Thumbnail Generation Utility
**File:** `src/utils/imageUtils.js` (NEW or EXTEND)  
**Assignee:** Backend Team  
**Estimated Time:** 4 hours  
**Priority:** 🟡 HIGH

**Description:**
Create utility to generate thumbnails from product regions.

**Acceptance Criteria:**
- [ ] Create `imageUtils.js` or extend existing
- [ ] Implement `generateThumbnail(imageUrl, bbox, size)` function
- [ ] Use Sharp for image processing
- [ ] Crop image to bounding box
- [ ] Resize to thumbnail size (e.g., 200x200)
- [ ] Save to uploads/thumbnails/
- [ ] Return thumbnail URL

**Testing:**
- [ ] Test thumbnail generation
- [ ] Test with different sizes
- [ ] Test error handling

---

#### Task BACKEND-005: Add Mask Storage Utility
**File:** `src/utils/maskUtils.js` (NEW)  
**Assignee:** Backend Team  
**Estimated Time:** 3 hours  
**Priority:** 🟡 HIGH

**Description:**
Create utility to store and retrieve segmentation masks.

**Acceptance Criteria:**
- [ ] Create `maskUtils.js`
- [ ] Implement `saveMask(maskData, productId)` function
- [ ] Convert mask to PNG format
- [ ] Save to uploads/masks/
- [ ] Return mask URL
- [ ] Implement `getMask(maskId)` function

**Testing:**
- [ ] Test mask saving
- [ ] Test mask retrieval
- [ ] Test mask format conversion

---

#### Task BACKEND-006: Add Vision Routes to Server
**File:** `src/server.js`  
**Assignee:** Backend Team  
**Estimated Time:** 1 hour  
**Priority:** 🔴 CRITICAL

**Description:**
Mount vision routes in main server.

**Acceptance Criteria:**
- [ ] Import visionRoutes
- [ ] Mount at `/api/vision`
- [ ] Add to route logging

**Implementation:**
```javascript
import visionRoutes from './routes/visionRoutes.js';
app.use('/api/vision', visionRoutes);
```

---

#### Task BACKEND-007: Add Multipart File Upload Support
**File:** `src/routes/visionRoutes.js`  
**Assignee:** Backend Team  
**Estimated Time:** 2 hours  
**Priority:** 🟡 HIGH

**Description:**
Add support for file uploads using multer or similar.

**Acceptance Criteria:**
- [ ] Install multer (if not already)
- [ ] Configure multer middleware
- [ ] Accept image files (jpg, png, webp)
- [ ] Limit file size (e.g., 10MB)
- [ ] Store files temporarily or in memory
- [ ] Pass buffer to segmentation function

**Testing:**
- [ ] Test file upload
- [ ] Test file size limits
- [ ] Test file type validation

---

#### Task BACKEND-008: Add Product Segmentation Logging
**File:** `src/modules/vision/productSegmenter.js`  
**Assignee:** Backend Team  
**Estimated Time:** 1 hour  
**Priority:** 🟢 MEDIUM

**Description:**
Add comprehensive logging for product segmentation operations.

**Acceptance Criteria:**
- [ ] Log segmentation requests
- [ ] Log processing time
- [ ] Log number of products detected
- [ ] Log errors with context
- [ ] Add performance metrics

---

### Repository: `apps/dashboard/cardbey-marketing-dashboard` (Frontend)

#### Task FRONTEND-001: Create Product Detection Panel Component
**File:** `src/features/contents-studio/components/ProductDetectionPanel.tsx` (NEW)  
**Assignee:** Frontend Team  
**Estimated Time:** 6 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Create UI component for product detection with upload, detection button, and product list.

**Acceptance Criteria:**
- [ ] Create `ProductDetectionPanel.tsx`
- [ ] Add image upload button/area
- [ ] Add "Detect Products" button
- [ ] Show loading state during detection
- [ ] Display detected products in grid/list
- [ ] Show product thumbnails
- [ ] Show confidence scores
- [ ] Add selection checkboxes
- [ ] Add "Extract Selected" button
- [ ] Handle errors gracefully

**UI Structure:**
```tsx
<div className="space-y-4">
  <h3>Product Detection</h3>
  <ImageUpload />
  <Button onClick={detectProducts}>Detect Products</Button>
  {products.length > 0 && (
    <ProductGrid products={products} onSelect={handleSelect} />
  )}
  <Button onClick={extractSelected}>Extract Selected</Button>
</div>
```

**Testing:**
- [ ] Test image upload
- [ ] Test product detection
- [ ] Test product selection
- [ ] Test error states

---

#### Task FRONTEND-002: Create Product Mask Overlay Component
**File:** `src/features/contents-studio/components/ProductMaskOverlay.tsx` (NEW)  
**Assignee:** Frontend Team  
**Estimated Time:** 5 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Create canvas overlay component to show product bounding boxes and masks.

**Acceptance Criteria:**
- [ ] Create `ProductMaskOverlay.tsx` using React Konva
- [ ] Render bounding boxes for detected products
- [ ] Highlight selected products
- [ ] Show confidence scores on hover
- [ ] Handle click events for selection
- [ ] Sync with ProductDetectionPanel state
- [ ] Add to CanvasStage overlay layer

**Implementation:**
```tsx
<Layer>
  {products.map(product => (
    <Group key={product.id}>
      <Rect
        x={product.bbox.x}
        y={product.bbox.y}
        width={product.bbox.width}
        height={product.bbox.height}
        stroke={selectedIds.includes(product.id) ? 'blue' : 'green'}
        strokeWidth={2}
        onClick={() => handleSelect(product.id)}
      />
      {product.mask && (
        <Image image={maskImage} ... />
      )}
    </Group>
  ))}
</Layer>
```

**Testing:**
- [ ] Test bounding box rendering
- [ ] Test selection interaction
- [ ] Test mask overlay
- [ ] Test performance with many products

---

#### Task FRONTEND-003: Create Product Thumbnail List Component
**File:** `src/features/contents-studio/components/ProductThumbnailList.tsx` (NEW)  
**Assignee:** Frontend Team  
**Estimated Time:** 4 hours  
**Priority:** 🟡 HIGH

**Description:**
Create sidebar component showing detected products as thumbnails.

**Acceptance Criteria:**
- [ ] Create `ProductThumbnailList.tsx`
- [ ] Display products in grid or list
- [ ] Show product thumbnails
- [ ] Show confidence badges
- [ ] Add selection checkboxes
- [ ] Add quick actions (extract, edit, delete)
- [ ] Handle empty state
- [ ] Add loading skeleton

**Testing:**
- [ ] Test thumbnail display
- [ ] Test selection
- [ ] Test quick actions
- [ ] Test empty state

---

#### Task FRONTEND-004: Create Product Segmentation Hook
**File:** `src/features/contents-studio/hooks/useProductSegmentation.ts` (NEW)  
**Assignee:** Frontend Team  
**Estimated Time:** 4 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Create React hook for product segmentation API calls and state management.

**Acceptance Criteria:**
- [ ] Create `useProductSegmentation.ts`
- [ ] Implement `detectProducts(imageUrl, options)` function
- [ ] Manage loading state
- [ ] Manage error state
- [ ] Manage products state
- [ ] Handle file uploads
- [ ] Return products, loading, error, detectProducts function

**Implementation:**
```tsx
export function useProductSegmentation() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const detectProducts = async (imageUrl: string, options?: Options) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiPOST('/api/vision/product-segment', {
        imageUrl,
        options
      });
      setProducts(response.products);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };
  
  return { products, isLoading, error, detectProducts };
}
```

**Testing:**
- [ ] Test API calls
- [ ] Test state management
- [ ] Test error handling

---

#### Task FRONTEND-005: Integrate Product Detection into Content Studio
**File:** `src/features/contents-studio/components/SmartPropertiesPanel.tsx`  
**Assignee:** Frontend Team  
**Estimated Time:** 2 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Add Product Detection tab to SmartPropertiesPanel.

**Acceptance Criteria:**
- [ ] Add "Product Detection" tab to TabsList
- [ ] Add ProductDetectionPanel to TabsContent
- [ ] Import ProductDetectionPanel component
- [ ] Test tab switching

**Implementation:**
```tsx
<TabsTrigger value="products">
  <Package className="h-3 w-3 mr-1" />
  Products
</TabsTrigger>
<TabsContent value="products">
  <ProductDetectionPanel />
</TabsContent>
```

---

#### Task FRONTEND-006: Add Product Types
**File:** `src/features/contents-studio/types/productTypes.ts` (NEW)  
**Assignee:** Frontend Team  
**Estimated Time:** 1 hour  
**Priority:** 🟡 HIGH

**Description:**
Create TypeScript types for product-related data structures.

**Acceptance Criteria:**
- [ ] Create `productTypes.ts`
- [ ] Define `Product` interface
- [ ] Define `ProductBbox` interface
- [ ] Define `ProductSegmentOptions` interface
- [ ] Export all types

**Implementation:**
```tsx
export interface Product {
  id: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  mask?: string;
  confidence: number;
  label?: string;
  thumbnail?: string;
}

export interface ProductSegmentOptions {
  minConfidence?: number;
  maxProducts?: number;
  includeBackground?: boolean;
}
```

---

### Repository: Database (Prisma)

#### Task DB-001: Add Catalog Product Model (Placeholder)
**File:** `prisma/schema.prisma`  
**Assignee:** Backend Team  
**Estimated Time:** 1 hour  
**Priority:** 🟢 MEDIUM (Phase 3, but prepare now)

**Description:**
Add CatalogProduct model to schema (will be used in Phase 3).

**Acceptance Criteria:**
- [ ] Add CatalogProduct model
- [ ] Add required fields (id, name, imageUrl, etc.)
- [ ] Add optional fields (description, category, tags, price)
- [ ] Add relations (Store)
- [ ] Add indexes
- [ ] Create migration

**Note:** This is prepared for Phase 3 but can be added now.

---

### Testing

#### Task TEST-001: Unit Tests for Product Segmenter
**File:** `tests/vision/productSegmenter.test.js` (NEW)  
**Assignee:** QA/Backend Team  
**Estimated Time:** 3 hours  
**Priority:** 🟡 HIGH

**Description:**
Write unit tests for product segmentation logic.

**Acceptance Criteria:**
- [ ] Test filtering logic
- [ ] Test product ID generation
- [ ] Test thumbnail generation
- [ ] Test error handling

---

#### Task TEST-002: Integration Tests for Product Segmentation API
**File:** `tests/vision/productSegment.test.js` (NEW)  
**Assignee:** QA/Backend Team  
**Estimated Time:** 4 hours  
**Priority:** 🟡 HIGH

**Description:**
Write integration tests for product segmentation endpoint.

**Acceptance Criteria:**
- [ ] Test POST /api/vision/product-segment
- [ ] Test with imageUrl
- [ ] Test with file upload
- [ ] Test with options
- [ ] Test error cases
- [ ] Test authentication

---

### Documentation

#### Task DOC-001: Update API Documentation
**File:** `docs/API.md` or similar  
**Assignee:** Backend Team  
**Estimated Time:** 1 hour  
**Priority:** 🟢 MEDIUM

**Description:**
Document new product segmentation API endpoints.

**Acceptance Criteria:**
- [ ] Document POST /api/vision/product-segment
- [ ] Include request/response examples
- [ ] Document options
- [ ] Document error codes

---

## 🎨 Phase 2: Background Editing

**Timeline:** Weeks 3-4  
**Priority:** 🔴 CRITICAL

---

### Repository: `apps/core/cardbey-core` (Backend)

#### Task BACKEND-009: Create Background Remover Service
**File:** `src/modules/vision/backgroundRemover.js` (NEW)  
**Assignee:** Backend Team  
**Estimated Time:** 6 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Create service to remove backgrounds using product masks.

**Acceptance Criteria:**
- [ ] Create `backgroundRemover.js`
- [ ] Implement `removeBackground(imageUrl, productIds, options)` function
- [ ] Use Sharp to apply mask as alpha channel
- [ ] Add edge feathering option
- [ ] Export as PNG with transparency
- [ ] Save processed image
- [ ] Return processed image URL

**Testing:**
- [ ] Test background removal
- [ ] Test edge feathering
- [ ] Test with multiple products
- [ ] Test error handling

---

#### Task BACKEND-010: Create Background Replacement Service
**File:** `src/modules/vision/backgroundRemover.js` (EXTEND)  
**Assignee:** Backend Team  
**Estimated Time:** 5 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Extend background remover to support background replacement.

**Acceptance Criteria:**
- [ ] Implement `replaceBackground(imageUrl, background, options)` function
- [ ] Support color backgrounds
- [ ] Support image backgrounds
- [ ] Support gradient backgrounds
- [ ] Composite product on new background
- [ ] Return composite image URL

**Testing:**
- [ ] Test color replacement
- [ ] Test image replacement
- [ ] Test gradient replacement
- [ ] Test blend modes

---

#### Task BACKEND-011: Add Background Removal API Endpoint
**File:** `src/routes/visionRoutes.js`  
**Assignee:** Backend Team  
**Estimated Time:** 2 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Add API endpoint for background removal.

**Acceptance Criteria:**
- [ ] Add `POST /api/vision/remove-background` endpoint
- [ ] Accept imageUrl and productIds
- [ ] Accept options (feather, refine)
- [ ] Call backgroundRemover service
- [ ] Return result with imageUrl and maskUrl

---

#### Task BACKEND-012: Add Background Replacement API Endpoint
**File:** `src/routes/visionRoutes.js`  
**Assignee:** Backend Team  
**Estimated Time:** 2 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Add API endpoint for background replacement.

**Acceptance Criteria:**
- [ ] Add `POST /api/vision/replace-background` endpoint
- [ ] Accept productImageUrl and background config
- [ ] Accept options (blendMode, opacity)
- [ ] Call backgroundRemover service
- [ ] Return composite image URL

---

#### Task BACKEND-013: Add Image Processing Utilities
**File:** `src/utils/imageUtils.js` (EXTEND)  
**Assignee:** Backend Team  
**Estimated Time:** 4 hours  
**Priority:** 🟡 HIGH

**Description:**
Add utilities for image compositing and processing.

**Acceptance Criteria:**
- [ ] Add `compositeImages()` function
- [ ] Add `applyGradient()` function
- [ ] Add `applyBlendMode()` function
- [ ] Use Sharp for all operations
- [ ] Handle errors gracefully

---

#### Task BACKEND-014: Add Background Processing Logging
**File:** `src/modules/vision/backgroundRemover.js`  
**Assignee:** Backend Team  
**Estimated Time:** 1 hour  
**Priority:** 🟢 MEDIUM

**Description:**
Add logging for background operations.

**Acceptance Criteria:**
- [ ] Log background removal requests
- [ ] Log processing time
- [ ] Log file sizes
- [ ] Log errors

---

### Repository: `apps/dashboard/cardbey-marketing-dashboard` (Frontend)

#### Task FRONTEND-007: Create Background Tools Panel Component
**File:** `src/features/contents-studio/components/BackgroundToolsPanel.tsx` (NEW)  
**Assignee:** Frontend Team  
**Estimated Time:** 6 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Create UI component for background editing tools.

**Acceptance Criteria:**
- [ ] Create `BackgroundToolsPanel.tsx`
- [ ] Add "Remove Background" button
- [ ] Add "Replace Background" section
- [ ] Add background type selector (Color/Image/Gradient)
- [ ] Add color picker
- [ ] Add image upload for background
- [ ] Add gradient editor
- [ ] Add "Restore Original" button
- [ ] Show preview
- [ ] Handle loading states

**Testing:**
- [ ] Test background removal
- [ ] Test background replacement
- [ ] Test all background types
- [ ] Test preview

---

#### Task FRONTEND-008: Create Background Removal Hook
**File:** `src/features/contents-studio/hooks/useBackgroundRemoval.ts` (NEW)  
**Assignee:** Frontend Team  
**Estimated Time:** 3 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Create React hook for background removal API calls.

**Acceptance Criteria:**
- [ ] Create `useBackgroundRemoval.ts`
- [ ] Implement `removeBackground()` function
- [ ] Implement `replaceBackground()` function
- [ ] Manage loading state
- [ ] Manage error state
- [ ] Return functions and state

---

#### Task FRONTEND-009: Integrate Background Tools into Content Studio
**File:** `src/features/contents-studio/components/SmartPropertiesPanel.tsx`  
**Assignee:** Frontend Team  
**Estimated Time:** 1 hour  
**Priority:** 🔴 CRITICAL

**Description:**
Add Background Tools to Properties Panel or create separate tab.

**Acceptance Criteria:**
- [ ] Add Background Tools to appropriate panel
- [ ] Show when product is selected
- [ ] Hide when no product selected

---

#### Task FRONTEND-010: Add Background Preview Component
**File:** `src/features/contents-studio/components/BackgroundPreview.tsx` (NEW)  
**Assignee:** Frontend Team  
**Estimated Time:** 3 hours  
**Priority:** 🟡 HIGH

**Description:**
Create component to preview background changes before applying.

**Acceptance Criteria:**
- [ ] Create `BackgroundPreview.tsx`
- [ ] Show before/after comparison
- [ ] Allow toggling preview
- [ ] Show loading state
- [ ] Handle errors

---

#### Task FRONTEND-011: Update Canvas to Show Background Changes
**File:** `src/features/contents-studio/CanvasStage.tsx`  
**Assignee:** Frontend Team  
**Estimated Time:** 2 hours  
**Priority:** 🟡 HIGH

**Description:**
Update canvas to reflect background changes in real-time.

**Acceptance Criteria:**
- [ ] Update image nodes when background changes
- [ ] Show preview mode
- [ ] Apply changes on confirm
- [ ] Revert on cancel

---

### Testing

#### Task TEST-003: Unit Tests for Background Remover
**File:** `tests/vision/backgroundRemover.test.js` (NEW)  
**Assignee:** QA/Backend Team  
**Estimated Time:** 3 hours  
**Priority:** 🟡 HIGH

**Description:**
Write unit tests for background removal logic.

---

#### Task TEST-004: Integration Tests for Background APIs
**File:** `tests/vision/background.test.js` (NEW)  
**Assignee:** QA/Backend Team  
**Estimated Time:** 4 hours  
**Priority:** 🟡 HIGH

**Description:**
Write integration tests for background removal/replacement endpoints.

---

### Documentation

#### Task DOC-002: Document Background Editing APIs
**File:** `docs/API.md`  
**Assignee:** Backend Team  
**Estimated Time:** 1 hour  
**Priority:** 🟢 MEDIUM

**Description:**
Document background removal and replacement APIs.

---

## 📦 Phase 3: Catalog Management

**Timeline:** Weeks 5-6  
**Priority:** 🔴 CRITICAL

---

### Repository: `apps/core/cardbey-core` (Backend)

#### Task BACKEND-015: Create Catalog Product Model
**File:** `prisma/schema.prisma`  
**Assignee:** Backend Team  
**Estimated Time:** 2 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Add CatalogProduct model to Prisma schema.

**Acceptance Criteria:**
- [ ] Add CatalogProduct model with all fields
- [ ] Add Store relation
- [ ] Add indexes
- [ ] Create migration
- [ ] Run migration

---

#### Task BACKEND-016: Create Catalog Service
**File:** `src/services/catalogService.js` (NEW)  
**Assignee:** Backend Team  
**Estimated Time:** 6 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Create service for catalog operations.

**Acceptance Criteria:**
- [ ] Create `catalogService.js`
- [ ] Implement `createProduct()` function
- [ ] Implement `getProduct()` function
- [ ] Implement `updateProduct()` function
- [ ] Implement `deleteProduct()` function
- [ ] Implement `listProducts()` function with filters
- [ ] Implement `searchProducts()` function
- [ ] Add validation
- [ ] Add error handling

---

#### Task BACKEND-017: Create Product Extraction Service
**File:** `src/services/catalogService.js` (EXTEND)  
**Assignee:** Backend Team  
**Estimated Time:** 5 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Add product information extraction using OCR and AI.

**Acceptance Criteria:**
- [ ] Implement `extractProductInfo()` function
- [ ] Use OCR to extract text (product name, price)
- [ ] Use AI to generate description
- [ ] Use AI to classify category
- [ ] Generate tags automatically
- [ ] Return structured product data

---

#### Task BACKEND-018: Create Catalog API Routes
**File:** `src/routes/catalogRoutes.js` (NEW)  
**Assignee:** Backend Team  
**Estimated Time:** 4 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Create REST API routes for catalog operations.

**Acceptance Criteria:**
- [ ] Create `catalogRoutes.js`
- [ ] Add `GET /api/catalog/products` (list)
- [ ] Add `POST /api/catalog/products` (create)
- [ ] Add `GET /api/catalog/products/:id` (get)
- [ ] Add `PATCH /api/catalog/products/:id` (update)
- [ ] Add `DELETE /api/catalog/products/:id` (delete)
- [ ] Add `POST /api/catalog/extract-product` (extract)
- [ ] Add authentication middleware
- [ ] Add validation

---

#### Task BACKEND-019: Add Catalog Routes to Server
**File:** `src/server.js`  
**Assignee:** Backend Team  
**Estimated Time:** 1 hour  
**Priority:** 🔴 CRITICAL

**Description:**
Mount catalog routes in main server.

---

#### Task BACKEND-020: Add Bulk Operations Support
**File:** `src/routes/catalogRoutes.js`  
**Assignee:** Backend Team  
**Estimated Time:** 3 hours  
**Priority:** 🟡 HIGH

**Description:**
Add bulk create and update endpoints.

**Acceptance Criteria:**
- [ ] Add `POST /api/catalog/bulk-create` endpoint
- [ ] Accept array of products
- [ ] Validate all products
- [ ] Create all products
- [ ] Return results with errors if any

---

#### Task BACKEND-021: Add Product Search Functionality
**File:** `src/services/catalogService.js`  
**Assignee:** Backend Team  
**Estimated Time:** 4 hours  
**Priority:** 🟡 HIGH

**Description:**
Implement product search with filters.

**Acceptance Criteria:**
- [ ] Implement search by name
- [ ] Implement search by category
- [ ] Implement search by tags
- [ ] Add pagination
- [ ] Add sorting
- [ ] Return results with metadata

---

#### Task BACKEND-022: Add Product Image Optimization
**File:** `src/services/catalogService.js`  
**Assignee:** Backend Team  
**Estimated Time:** 3 hours  
**Priority:** 🟡 HIGH

**Description:**
Optimize product images when saving to catalog.

**Acceptance Criteria:**
- [ ] Resize images to catalog dimensions
- [ ] Generate thumbnails
- [ ] Compress images
- [ ] Convert to WebP (optional)
- [ ] Store optimized images

---

#### Task BACKEND-023: Add Catalog Logging
**File:** `src/services/catalogService.js`  
**Assignee:** Backend Team  
**Estimated Time:** 1 hour  
**Priority:** 🟢 MEDIUM

**Description:**
Add logging for catalog operations.

---

#### Task BACKEND-024: Add Catalog Metrics
**File:** `src/services/catalogService.js`  
**Assignee:** Backend Team  
**Estimated Time:** 2 hours  
**Priority:** 🟢 MEDIUM

**Description:**
Add metrics tracking for catalog operations.

---

### Repository: `apps/dashboard/cardbey-marketing-dashboard` (Frontend)

#### Task FRONTEND-012: Create Product Catalog Panel Component
**File:** `src/features/contents-studio/components/ProductCatalogPanel.tsx` (NEW)  
**Assignee:** Frontend Team  
**Estimated Time:** 8 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Create comprehensive catalog management UI.

**Acceptance Criteria:**
- [ ] Create `ProductCatalogPanel.tsx`
- [ ] Add product list view (grid/list toggle)
- [ ] Add product detail view
- [ ] Add search and filter UI
- [ ] Add "Add to Catalog" button
- [ ] Add product form (name, description, category, tags, price)
- [ ] Add edit/delete actions
- [ ] Add bulk selection
- [ ] Handle empty state
- [ ] Add loading states

---

#### Task FRONTEND-013: Create Product Form Component
**File:** `src/features/contents-studio/components/ProductForm.tsx` (NEW)  
**Assignee:** Frontend Team  
**Estimated Time:** 4 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Create form component for product creation/editing.

**Acceptance Criteria:**
- [ ] Create `ProductForm.tsx`
- [ ] Add fields: name, description, category, tags, price, SKU
- [ ] Add image upload/preview
- [ ] Add validation
- [ ] Add submit/cancel buttons
- [ ] Handle auto-fill from extraction

---

#### Task FRONTEND-014: Create Catalog Management Hook
**File:** `src/features/contents-studio/hooks/useCatalogManagement.ts` (NEW)  
**Assignee:** Frontend Team  
**Estimated Time:** 4 hours  
**Priority:** 🔴 CRITICAL

**Description:**
Create React hook for catalog API operations.

**Acceptance Criteria:**
- [ ] Create `useCatalogManagement.ts`
- [ ] Implement CRUD operations
- [ ] Implement search/filter
- [ ] Manage state
- [ ] Handle errors

---

#### Task FRONTEND-015: Create Catalog Store (Zustand)
**File:** `src/features/contents-studio/stores/productCatalogStore.ts` (NEW)  
**Assignee:** Frontend Team  
**Estimated Time:** 3 hours  
**Priority:** 🟡 HIGH

**Description:**
Create Zustand store for catalog state management.

**Acceptance Criteria:**
- [ ] Create `productCatalogStore.ts`
- [ ] Store products list
- [ ] Store selected product
- [ ] Store filters
- [ ] Store search query
- [ ] Add actions (setProducts, setSelected, etc.)

---

#### Task FRONTEND-016: Integrate Catalog Panel into Content Studio
**File:** `src/features/contents-studio/components/SmartPropertiesPanel.tsx`  
**Assignee:** Frontend Team  
**Estimated Time:** 1 hour  
**Priority:** 🔴 CRITICAL

**Description:**
Add Catalog tab to SmartPropertiesPanel.

---

#### Task FRONTEND-017: Add Product Extraction UI
**File:** `src/features/contents-studio/components/ProductDetectionPanel.tsx`  
**Assignee:** Frontend Team  
**Estimated Time:** 3 hours  
**Priority:** 🟡 HIGH

**Description:**
Add "Add to Catalog" functionality to Product Detection Panel.

**Acceptance Criteria:**
- [ ] Add "Add to Catalog" button
- [ ] Show extraction progress
- [ ] Show extracted information
- [ ] Allow editing before saving
- [ ] Save to catalog

---

#### Task FRONTEND-018: Add Product Search UI
**File:** `src/features/contents-studio/components/ProductCatalogPanel.tsx`  
**Assignee:** Frontend Team  
**Estimated Time:** 2 hours  
**Priority:** 🟡 HIGH

**Description:**
Add search and filter UI to catalog panel.

**Acceptance Criteria:**
- [ ] Add search input
- [ ] Add category filter
- [ ] Add tag filter
- [ ] Add sort options
- [ ] Update results in real-time

---

#### Task FRONTEND-019: Add Bulk Actions UI
**File:** `src/features/contents-studio/components/ProductCatalogPanel.tsx`  
**Assignee:** Frontend Team  
**Estimated Time:** 2 hours  
**Priority:** 🟡 HIGH

**Description:**
Add bulk selection and actions to catalog panel.

**Acceptance Criteria:**
- [ ] Add select all checkbox
- [ ] Add individual selection
- [ ] Add bulk delete
- [ ] Add bulk export
- [ ] Show selection count

---

### Testing

#### Task TEST-005: Unit Tests for Catalog Service
**File:** `tests/services/catalogService.test.js` (NEW)  
**Assignee:** QA/Backend Team  
**Estimated Time:** 4 hours  
**Priority:** 🟡 HIGH

**Description:**
Write unit tests for catalog service.

---

#### Task TEST-006: Integration Tests for Catalog APIs
**File:** `tests/catalog/catalog.test.js` (NEW)  
**Assignee:** QA/Backend Team  
**Estimated Time:** 5 hours  
**Priority:** 🟡 HIGH

**Description:**
Write integration tests for catalog endpoints.

---

#### Task TEST-007: E2E Tests for Catalog Workflow
**File:** `tests/e2e/catalogWorkflow.test.js` (NEW)  
**Assignee:** QA Team  
**Estimated Time:** 6 hours  
**Priority:** 🟡 HIGH

**Description:**
Write E2E tests for complete catalog workflow.

---

### Documentation

#### Task DOC-003: Document Catalog APIs
**File:** `docs/API.md`  
**Assignee:** Backend Team  
**Estimated Time:** 2 hours  
**Priority:** 🟢 MEDIUM

**Description:**
Document all catalog API endpoints.

---

## 🔄 Phase 4: Batch Processing

**Timeline:** Week 7  
**Priority:** 🟡 HIGH

---

### Repository: `apps/core/cardbey-core` (Backend)

#### Task BACKEND-025: Create Batch Processing Service
**File:** `src/services/batchProcessingService.js` (NEW)  
**Assignee:** Backend Team  
**Estimated Time:** 6 hours  
**Priority:** 🟡 HIGH

**Description:**
Create service for batch image processing.

**Acceptance Criteria:**
- [ ] Create `batchProcessingService.js`
- [ ] Implement job queue
- [ ] Process images in parallel (limit concurrency)
- [ ] Track progress
- [ ] Store results
- [ ] Handle errors gracefully

---

#### Task BACKEND-026: Add Batch Segmentation API Endpoint
**File:** `src/routes/visionRoutes.js`  
**Assignee:** Backend Team  
**Estimated Time:** 3 hours  
**Priority:** 🟡 HIGH

**Description:**
Add API endpoint for batch product segmentation.

**Acceptance Criteria:**
- [ ] Add `POST /api/vision/batch-segment` endpoint
- [ ] Accept array of images
- [ ] Accept options
- [ ] Return job ID
- [ ] Process asynchronously

---

#### Task BACKEND-027: Add Batch Progress Tracking (SSE)
**File:** `src/routes/visionRoutes.js`  
**Assignee:** Backend Team  
**Estimated Time:** 3 hours  
**Priority:** 🟡 HIGH

**Description:**
Add SSE endpoint for batch processing progress.

**Acceptance Criteria:**
- [ ] Add `GET /api/vision/batch-progress/:jobId` SSE endpoint
- [ ] Send progress updates
- [ ] Send completion status
- [ ] Send errors if any

---

#### Task BACKEND-028: Add Batch Results Storage
**File:** `src/services/batchProcessingService.js`  
**Assignee:** Backend Team  
**Estimated Time:** 2 hours  
**Priority:** 🟡 HIGH

**Description:**
Store batch processing results for retrieval.

**Acceptance Criteria:**
- [ ] Store results in database or cache
- [ ] Add expiration (e.g., 24 hours)
- [ ] Implement retrieval endpoint

---

### Repository: `apps/dashboard/cardbey-marketing-dashboard` (Frontend)

#### Task FRONTEND-020: Create Batch Processing Panel Component
**File:** `src/features/contents-studio/components/BatchProcessingPanel.tsx` (NEW)  
**Assignee:** Frontend Team  
**Estimated Time:** 6 hours  
**Priority:** 🟡 HIGH

**Description:**
Create UI for batch image processing.

**Acceptance Criteria:**
- [ ] Create `BatchProcessingPanel.tsx`
- [ ] Add multiple file upload
- [ ] Show processing queue
- [ ] Show progress bar
- [ ] Show results grid
- [ ] Add bulk selection
- [ ] Add "Add All to Catalog" button

---

#### Task FRONTEND-021: Create Batch Processing Hook
**File:** `src/features/contents-studio/hooks/useBatchProcessing.ts` (NEW)  
**Assignee:** Frontend Team  
**Estimated Time:** 3 hours  
**Priority:** 🟡 HIGH

**Description:**
Create React hook for batch processing with SSE progress.

**Acceptance Criteria:**
- [ ] Create `useBatchProcessing.ts`
- [ ] Implement `processBatch()` function
- [ ] Connect to SSE for progress
- [ ] Manage queue state
- [ ] Manage results state
- [ ] Handle errors

---

#### Task FRONTEND-022: Integrate Batch Processing into Content Studio
**File:** `src/features/contents-studio/components/SmartPropertiesPanel.tsx`  
**Assignee:** Frontend Team  
**Estimated Time:** 1 hour  
**Priority:** 🟡 HIGH

**Description:**
Add Batch Processing tab or integrate into Product Detection Panel.

---

### Testing

#### Task TEST-008: Integration Tests for Batch Processing
**File:** `tests/vision/batchProcessing.test.js` (NEW)  
**Assignee:** QA/Backend Team  
**Estimated Time:** 4 hours  
**Priority:** 🟡 HIGH

**Description:**
Write integration tests for batch processing.

---

#### Task TEST-009: E2E Tests for Batch Workflow
**File:** `tests/e2e/batchWorkflow.test.js` (NEW)  
**Assignee:** QA Team  
**Estimated Time:** 4 hours  
**Priority:** 🟡 HIGH

**Description:**
Write E2E tests for batch processing workflow.

---

### Documentation

#### Task DOC-004: Document Batch Processing APIs
**File:** `docs/API.md`  
**Assignee:** Backend Team  
**Estimated Time:** 1 hour  
**Priority:** 🟢 MEDIUM

**Description:**
Document batch processing endpoints.

---

## ✂️ Phase 5: Optimization

**Timeline:** Week 8  
**Priority:** 🟡 HIGH

---

### Repository: `apps/core/cardbey-core` (Backend)

#### Task BACKEND-029: Create Image Optimizer Service
**File:** `src/modules/vision/imageOptimizer.js` (NEW)  
**Assignee:** Backend Team  
**Estimated Time:** 5 hours  
**Priority:** 🟡 HIGH

**Description:**
Create service for product image optimization.

**Acceptance Criteria:**
- [ ] Create `imageOptimizer.js`
- [ ] Implement `optimizeImage()` function
- [ ] Resize to max dimensions
- [ ] Compress image
- [ ] Generate thumbnail
- [ ] Convert to WebP (optional)
- [ ] Return optimized image URLs and stats

---

#### Task BACKEND-030: Create Auto-Crop Service
**File:** `src/modules/vision/imageOptimizer.js` (EXTEND)  
**Assignee:** Backend Team  
**Estimated Time:** 4 hours  
**Priority:** 🟡 HIGH

**Description:**
Add auto-crop functionality with padding.

**Acceptance Criteria:**
- [ ] Implement `autoCrop()` function
- [ ] Calculate optimal crop bounds
- [ ] Add padding
- [ ] Support aspect ratios
- [ ] Return cropped image

---

#### Task BACKEND-031: Add Optimization API Endpoints
**File:** `src/routes/visionRoutes.js`  
**Assignee:** Backend Team  
**Estimated Time:** 2 hours  
**Priority:** 🟡 HIGH

**Description:**
Add API endpoints for image optimization and cropping.

**Acceptance Criteria:**
- [ ] Add `POST /api/vision/optimize-product-image` endpoint
- [ ] Add `POST /api/vision/auto-crop` endpoint
- [ ] Accept options
- [ ] Return results

---

#### Task BACKEND-032: Add Optimization Logging
**File:** `src/modules/vision/imageOptimizer.js`  
**Assignee:** Backend Team  
**Estimated Time:** 1 hour  
**Priority:** 🟢 MEDIUM

**Description:**
Add logging for optimization operations.

---

### Repository: `apps/dashboard/cardbey-marketing-dashboard` (Frontend)

#### Task FRONTEND-023: Create Crop Tools Panel Component
**File:** `src/features/contents-studio/components/CropToolsPanel.tsx` (NEW)  
**Assignee:** Frontend Team  
**Estimated Time:** 5 hours  
**Priority:** 🟡 HIGH

**Description:**
Create UI for cropping and optimization tools.

**Acceptance Criteria:**
- [ ] Create `CropToolsPanel.tsx`
- [ ] Add "Auto Crop" button
- [ ] Add padding slider
- [ ] Add aspect ratio selector
- [ ] Add crop preview
- [ ] Add "Apply Crop" button
- [ ] Add "Optimize Image" button
- [ ] Show before/after comparison

---

#### Task FRONTEND-024: Create Optimization Hook
**File:** `src/features/contents-studio/hooks/useImageOptimization.ts` (NEW)  
**Assignee:** Frontend Team  
**Estimated Time:** 2 hours  
**Priority:** 🟡 HIGH

**Description:**
Create React hook for image optimization API calls.

---

#### Task FRONTEND-025: Integrate Crop Tools into Content Studio
**File:** `src/features/contents-studio/components/SmartPropertiesPanel.tsx`  
**Assignee:** Frontend Team  
**Estimated Time:** 1 hour  
**Priority:** 🟡 HIGH

**Description:**
Add Crop Tools to Properties Panel or separate tab.

---

### Testing

#### Task TEST-010: Unit Tests for Image Optimizer
**File:** `tests/vision/imageOptimizer.test.js` (NEW)  
**Assignee:** QA/Backend Team  
**Estimated Time:** 3 hours  
**Priority:** 🟡 HIGH

**Description:**
Write unit tests for image optimization.

---

#### Task TEST-011: Integration Tests for Optimization APIs
**File:** `tests/vision/optimization.test.js` (NEW)  
**Assignee:** QA/Backend Team  
**Estimated Time:** 3 hours  
**Priority:** 🟡 HIGH

**Description:**
Write integration tests for optimization endpoints.

---

### Documentation

#### Task DOC-005: Document Optimization APIs
**File:** `docs/API.md`  
**Assignee:** Backend Team  
**Estimated Time:** 1 hour  
**Priority:** 🟢 MEDIUM

**Description:**
Document optimization and cropping APIs.

---

## 📊 Task Summary

### By Priority

| Priority | Count | Tasks |
|----------|-------|-------|
| 🔴 CRITICAL | 35 | Foundation and core features |
| 🟡 HIGH | 28 | Important enhancements |
| 🟢 MEDIUM | 12 | Nice-to-have features |

### By Repository

| Repository | Tasks | Estimated Hours |
|------------|-------|----------------|
| **cardbey-core** (Backend) | 32 | ~120 hours |
| **cardbey-marketing-dashboard** (Frontend) | 25 | ~90 hours |
| **Database** (Prisma) | 2 | ~3 hours |
| **Testing** | 11 | ~40 hours |
| **Documentation** | 5 | ~7 hours |
| **TOTAL** | **75** | **~260 hours** |

### By Phase

| Phase | Tasks | Estimated Hours | Timeline |
|-------|-------|----------------|---------|
| Phase 1: Foundation | 18 | ~60 hours | Weeks 1-2 |
| Phase 2: Background Editing | 14 | ~45 hours | Weeks 3-4 |
| Phase 3: Catalog Management | 23 | ~85 hours | Weeks 5-6 |
| Phase 4: Batch Processing | 10 | ~35 hours | Week 7 |
| Phase 5: Optimization | 10 | ~35 hours | Week 8 |

---

## 🚀 Getting Started

### Prerequisites

1. ✅ SAM-2 model downloaded (`models/sam2_hiera_large/sam2_hiera_large.pt`)
2. ✅ SAM-2 configured in `.env` (`SAM2_MODEL_PATH`, `SAM2_DEVICE`)
3. ✅ Backend running and SAM-2 status shows "✅ Ready"
4. ✅ Content Studio accessible

### Phase 1 Kickoff

**Start with these tasks:**

1. **BACKEND-001**: Extend SAM-3 Adapter for Product Segmentation
2. **BACKEND-002**: Create Product Segmenter Service
3. **BACKEND-003**: Create Product Segmentation API Endpoint
4. **FRONTEND-001**: Create Product Detection Panel Component
5. **FRONTEND-004**: Create Product Segmentation Hook

**Branch:** `feature/product-image-editing`

**First PR:** "Phase 1: Product Segmentation Foundation"

---

## 📝 Notes

- Tasks are ordered by dependency (do BACKEND tasks before FRONTEND tasks that depend on them)
- Testing tasks can be done in parallel with implementation
- Documentation tasks can be done at the end of each phase
- Some tasks may be combined if they're small
- Adjust estimates based on team velocity

---

**Last Updated:** Current Date  
**Status:** Ready for Assignment  
**Next Step:** Assign tasks to team members and start Phase 1



































