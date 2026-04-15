# Product Cutout Frontend Integration Guide

## Overview

The SAM-3 `product_cutout` mode automatically removes backgrounds from product images and returns a transparent PNG cutout. The backend now **automatically updates the canvas** with the cutout, so no additional frontend configuration is required.

## Backend Response

When using `product_cutout` mode, the backend returns:

```typescript
{
  ok: true,
  taskId: string,
  result: {
    // Updated canvas with cutout image applied
    updatedCanvas?: CanvasState,
    
    // Cutout data (for reference or manual handling)
    cutoutUrl?: string,        // Data URL of transparent PNG cutout
    previewUrl?: string,       // Same as cutoutUrl
    mask?: unknown,            // SAM-3 mask data
    refinedBox?: {            // Tight bounding box of the product
      x: number,
      y: number,
      width: number,
      height: number
    },
    score?: number,            // SAM-3 confidence score (0-1)
    warning?: string           // Warning message if cutout failed
  }
}
```

## Automatic Canvas Update

The backend **automatically updates the canvas** with the cutout:

1. **Finds the image element** (from selection or first image in canvas)
2. **Updates the image source** with the cutout data URL:
   - `element.src = cutout.dataUrl`
   - `element.url = cutout.dataUrl`
   - `element.imageUrl = cutout.dataUrl`
3. **Updates element dimensions** with refined box (if available)
4. **Returns updated canvas** in `result.updatedCanvas`

## Frontend Usage

### Basic Usage (Recommended)

Simply apply the `updatedCanvas` to your canvas state:

```typescript
const response = await fetch('/api/orchestrator/design-task', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    entryPoint: 'content_studio',
    mode: 'product_cutout',
    target: 'image',
    canvasState: currentCanvasState,
    selection: selectedElements, // Optional: selected image element
    userPrompt: 'remove background around the cup in the image',
    // OR provide image directly:
    // imageUrl: 'https://example.com/product.jpg',
    // imageBuffer: base64EncodedImage
  })
});

const data = await response.json();

if (data.ok && data.result.updatedCanvas) {
  // Apply the updated canvas - the cutout is already applied!
  setCanvasState(data.result.updatedCanvas);
  
  // Optional: Show success message
  if (data.result.score) {
    console.log(`Cutout generated with score: ${data.result.score}`);
  }
} else if (data.result.warning) {
  // Handle warning (e.g., no high-quality mask found)
  showWarning(data.result.warning);
}
```

### Manual Handling (Advanced)

If you need to handle the cutout manually instead of using `updatedCanvas`:

```typescript
if (data.ok && data.result.cutoutUrl) {
  const cutoutDataUrl = data.result.cutoutUrl;
  
  // Option 1: Update selected element manually
  const selectedElement = getSelectedElement();
  if (selectedElement) {
    selectedElement.src = cutoutDataUrl;
    updateCanvas();
  }
  
  // Option 2: Create new element with cutout
  const newElement = {
    type: 'image',
    src: cutoutDataUrl,
    x: data.result.refinedBox?.x || 0,
    y: data.result.refinedBox?.y || 0,
    width: data.result.refinedBox?.width || 800,
    height: data.result.refinedBox?.height || 600,
  };
  addElementToCanvas(newElement);
}
```

## Auto-Detection

The backend **automatically switches to `product_cutout` mode** when it detects background removal keywords in the prompt:

- "remove background"
- "remove the background"
- "background removal"
- "cutout"
- "transparent background"
- "isolate"
- "extract"

So you can use any mode and the backend will auto-switch:

```typescript
// These all work and will auto-switch to product_cutout:
{
  mode: 'new_banner',  // or any mode
  userPrompt: 'remove background around the product'
}
```

## Image Input Options

You can provide the image in three ways:

1. **Canvas State** (Recommended): Include `canvasState` with an image element
2. **Image URL**: Provide `imageUrl` in the request body
3. **Image Buffer**: Provide `imageBuffer` (base64 encoded) in the request body

## Quality Threshold

The backend filters masks with **score > 0.85** for high-quality cutouts. If no mask meets this threshold:

- Returns `warning` message with best score found
- Returns original image in `cutoutUrl`
- Still returns `updatedCanvas` (unchanged)

## Example: Complete Integration

```typescript
async function removeBackground() {
  try {
    // Get current canvas state
    const canvasState = getCanvasState();
    const selection = getSelection();
    
    // Call SAM-3 product cutout
    const response = await fetch('/api/orchestrator/design-task', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        entryPoint: 'content_studio',
        mode: 'product_cutout', // or any mode - will auto-detect
        target: 'image',
        canvasState,
        selection,
        userPrompt: 'remove background around the cup in the image'
      })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      if (data.result.updatedCanvas) {
        // Apply updated canvas (cutout already applied!)
        setCanvasState(data.result.updatedCanvas);
        showSuccess('Background removed successfully!');
      } else if (data.result.warning) {
        showWarning(data.result.warning);
      }
    } else {
      showError(data.message || 'Failed to remove background');
    }
  } catch (error) {
    console.error('Background removal error:', error);
    showError('Failed to remove background');
  }
}
```

## Troubleshooting

### Cutout not appearing in UI

1. **Check `updatedCanvas`**: Ensure you're applying `data.result.updatedCanvas` to your canvas
2. **Check console logs**: Look for `[SAM3] Product cutout generated successfully` in backend logs
3. **Check score**: If score is low (< 0.85), the cutout may not be generated

### Low quality cutouts

- The backend uses score threshold of 0.85
- Check `data.result.score` - if it's low, the product may be hard to detect
- Try adjusting the prompt to be more specific about the product

### Canvas not updating

- Ensure you're using `data.result.updatedCanvas` (not `data.result.cutoutUrl` directly)
- Check that your canvas state management supports the format returned
- Verify the image element exists in the canvas state












