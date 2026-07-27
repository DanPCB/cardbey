# Frontend: Missing File UI Implementation Guide

## Overview

This document provides implementation instructions for the dashboard frontend to handle missing media files in playlists.

## API Response Format

The playlist endpoints return items with a `status` field:

```typescript
interface PlaylistItem {
  type: 'video' | 'image';
  url: string;
  mimeType?: string;
  durationS: number;
  muted: boolean;
  loop: boolean;
  fit: string;
  status?: 'OK' | 'MISSING_FILE'; // Added by backend
}
```

**Note:** Items with `status: 'MISSING_FILE'` are now filtered out from the playlist response by the backend. However, you may still need to handle this in the playlist editor where you fetch the full playlist with all items.

## Implementation Tasks

### 1. ScreenPreview Component

**Location:** Find the component that displays screen previews (likely `ScreenPreview.tsx` or similar)

**Current behavior:** The component shows "No playable items in playlist" when all items are missing.

**Required changes:**

```typescript
// Example implementation
interface PlaylistResponse {
  ok: boolean;
  screenId: string;
  playlistId: string | null;
  items: PlaylistItem[];
}

function ScreenPreview({ screenId }: { screenId: string }) {
  const [playlist, setPlaylist] = useState<PlaylistResponse | null>(null);
  const [missingFilesCount, setMissingFilesCount] = useState(0);
  
  useEffect(() => {
    fetchPlaylist(screenId).then(data => {
      setPlaylist(data);
      // Count missing files (if backend still returns them with status)
      const missing = data.items?.filter(item => item.status === 'MISSING_FILE').length || 0;
      setMissingFilesCount(missing);
    });
  }, [screenId]);
  
  const playableItems = playlist?.items?.filter(item => item.status !== 'MISSING_FILE') || [];
  
  if (playableItems.length === 0) {
    return (
      <div className="playlist-empty">
        <p>No playable items in playlist</p>
        {missingFilesCount > 0 && (
          <p className="error-hint">
            ⚠️ Some media files are no longer on the server. 
            Please re-upload or remove missing items from the playlist editor.
          </p>
        )}
      </div>
    );
  }
  
  // Render playable items...
}
```

### 2. Playlist Editor UI

**Location:** Find the playlist editor component (likely `PlaylistEditor.tsx` or similar)

**Required changes:**

#### A. Display Missing File Warnings

```typescript
function PlaylistEditor({ playlistId }: { playlistId: string }) {
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const missingItems = items.filter(item => item.status === 'MISSING_FILE');
  
  return (
    <div className="playlist-editor">
      {/* Warning banner for missing files */}
      {missingItems.length > 0 && (
        <div className="alert alert-warning">
          <strong>⚠️ {missingItems.length} missing file(s) detected</strong>
          <p>Some media files are no longer available on the server.</p>
          <button 
            onClick={handleRemoveMissingItems}
            className="btn btn-danger"
          >
            Remove all missing items from playlist
          </button>
        </div>
      )}
      
      {/* Playlist items list */}
      <div className="playlist-items">
        {items.map((item, index) => (
          <div key={item.id || index} className="playlist-item">
            {item.status === 'MISSING_FILE' && (
              <span className="badge badge-danger">File missing – re-upload or remove</span>
            )}
            {/* Item preview, controls, etc. */}
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### B. Remove Missing Items Function

```typescript
async function handleRemoveMissingItems() {
  const confirmed = window.confirm(
    `Remove ${missingItems.length} missing file(s) from this playlist?`
  );
  
  if (!confirmed) return;
  
  // Filter out missing items
  const updatedItems = items.filter(item => item.status !== 'MISSING_FILE');
  
  // Update playlist via API
  try {
    await updatePlaylist(playlistId, {
      items: updatedItems.map((item, index) => ({
        mediaId: item.mediaId, // You'll need to map from your item structure
        orderIndex: index,
        durationS: item.durationS,
        fit: item.fit,
        muted: item.muted,
        loop: item.loop,
      })),
    });
    
    setItems(updatedItems);
    // Show success message
  } catch (error) {
    console.error('Failed to remove missing items:', error);
    // Show error message
  }
}
```

### 3. API Endpoint for Full Playlist (with missing items)

**Note:** The current `/api/screens/:id/playlist/full` endpoint filters out missing files. For the playlist editor, you may need:

**Option A:** Use the existing playlist endpoint that returns all items:
```typescript
// GET /api/playlists/:id
// This should return all items including those with missingFile=true
const playlist = await fetch(`/api/playlists/${playlistId}`).then(r => r.json());
```

**Option B:** Add a query parameter to include missing items:
```typescript
// GET /api/screens/:id/playlist/full?includeMissing=true
const playlist = await fetch(
  `/api/screens/${screenId}/playlist/full?includeMissing=true`
).then(r => r.json());
```

### 4. Styling Recommendations

```css
/* Missing file badge */
.badge-danger {
  background-color: #dc3545;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  margin-left: 8px;
}

/* Warning alert */
.alert-warning {
  background-color: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 16px;
}

.alert-warning strong {
  color: #856404;
}

/* Error hint in empty playlist */
.error-hint {
  color: #dc3545;
  font-size: 14px;
  margin-top: 8px;
}
```

## Backend Logging

The backend now logs detailed information when missing files are detected:

```
[PLAYLIST] ⚠️ MISSING_FILE detected - Item marked as missing {
  screenId: '...',
  playlistId: '...',
  itemId: '...',
  assetId: '...',
  mediaId: '...',
  relativePath: '/uploads/...',
  exactFilePath: '/opt/render/project/src/uploads/...',
  fileChecked: true,
  fsCheckResult: 'NOT_FOUND'
}
```

Check Render logs to see which files are missing and their exact paths.

## Testing Checklist

- [ ] ScreenPreview shows helpful error message when all items are missing
- [ ] Playlist editor displays warning banner for missing files
- [ ] Missing items show red "File missing" badge
- [ ] "Remove all missing items" button works correctly
- [ ] Playlist updates correctly after removing missing items
- [ ] Error messages are user-friendly and actionable

## API Endpoints Reference

- `GET /api/screens/:id/playlist/full` - Returns playable items only (missing files filtered)
- `GET /api/playlists/:id` - Returns full playlist with all items (check if this includes missingFile flag)
- `PUT /api/playlists/:id` - Update playlist (remove items by not including them in the update)

