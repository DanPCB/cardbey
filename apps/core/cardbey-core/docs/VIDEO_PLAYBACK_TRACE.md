# Video Playback Issue Trace

## Problem Summary

Videos are uploaded successfully, but they don't play. The error indicates:
1. **Corrupted video file**: The uploaded file is only 5 bytes (should be much larger)
2. **Missing playlist assignment**: Videos are not automatically added to playlists
3. **Screen has no playlist**: The screen doesn't have a playlist assigned

## Important Note: Grid Overlay

**The grid layer you see is NOT the problem!** 
- The grid is just a UI overlay in the Content Studio canvas for design/editing purposes
- It's a visual guide and doesn't affect video playback
- Video playback happens on the actual screen/player, not in the Content Studio canvas
- The grid is completely separate from the backend video playback system

## Flow Analysis

### Current Flow (What Happens Now)

1. **Video Upload** ✅
   - POST `/api/uploads/create`
   - Creates `Media` record in database
   - Saves file to local storage (`/uploads/media/...`)
   - Returns: `{ ok: true, data: { id, url, ... } }`

2. **Playlist Assignment** ❌ **MISSING**
   - Video is NOT automatically added to any playlist
   - Screen does NOT get a playlist assigned
   - Result: Screen has `assignedPlaylistId: null`

3. **Playlist Retrieval** ❌ **RETURNS EMPTY**
   - GET `/api/screens/:id/playlist/full`
   - Checks for `screen.assignedPlaylistId`
   - Finds: `null` (no playlist assigned)
   - Returns: `{ items: [] }` (empty playlist)

4. **Video Playback** ❌ **NO CONTENT TO PLAY**
   - Player requests playlist
   - Gets empty array
   - Shows "No playlist assigned" message

### Expected Flow (What Should Happen)

1. **Video Upload** ✅
   - POST `/api/uploads/create`
   - Creates `Media` record
   - Returns media ID

2. **Auto-Create Playlist** (if needed)
   - If no playlist exists for the screen/user
   - Create a new playlist
   - Add the uploaded video as a PlaylistItem

3. **Assign Playlist to Screen**
   - Set `screen.assignedPlaylistId = playlist.id`
   - OR automatically assign when first item is added

4. **Playlist Retrieval** ✅
   - GET `/api/screens/:id/playlist/full`
   - Returns items with the uploaded video

## Root Causes

### Issue 1: Corrupted Video File ⚠️ **CRITICAL**

**Evidence:**
```
[INFO] [UPLOAD] Base64 decoded successfully {"originalLength":7,"decodedSize":5,"mimeType":"video/mp4"}
[INFO] [UPLOAD] Local storage upload succeeded {"size":5}
```

**Problem:**
- Video file is only **5 bytes** (should be MBs for a real video)
- Base64 input is only **7 characters** (should be thousands)
- File cannot be decoded: `Cannot parse metadata`

**Root Cause:**
- Frontend is sending truncated/invalid base64 data
- Possibly sending a placeholder or metadata only
- Not sending the actual video file bytes

**Fix Needed:**
- Frontend must send the full video file as base64
- Backend should validate file size (reject files < 1KB)
- Backend should validate video format after decoding

### Issue 2: No Automatic Playlist Assignment ⚠️ **MAJOR**

**Evidence:**
```
[PLAYLIST] Screen has playlist: false
[PLAYLIST] Playlist ID: none
[PLAYLIST] Total playlist items: 0
```

**Problem:**
- Upload endpoint creates Media record but stops there
- No playlist is created or updated
- No screen assignment happens

**Current Behavior:**
```javascript
// src/routes/upload.js - handleJsonUpload()
const media = await prisma.media.create({ ... });
// ❌ STOPS HERE - No playlist creation/assignment
return res.json({ ok: true, data: { id: media.id, ... } });
```

**Expected Behavior:**
```javascript
// After creating media:
1. Find or create a playlist for the user/screen
2. Add media to playlist: await prisma.playlistItem.create({ ... })
3. Assign playlist to screen: await prisma.screen.update({ assignedPlaylistId: ... })
```

## Solution Plan

### Fix 1: Validate Uploaded File Size & Format

**Location:** `src/routes/upload.js`

**Changes:**
```javascript
// After decoding base64
if (buffer.length < 1024) { // Less than 1KB
  return res.status(400).json({
    ok: false,
    error: 'file_too_small',
    message: 'Uploaded file is too small. Please ensure you are uploading the actual video file.',
    receivedSize: buffer.length,
  });
}

// For videos, validate file format after saving
if (fileKind === 'VIDEO') {
  // Try to parse video metadata - if it fails, file is corrupted
  const tempFilePath = createTempPath(...);
  await fs.promises.writeFile(tempFilePath, buffer);
  
  try {
    const ffmpegInstance = await initializeFfmpeg();
    await new Promise((resolve, reject) => {
      ffmpegInstance.ffprobe(tempFilePath, (err, data) => {
        if (err || !data?.streams?.length) {
          reject(new Error('Invalid video file - cannot parse metadata'));
        }
        resolve();
      });
    });
  } catch (err) {
    await safeUnlink(tempFilePath);
    return res.status(400).json({
      ok: false,
      error: 'invalid_video',
      message: 'Uploaded file is not a valid video file: ' + err.message,
    });
  }
  await safeUnlink(tempFilePath);
}
```

### Fix 2: Auto-Create Playlist and Assign to Screen

**Option A: Add to Existing Playlist**
- Check if screen has assigned playlist
- If yes, add video to that playlist
- If no, create new playlist and assign

**Option B: Create Playlist Per Upload**
- Always create a new playlist with the uploaded video
- Assign it to the screen
- Replace any existing playlist

**Implementation:**
```javascript
// After creating media record:
// 1. Get or create playlist for this screen
let playlist = await prisma.playlist.findFirst({
  where: {
    screens: {
      some: {
        id: screenId, // Need to get screenId from request
      }
    }
  },
  include: { items: true },
});

if (!playlist) {
  // Create new playlist
  playlist = await prisma.playlist.create({
    data: {
      name: `Auto Playlist ${new Date().toLocaleDateString()}`,
      screens: {
        connect: { id: screenId },
      },
      items: {
        create: {
          orderIndex: 0,
          durationS: 8,
          fit: 'cover',
          muted: false,
          loop: false,
          mediaId: media.id,
        },
      },
    },
  });
} else {
  // Add to existing playlist
  await prisma.playlistItem.create({
    data: {
      playlistId: playlist.id,
      orderIndex: playlist.items.length,
      durationS: 8,
      fit: 'cover',
      muted: false,
      loop: false,
      mediaId: media.id,
    },
  });
}

// 2. Ensure screen has playlist assigned
await prisma.screen.update({
  where: { id: screenId },
  data: { assignedPlaylistId: playlist.id },
});
```

### Fix 3: Add Screen ID to Upload Request

**Problem:** Upload endpoint doesn't know which screen to assign to

**Solution:** Accept `screenId` in upload request
```javascript
// In handleJsonUpload:
const { userId, mime, bytes, kind, filename, screenId } = req.body;

// Validate screenId exists
if (screenId) {
  const screen = await prisma.screen.findUnique({
    where: { id: screenId },
  });
  
  if (!screen) {
    return res.status(400).json({
      ok: false,
      error: 'screen_not_found',
      message: `Screen ${screenId} does not exist`,
    });
  }
}
```

## Immediate Issues to Fix

### Priority 1: File Size Validation ⚠️ **CRITICAL**
- Reject files < 1KB immediately
- Log warning about invalid uploads
- Return clear error message to frontend

### Priority 2: Video Format Validation ⚠️ **HIGH**
- Validate video metadata after upload
- Reject corrupted/invalid video files
- Return error before creating Media record

### Priority 3: Playlist Auto-Assignment ⚠️ **HIGH**
- Auto-create playlist on first upload
- Auto-assign to screen
- Add video to playlist automatically

## Testing Checklist

- [ ] Upload valid video → Should create playlist and assign to screen
- [ ] Upload invalid/corrupted file → Should reject with clear error
- [ ] Upload to screen with existing playlist → Should add to existing playlist
- [ ] Playlist endpoint → Should return items including uploaded video
- [ ] Video playback → Should play the uploaded video

## Current Status

✅ **Working:**
- Upload endpoint accepts JSON base64 uploads
- Creates Media record in database
- Saves file to local storage
- Returns proper response format

❌ **Not Working:**
- File size validation (allows 5-byte files)
- Video format validation (allows corrupted files)
- Playlist auto-creation
- Screen playlist assignment
- Video playback (no playlist assigned)

## Next Steps

1. **Immediate:** Add file size validation (reject < 1KB)
2. **Immediate:** Add video format validation
3. **High Priority:** Implement playlist auto-assignment
4. **Medium Priority:** Add screenId to upload request
5. **Low Priority:** Update frontend to send full video files

