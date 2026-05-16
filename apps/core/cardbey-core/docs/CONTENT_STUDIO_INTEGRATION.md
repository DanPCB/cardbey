# Content Studio Integration Guide

This guide explains how to integrate the Content Studio with the `/api/contents` CRUD endpoints.

## Backend API Endpoints

All endpoints require authentication via `Authorization: Bearer <token>` header.

### Base URL
```
/api/contents
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/contents` | List all contents for authenticated user |
| GET | `/api/contents/:id` | Get single content by ID |
| POST | `/api/contents` | Create new content |
| PUT | `/api/contents/:id` | Update existing content |
| DELETE | `/api/contents/:id` | Delete content |

### Request/Response Shapes

#### GET /api/contents (List)
**Response:**
```json
{
  "ok": true,
  "data": [
    {
      "id": "clx...",
      "name": "My Design",
      "version": 1,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### GET /api/contents/:id (Single)
**Response:**
```json
{
  "ok": true,
  "data": {
    "id": "clx...",
    "name": "My Design",
    "userId": "user123",
    "elements": [...],
    "settings": { "width": 1080, "height": 1920 },
    "renderSlide": null,
    "version": 1,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### POST /api/contents (Create)
**Request:**
```json
{
  "name": "My Design",
  "elements": [...],
  "settings": { "width": 1080, "height": 1920 },
  "renderSlide": null
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "id": "clx...",
    "name": "My Design",
    "elements": [...],
    "settings": {...},
    "version": 1,
    ...
  }
}
```

#### PUT /api/contents/:id (Update)
**Request:**
```json
{
  "name": "Updated Name",
  "elements": [...],
  "settings": {...},
  "renderSlide": {...},
  "version": 1  // Current version for optimistic locking
}
```

**Response:**
```json
{
  "ok": true,
  "data": {
    "id": "clx...",
    "name": "Updated Name",
    "version": 2,  // Incremented
    ...
  }
}
```

**Error (Version Conflict):**
```json
{
  "ok": false,
  "error": "version_conflict",
  "message": "Content was modified by another request. Please reload and try again.",
  "currentVersion": 2
}
```

#### DELETE /api/contents/:id
**Response:**
```json
{
  "ok": true,
  "message": "Content deleted successfully"
}
```

---

## Frontend Implementation

### 1. API Client Functions

Create `src/api/contents.api.ts`:

```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function getAuthHeaders() {
  const token = localStorage.getItem('auth_token') || 'dev-admin-token';
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

export interface Content {
  id: string;
  name: string;
  userId: string;
  elements: any[];
  settings: Record<string, any>;
  renderSlide: any | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContentListItem {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl: string | null; // URL to preview thumbnail (optional)
}

/**
 * List all contents for the current user
 */
export async function listContents(): Promise<ContentListItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/contents`, {
    headers: await getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to list contents: ${res.status}`);
  }

  const data = await res.json();
  return data.data || [];
}

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

  const data = await res.json();
  return data.data;
}

/**
 * Create a new content
 */
export async function createContent(content: {
  name: string;
  elements: any[];
  settings: Record<string, any>;
  renderSlide?: any;
}): Promise<Content> {
  const res = await fetch(`${API_BASE_URL}/api/contents`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(content),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || `Failed to create content: ${res.status}`);
  }

  const data = await res.json();
  return data.data;
}

/**
 * Update an existing content
 */
export async function updateContent(
  contentId: string,
  updates: {
    name?: string;
    elements?: any[];
    settings?: Record<string, any>;
    renderSlide?: any;
    version: number; // Required for optimistic locking
  }
): Promise<Content> {
  const res = await fetch(`${API_BASE_URL}/api/contents/${contentId}`, {
    method: 'PUT',
    headers: await getAuthHeaders(),
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const error = await res.json();
    
    // Handle version conflict
    if (res.status === 409) {
      throw new Error('VERSION_CONFLICT');
    }
    
    throw new Error(error.message || `Failed to update content: ${res.status}`);
  }

  const data = await res.json();
  return data.data;
}

/**
 * Delete a content
 */
export async function deleteContent(contentId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/contents/${contentId}`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to delete content: ${res.status}`);
  }
}
```

### 2. Canvas Helper Functions

Create `src/utils/contentStudio.ts`:

```typescript
/**
 * Serialize canvas state to Content model format
 */
export function serializeCanvas(canvasState: {
  elements: any[];
  settings: Record<string, any>;
  renderSlide?: any;
}) {
  const { elements = [], settings = {}, renderSlide = null } = canvasState;

  return {
    elements: Array.isArray(elements) ? elements : [],
    settings: typeof settings === 'object' && settings !== null ? settings : {},
    renderSlide: renderSlide || null,
  };
}

/**
 * Hydrate canvas from Content model data
 */
export function hydrateCanvas(content: {
  elements: any;
  settings: any;
  renderSlide?: any;
  version?: number;
  id?: string;
  name?: string;
}) {
  if (!content) {
    return {
      elements: [],
      settings: {},
      renderSlide: null,
    };
  }

  // Parse JSON fields if they're strings
  let elements = content.elements;
  let settings = content.settings;
  let renderSlide = content.renderSlide || null;

  if (typeof elements === 'string') {
    try {
      elements = JSON.parse(elements);
    } catch (e) {
      console.warn('[ContentStudio] Failed to parse elements:', e);
      elements = [];
    }
  }

  if (typeof settings === 'string') {
    try {
      settings = JSON.parse(settings);
    } catch (e) {
      console.warn('[ContentStudio] Failed to parse settings:', e);
      settings = {};
    }
  }

  if (typeof renderSlide === 'string') {
    try {
      renderSlide = JSON.parse(renderSlide);
    } catch (e) {
      console.warn('[ContentStudio] Failed to parse renderSlide:', e);
      renderSlide = null;
    }
  }

  return {
    elements: Array.isArray(elements) ? elements : [],
    settings: typeof settings === 'object' && settings !== null ? settings : {},
    renderSlide: renderSlide,
    version: content.version || 1,
    contentId: content.id,
    contentName: content.name,
  };
}
```

### 3. Content Studio Hook

Create `src/hooks/useContentStudio.ts`:

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadContent,
  createContent,
  updateContent,
  type Content,
} from '@/api/contents.api';
import { serializeCanvas, hydrateCanvas } from '@/utils/contentStudio';
import { toast } from 'sonner'; // or your toast library

interface UseContentStudioOptions {
  contentId?: string | null; // From URL query param
  onLoaded?: (content: Content) => void;
}

export function useContentStudio(options: UseContentStudioOptions = {}) {
  const { contentId, onLoaded } = options;
  
  const [content, setContent] = useState<Content | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Track current version for optimistic locking
  const currentVersionRef = useRef<number>(1);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Load design from API
   */
  const loadDesign = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const loaded = await loadContent(id);
      setContent(loaded);
      currentVersionRef.current = loaded.version;
      
      // Hydrate canvas state
      const hydrated = hydrateCanvas(loaded);
      
      if (onLoaded) {
        onLoaded(loaded);
      }
      
      return hydrated;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load design');
      setError(error);
      toast.error('Failed to load design', {
        description: error.message,
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [onLoaded]);

  /**
   * Save design (create or update)
   */
  const saveDesign = useCallback(async (canvasState: {
    elements: any[];
    settings: Record<string, any>;
    renderSlide?: any;
  }, name: string) => {
    setIsSaving(true);
    setError(null);
    
    try {
      const serialized = serializeCanvas(canvasState);
      
      let saved: Content;
      
      if (content?.id) {
        // Update existing
        saved = await updateContent(content.id, {
          ...serialized,
          name,
          version: currentVersionRef.current,
        });
      } else {
        // Create new
        saved = await createContent({
          ...serialized,
          name,
        });
        setContent(saved);
      }
      
      currentVersionRef.current = saved.version;
      setContent(saved);
      
      toast.success('Design saved successfully');
      
      return saved;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to save design');
      
      // Handle version conflict
      if (error.message === 'VERSION_CONFLICT') {
        toast.error('Version conflict', {
          description: 'This design was modified elsewhere. Please reload and try again.',
        });
        // Optionally reload the design
        if (content?.id) {
          await loadDesign(content.id);
        }
      } else {
        setError(error);
        toast.error('Failed to save design', {
          description: error.message,
        });
      }
      
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [content, loadDesign]);

  /**
   * Auto-save with debounce
   */
  const autoSave = useCallback((canvasState: {
    elements: any[];
    settings: Record<string, any>;
    renderSlide?: any;
  }, name: string) => {
    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set new timeout (2 seconds debounce)
    saveTimeoutRef.current = setTimeout(() => {
      saveDesign(canvasState, name).catch(console.error);
    }, 2000);
  }, [saveDesign]);

  // Load content on mount if contentId provided
  useEffect(() => {
    if (contentId) {
      loadDesign(contentId).catch(console.error);
    }
  }, [contentId, loadDesign]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    content,
    isLoading,
    isSaving,
    error,
    loadDesign,
    saveDesign,
    autoSave,
    version: currentVersionRef.current,
  };
}
```

### 4. Usage in Content Studio Component

Example usage in your `ContentsStudio.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useContentStudio } from '@/hooks/useContentStudio';
import { ContentsCanvas } from '@/components/Canvas/ContentsCanvas';
import { toast } from 'sonner';

export function ContentsStudio() {
  const [searchParams] = useSearchParams();
  const contentId = searchParams.get('id');
  
  const {
    content,
    isLoading,
    isSaving,
    loadDesign,
    saveDesign,
    autoSave,
  } = useContentStudio({
    contentId,
    onLoaded: (loadedContent) => {
      // Update canvas state with loaded design
      const hydrated = hydrateCanvas(loadedContent);
      // Set your canvas state here
      setCanvasElements(hydrated.elements);
      setCanvasSettings(hydrated.settings);
    },
  });

  const [canvasElements, setCanvasElements] = useState<any[]>([]);
  const [canvasSettings, setCanvasSettings] = useState<Record<string, any>>({});
  const [designName, setDesignName] = useState(content?.name || 'Untitled Design');

  // Update name when content loads
  useEffect(() => {
    if (content?.name) {
      setDesignName(content.name);
    }
  }, [content]);

  // Handle manual save
  const handleSave = async () => {
    try {
      await saveDesign({
        elements: canvasElements,
        settings: canvasSettings,
      }, designName);
    } catch (error) {
      // Error already handled in hook
    }
  };

  // Handle canvas changes (auto-save)
  const handleCanvasChange = (elements: any[], settings: Record<string, any>) => {
    setCanvasElements(elements);
    setCanvasSettings(settings);
    
    // Auto-save after 2 seconds of inactivity
    autoSave({ elements, settings }, designName);
  };

  if (isLoading) {
    return <div>Loading design...</div>;
  }

  return (
    <div>
      <input
        type="text"
        value={designName}
        onChange={(e) => setDesignName(e.target.value)}
        placeholder="Design name"
      />
      
      <button onClick={handleSave} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save'}
      </button>

      <ContentsCanvas
        elements={canvasElements}
        settings={canvasSettings}
        onElementsChange={(elements) => handleCanvasChange(elements, canvasSettings)}
        onSettingsChange={(settings) => handleCanvasChange(canvasElements, settings)}
      />
    </div>
  );
}
```

### 5. URL-based Loading

To load a design from URL query parameter (`?id=contentId`):

```typescript
// In your route or component
const [searchParams] = useSearchParams();
const contentId = searchParams.get('id');

// Use in useContentStudio hook
const { loadDesign } = useContentStudio({ contentId });

// Or load manually
useEffect(() => {
  if (contentId) {
    loadDesign(contentId).then((hydrated) => {
      // Update canvas with hydrated state
      setCanvasElements(hydrated.elements);
      setCanvasSettings(hydrated.settings);
    });
  }
}, [contentId]);
```

---

## Error Handling

### Version Conflicts

If two users edit the same content simultaneously, the second save will return a `409 Conflict` error:

```typescript
try {
  await saveDesign(canvasState, name);
} catch (error) {
  if (error.message === 'VERSION_CONFLICT') {
    // Reload the latest version
    await loadDesign(contentId);
    toast.warning('Content was modified. Reloaded latest version.');
  }
}
```

### Network Errors

Always wrap API calls in try-catch:

```typescript
try {
  await loadDesign(contentId);
} catch (error) {
  // Show user-friendly error
  toast.error('Failed to load design', {
    description: error.message,
  });
}
```

---

## Best Practices

1. **Debounce Auto-save**: Use auto-save with debounce (2-3 seconds) to avoid excessive API calls
2. **Optimistic Locking**: Always send the current version when updating to prevent conflicts
3. **Error Recovery**: Handle version conflicts by reloading the latest content
4. **Loading States**: Show loading indicators during save/load operations
5. **Toast Notifications**: Provide user feedback on success/failure

---

## Testing

### Manual Testing Checklist

- [ ] Create new design → saves successfully
- [ ] Update existing design → saves successfully  
- [ ] Load design from URL (`?id=...`) → loads correctly
- [ ] Version conflict → shows error and reloads
- [ ] Network error → shows error message
- [ ] Auto-save works with debounce
- [ ] Manual save works immediately

---

## Migration Notes

If you have existing Content Studio code:

1. Replace any existing save/load functions with the new API functions
2. Update canvas state serialization to match the Content model format
3. Add version tracking for optimistic locking
4. Add error handling for version conflicts
5. Implement auto-save with debounce


