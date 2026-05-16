# Dashboard Repo Refactor Guide: Design Library Preview & Loading

## Summary

**Yes, you need to refactor code in the dashboard repo** to:
1. Display preview images using the new `thumbnailUrl` field
2. Fix the loading function to properly handle the API response structure

The backend (`cardbey-core`) has been updated and is ready. Now the frontend needs to consume these changes.

---

## Required Frontend Changes

### 1. Update TypeScript Interfaces

**File:** `src/api/contents.api.ts` (or similar API client file)

**Current issue:** The `ContentListItem` interface likely doesn't include `thumbnailUrl`.

**Fix:**
```typescript
export interface ContentListItem {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string | null; // ✅ ADD THIS - NEW field from backend
}

export interface Content {
  id: string;
  name: string;
  userId: string;
  elements: any[];
  settings: Record<string, any>;
  renderSlide: any | null;
  thumbnailUrl: string | null; // ✅ ADD THIS - NEW field from backend
  version: number;
  createdAt: string;
  updatedAt: string;
}
```

**Why:** The backend now returns `thumbnailUrl` in both list and detail responses, but TypeScript doesn't know about it yet.

---

### 2. Update Design Library Component to Display Thumbnails

**File:** `src/components/DesignLibrary/DesignCard.tsx` or similar

**Current issue:** Component always shows "No preview" placeholder because it doesn't check for `thumbnailUrl`.

**Fix:**
```typescript
interface DesignCardProps {
  content: ContentListItem;
  onLoad: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function DesignCard({ content, onLoad, onEdit, onDelete }: DesignCardProps) {
  const [imageError, setImageError] = useState(false);
  
  return (
    <div className="design-card">
      {/* Preview Image Section */}
      <div className="preview-container">
        {content.thumbnailUrl && !imageError ? (
          <img
            src={content.thumbnailUrl}
            alt={content.name}
            className="preview-image"
            onError={() => {
              console.warn(`[DesignCard] Failed to load thumbnail: ${content.thumbnailUrl}`);
              setImageError(true);
            }}
            loading="lazy"
          />
        ) : (
          <div className="no-preview">
            <ImageIcon />
            <span>No preview</span>
          </div>
        )}
      </div>

      {/* Design Info */}
      <div className="design-info">
        <h3>{content.name}</h3>
        <p>{new Date(content.updatedAt).toLocaleDateString()}</p>
      </div>

      {/* Actions */}
      <div className="design-actions">
        <button onClick={() => onLoad(content.id)}>Load</button>
        <button onClick={() => onEdit(content.id)}>Edit</button>
        <button onClick={() => onDelete(content.id)}>Delete</button>
      </div>
    </div>
  );
}
```

**Key changes:**
- ✅ Check if `content.thumbnailUrl` exists before rendering image
- ✅ Show thumbnail image if available
- ✅ Fallback to "No preview" placeholder if `thumbnailUrl` is `null` or image fails to load
- ✅ Handle image loading errors gracefully

---

### 3. Fix Loading Function Validation

**File:** `src/hooks/useContentStudio.ts` or similar loading logic

**Current issue:** The error "Design data is missing required" suggests the frontend is validating the response and failing.

**Fix:**
```typescript
/**
 * Load a single content by ID
 */
export async function loadContent(contentId: string): Promise<Content> {
  const res = await fetch(`${API_BASE_URL}/api/contents/${contentId}`, {
    headers: await getAuthHeaders(),
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Content not found');
    }
    throw new Error(`Failed to load content: ${res.status}`);
  }

  const response = await res.json();
  
  // Backend now ensures all fields are present with defaults
  // But we should still validate the response structure
  if (!response.ok || !response.data) {
    throw new Error('Invalid response format from server');
  }

  const content = response.data;
  
  // Ensure required fields exist (backend provides defaults, but double-check)
  const loadedContent: Content = {
    id: content.id || '',
    name: content.name || 'Untitled Design',
    userId: content.userId || '',
    elements: Array.isArray(content.elements) ? content.elements : [],
    settings: content.settings && typeof content.settings === 'object' ? content.settings : {},
    renderSlide: content.renderSlide || null,
    thumbnailUrl: content.thumbnailUrl || null, // ✅ Handle thumbnailUrl
    version: content.version || 1,
    createdAt: content.createdAt || new Date().toISOString(),
    updatedAt: content.updatedAt || new Date().toISOString(),
  };

  return loadedContent;
}
```

**Alternative:** Use the `hydrateCanvas` helper that already handles missing fields:
```typescript
import { hydrateCanvas } from '@/utils/contentStudio';

export async function loadContent(contentId: string): Promise<Content> {
  // ... fetch logic ...
  
  const response = await res.json();
  const content = response.data;
  
  // hydrateCanvas handles missing fields and JSON parsing
  const hydrated = hydrateCanvas(content);
  
  return {
    ...content,
    elements: hydrated.elements,
    settings: hydrated.settings,
    renderSlide: hydrated.renderSlide,
  };
}
```

---

### 4. Update Canvas Loading Logic

**File:** `src/components/ContentsStudio/ContentsCanvas.tsx` or similar

**Current issue:** When loading a design, the canvas might not populate correctly.

**Fix:**
```typescript
import { hydrateCanvas } from '@/utils/contentStudio';

function ContentsStudio() {
  const [canvasElements, setCanvasElements] = useState<any[]>([]);
  const [canvasSettings, setCanvasSettings] = useState<Record<string, any>>({});
  
  const handleLoadDesign = async (contentId: string) => {
    try {
      const content = await loadContent(contentId);
      
      // Use hydrateCanvas helper to safely convert to canvas state
      const hydrated = hydrateCanvas(content);
      
      // Set canvas state - these are guaranteed to be arrays/objects
      setCanvasElements(hydrated.elements);
      setCanvasSettings(hydrated.settings);
      
      // Navigate to editor with content ID
      navigate(`/contents?id=${contentId}`);
      
      toast.success('Design loaded successfully');
    } catch (error) {
      console.error('[ContentsStudio] Failed to load design:', error);
      toast.error('Failed to load design', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
  
  // ... rest of component
}
```

**Key points:**
- ✅ Use `hydrateCanvas()` helper to safely parse JSON and handle missing fields
- ✅ Always set elements and settings (never leave them undefined)
- ✅ Handle errors gracefully with user-friendly messages

---

## Checklist for Dashboard Repo

### TypeScript Interfaces
- [ ] Add `thumbnailUrl: string | null` to `ContentListItem` interface
- [ ] Add `thumbnailUrl: string | null` to `Content` interface
- [ ] Update any type definitions that reference content items

### Design Library Component
- [ ] Update `DesignCard` or similar component to display `thumbnailUrl`
- [ ] Add image error handling (fallback to placeholder on error)
- [ ] Test with designs that have thumbnails
- [ ] Test with designs that don't have thumbnails (should show "No preview")

### Loading Function
- [ ] Update `loadContent()` API function to handle `thumbnailUrl`
- [ ] Ensure validation doesn't fail on missing optional fields
- [ ] Use `hydrateCanvas()` helper for safe parsing
- [ ] Test loading designs with all field combinations

### Canvas Integration
- [ ] Ensure `hydrateCanvas()` is called when loading designs
- [ ] Verify elements and settings are set correctly after loading
- [ ] Test that canvas populates with loaded design data

### Error Handling
- [ ] Add proper error messages for failed loads
- [ ] Handle network errors gracefully
- [ ] Show user-friendly error toasts/notifications

---

## Testing Steps

1. **Preview Display:**
   ```bash
   # 1. Create/save a design (should generate thumbnailUrl)
   # 2. Check Design Library - should show thumbnail image
   # 3. Create a design without thumbnail - should show "No preview"
   ```

2. **Loading:**
   ```bash
   # 1. Click "Load" on a design card
   # 2. Verify design loads into canvas
   # 3. Check that all elements appear correctly
   # 4. Verify settings are applied
   ```

3. **Error Cases:**
   ```bash
   # 1. Try loading non-existent design (should show error)
   # 2. Try loading with network error (should handle gracefully)
   # 3. Try loading design with missing fields (should use defaults)
   ```

---

## Backend API Reference

### GET /api/contents (List)
```typescript
Response: {
  ok: true,
  data: Array<{
    id: string;
    name: string;
    version: number;
    createdAt: string;
    updatedAt: string;
    thumbnailUrl: string | null; // ✅ NEW - Always present
  }>
}
```

### GET /api/contents/:id (Load Single)
```typescript
Response: {
  ok: true,
  data: {
    id: string;
    name: string;
    userId: string;
    elements: any[]; // ✅ Always array (defaults to [])
    settings: object; // ✅ Always object (defaults to {})
    renderSlide: any | null; // ✅ Always present (defaults to null)
    thumbnailUrl: string | null; // ✅ Always present (defaults to null)
    version: number; // ✅ Always present (defaults to 1)
    createdAt: string;
    updatedAt: string;
  }
}
```

---

## Migration Notes

- **Backward Compatibility:** Old designs without `thumbnailUrl` will show "No preview" - this is expected
- **New Designs:** When saving, the frontend should include `thumbnailUrl` in the save payload if a thumbnail is available
- **Default Values:** The backend now provides defaults for all required fields, so frontend validation can be more lenient

---

## Files to Update (Estimate)

1. `src/api/contents.api.ts` - Update interfaces and API functions
2. `src/components/DesignLibrary/DesignCard.tsx` - Add thumbnail display
3. `src/hooks/useContentStudio.ts` - Update loading logic
4. `src/utils/contentStudio.ts` - Verify `hydrateCanvas` handles `thumbnailUrl`
5. `src/components/ContentsStudio/ContentsCanvas.tsx` - Update loading integration

**Total estimated changes:** 3-5 files, ~100-200 lines of code

---

## Questions?

If you encounter issues:
1. Check browser console for API response structure
2. Verify `thumbnailUrl` is in the API response
3. Ensure TypeScript interfaces match backend response
4. Test with network tab to see actual API calls

