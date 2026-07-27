# Content Studio to Playlist Publishing

## Problem

When trying to publish Content Studio designs to playlists, the frontend receives this error:

```
Validation failed: items.0.mediaId is required
```

## Root Cause

**Content Studio designs** (stored in `Content` model with canvas elements) are different from **Media** (uploaded video/image files).

- **Content Model**: Stores canvas designs with JSON elements (`elements`, `settings`, `renderSlide`)
- **Media Model**: Stores uploaded video/image files
- **PlaylistItem**: Requires a `mediaId` (references `Media`, not `Content`)

## Current Flow (What's Happening)

1. User creates a design in Content Studio → Saved as `Content` record
2. User tries to "Publish to Playlist" → Frontend sends `Content` data
3. Backend rejects it → Missing `mediaId` field
4. Error: "Validation failed: items.0.mediaId is required"

## Solutions

### Option 1: Export & Upload Flow (Current Requirement)

The frontend needs to:

1. **Export the Content design** as an image/video:
   ```typescript
   // Export canvas as image/video
   const exportedFile = await exportCanvasAsImage(content);
   // or
   const exportedFile = await exportCanvasAsVideo(content);
   ```

2. **Upload as Media**:
   ```typescript
   const media = await uploadMedia(exportedFile);
   // Returns: { id: "media-id-123", url: "...", ... }
   ```

3. **Create playlist with Media ID**:
   ```typescript
   await createPlaylist({
     name: 'My Playlist',
     items: [{
       mediaId: media.id, // ✅ Use Media ID
       durationS: 8,
       orderIndex: 0,
       fit: 'cover',
       muted: false,
       loop: false,
     }],
   });
   ```

### Option 2: Auto-Convert Endpoint (Recommended)

Create a new backend endpoint that automatically converts Content to Media:

#### Backend: `POST /api/playlists/from-content`

```javascript
// src/routes/playlists.js

router.post('/from-content', async (req, res) => {
  try {
    const { contentId, name, durationS = 8 } = req.body;
    
    // 1. Load Content
    const content = await prisma.content.findUnique({
      where: { id: contentId },
    });
    
    if (!content) {
      return res.status(404).json({
        ok: false,
        error: { message: 'Content not found' }
      });
    }
    
    // 2. Render Content to image/video
    // (Use canvas rendering library or existing renderSlide)
    const renderedUrl = await renderContentToMedia(content);
    
    // 3. Create Media record
    const media = await prisma.media.create({
      data: {
        url: renderedUrl,
        kind: 'IMAGE', // or 'VIDEO'
        mime: 'image/png', // or 'video/mp4'
        sizeBytes: 0, // Calculate from file
        // ... other fields
      },
    });
    
    // 4. Create Playlist with Media
    const playlist = await prisma.playlist.create({
      data: {
        name: name || `Playlist from ${content.name}`,
        items: {
          create: {
            mediaId: media.id,
            orderIndex: 0,
            durationS,
            fit: 'cover',
            muted: false,
            loop: false,
          },
        },
      },
      include: {
        items: {
          include: { media: true },
        },
      },
    });
    
    res.status(201).json({ ok: true, data: playlist });
  } catch (e) {
    console.error('[PLAYLISTS] POST /from-content error:', e);
    res.status(500).json({
      ok: false,
      error: 'Failed to create playlist from content',
      message: process.env.NODE_ENV === 'development' ? e.message : undefined,
    });
  }
});
```

#### Frontend Usage

```typescript
// In PublishToPlaylistModal
const handlePublish = async () => {
  try {
    const response = await fetch('/api/playlists/from-content', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        contentId: content.id,
        name: playlistName,
        durationS: 8,
      }),
    });
    
    const result = await response.json();
    if (result.ok) {
      toast.success('Playlist created successfully!');
    }
  } catch (error) {
    toast.error('Failed to create playlist');
  }
};
```

### Option 3: Update Frontend to Export First

If Option 2 is not implemented, update the frontend `PublishToPlaylistModal`:

```typescript
// PublishToPlaylistModal.tsx

const handlePublish = async () => {
  try {
    // Step 1: Export Content as image
    const canvas = /* get canvas element */;
    const dataUrl = canvas.toDataURL('image/png');
    
    // Step 2: Convert to File
    const blob = await fetch(dataUrl).then(r => r.blob());
    const file = new File([blob], `${content.name}.png`, { type: 'image/png' });
    
    // Step 3: Upload as Media
    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', 'IMAGE');
    
    const uploadResponse = await fetch('/api/uploads/create', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    
    const uploadResult = await uploadResponse.json();
    if (!uploadResult.ok) {
      throw new Error('Failed to upload media');
    }
    
    const mediaId = uploadResult.data.id;
    
    // Step 4: Create Playlist with Media ID
    const playlistResponse = await fetch('/api/playlists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: playlistName,
        items: [{
          mediaId: mediaId, // ✅ Now we have Media ID
          durationS: 8,
          orderIndex: 0,
          fit: 'cover',
          muted: false,
          loop: false,
        }],
      }),
    });
    
    const playlistResult = await playlistResponse.json();
    if (playlistResult.ok) {
      toast.success('Playlist created successfully!');
    }
  } catch (error) {
    console.error('Publish error:', error);
    toast.error('Failed to publish to playlist');
  }
};
```

## Recommended Approach

**Option 2 (Auto-Convert Endpoint)** is the cleanest solution because:
- ✅ Simplifies frontend code
- ✅ Handles all conversion logic in one place
- ✅ Can optimize rendering/export settings
- ✅ Better error handling

**Option 3 (Frontend Export)** works but:
- ❌ More complex frontend code
- ❌ Duplicates export logic
- ❌ Requires managing file uploads in UI

## Current Status

The backend now provides a helpful error message when Content Studio designs are detected:

```
"hint": "It looks like you're trying to publish Content Studio designs. Content designs (canvas elements) cannot be added directly to playlists. You need to:
1. Export/render your Content Studio design as an image or video
2. Upload it as Media using the upload endpoint  
3. Use the returned Media ID when creating the playlist

Alternatively, create an endpoint that automatically converts Content to Media when publishing."
```

## Next Steps

1. **Short-term**: Update frontend to export Content before publishing (Option 3)
2. **Long-term**: Implement auto-convert endpoint (Option 2)



