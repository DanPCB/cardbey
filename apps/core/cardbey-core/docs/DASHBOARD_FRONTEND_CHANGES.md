# Dashboard Frontend Changes Required

## Summary
After backend fixes to support preview images and proper loading, the dashboard frontend needs minor updates to utilize these improvements.

## Required Changes

### 1. Update `ContentListItem` TypeScript Interface

**Location:** `src/api/contents.api.ts` (or similar API client file)

**Current (from docs):**
```typescript
export interface ContentListItem {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
```

**Update to:**
```typescript
export interface ContentListItem {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string | null; // NEW: Added for preview images
}
```

**Why:** The backend now returns `thumbnailUrl` in the list response, but the TypeScript interface doesn't include it.

---

### 2. Update Design Library Component to Display Thumbnails

**Location:** `src/components/DesignLibrary.tsx` or similar component that renders the design cards

**Current:** Cards likely show a placeholder or "No preview" for all designs.

**Update to:** Use `thumbnailUrl` from the API response to display actual preview images.

**Example Implementation:**
```tsx
// In your design card component
function DesignCard({ content }: { content: ContentListItem }) {
  return (
    <div className="design-card">
      {/* Preview Image */}
      <div className="preview-container">
        {content.thumbnailUrl ? (
          <img
            src={content.thumbnailUrl}
            alt={content.name}
            className="design-preview"
            onError={(e) => {
              // Fallback to placeholder if image fails to load
              e.currentTarget.src = '/placeholder-no-preview.png';
              e.currentTarget.style.display = 'none';
              // Show placeholder icon
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        {/* Placeholder shown when no thumbnailUrl or image fails */}
        <div className={`no-preview ${content.thumbnailUrl ? 'hidden' : ''}`}>
          <svg>...</svg> {/* Your placeholder icon */}
          <span>No preview</span>
        </div>
      </div>
      
      {/* Rest of card content */}
      <h3>{content.name}</h3>
      <div className="card-actions">
        <button onClick={() => handleLoad(content.id)}>Load</button>
        {/* ... other buttons */}
      </div>
    </div>
  );
}
```

**CSS Example:**
```css
.preview-container {
  position: relative;
  width: 100%;
  aspect-ratio: 9/16; /* Or your design aspect ratio */
  background: #f0f0f0;
  overflow: hidden;
}

.design-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #999;
}

.no-preview.hidden {
  display: none;
}
```

---

### 3. Verify Load Function Handles All Required Fields

**Location:** `src/hooks/useContentStudio.ts` or the component that handles loading designs

**Current:** May validate for missing fields and throw errors.

**Update:** The backend now ensures all required fields are present, but the frontend should still handle gracefully.

**Check:**
1. The `loadContent()` function properly handles the response
2. The `hydrateCanvas()` helper is called to convert API response to canvas state
3. Error handling doesn't reject valid responses

**Example:**
```typescript
const loadDesign = async (id: string) => {
  try {
    const loaded = await loadContent(id);
    
    // Backend now ensures these are always present:
    // - elements (array)
    // - settings (object)
    // - renderSlide (null or object)
    // - version (number)
    // - name (string)
    
    const hydrated = hydrateCanvas(loaded);
    
    // Set canvas state
    setCanvasElements(hydrated.elements || []);
    setCanvasSettings(hydrated.settings || {});
    
    return hydrated;
  } catch (error) {
    console.error('Failed to load design:', error);
    toast.error('Failed to load design');
    throw error;
  }
};
```

---

### 4. Update `Content` Interface (if needed)

**Location:** `src/api/contents.api.ts`

**Ensure it includes:**
```typescript
export interface Content {
  id: string;
  name: string;
  userId: string;
  elements: any[]; // Always array
  settings: Record<string, any>; // Always object
  renderSlide: any | null; // Always present (null or object)
  thumbnailUrl: string | null; // Always present (null or string)
  version: number; // Always present
  createdAt: string;
  updatedAt: string;
}
```

**Note:** Backend now guarantees these fields are always present, so TypeScript can reflect that (no optional `?` needed for required fields).

---

## Files to Update (Dashboard Repo)

1. **`src/api/contents.api.ts`** (or similar)
   - Add `thumbnailUrl` to `ContentListItem` interface
   - Verify `Content` interface is complete

2. **`src/components/DesignLibrary.tsx`** (or similar)
   - Update design card component to display `thumbnailUrl`
   - Add fallback to placeholder when `thumbnailUrl` is null
   - Add error handling for failed image loads

3. **`src/hooks/useContentStudio.ts`** (or similar)
   - Verify load function handles all fields correctly
   - Ensure error handling is appropriate

4. **CSS/Styles** (wherever design library styles are)
   - Add styles for preview images
   - Style placeholder state

---

## Testing Checklist

After making changes:

- [ ] Design library shows thumbnails for designs that have `thumbnailUrl`
- [ ] Design library shows "No preview" placeholder for designs without `thumbnailUrl`
- [ ] Clicking "Load" button successfully loads the design into the canvas
- [ ] No "Design data is missing required" errors when loading
- [ ] TypeScript compilation passes without errors
- [ ] Preview images load correctly (or fallback gracefully if they fail)

---

## Backward Compatibility

✅ **These changes are backward compatible:**
- The backend now returns `thumbnailUrl` in list responses (was missing before)
- The backend now ensures all required fields are present in GET responses
- Frontend should handle `thumbnailUrl` being `null` gracefully
- Old designs without thumbnails will still show "No preview"

---

## Priority

**High Priority:**
1. Update `ContentListItem` interface to include `thumbnailUrl` ⚠️
2. Update design card component to display thumbnails ⚠️

**Medium Priority:**
3. Verify load function handles all fields correctly
4. Add proper error handling for image loading

**Low Priority:**
5. Improve placeholder styling
6. Add loading states for images

