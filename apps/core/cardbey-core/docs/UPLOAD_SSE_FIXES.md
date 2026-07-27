# Upload and SSE CORS Fixes

## Summary

Fixed two issues:
1. **Playlist media upload response format** - Added `ok: true` to match dashboard expectations
2. **SSE CORS headers** - Fixed CORS configuration for `/api/stream` and `/api/stream?key=admin` endpoints

## Changes Made

### 1. Upload Route Response Format (`src/routes/upload.js`)

**Issue**: Dashboard expected `{ ok: true, data: {...} }` format but route was returning `{ data: {...} }`

**Fix**: Added `ok: true` to response:
```javascript
res.status(201).json({
  ok: true,  // Added this
  data: {
    id: media.id,
    url: media.url,
    // ... other fields
  },
});
```

**Route**: `POST /api/upload/playlist-media`
- Accepts: `multipart/form-data` with `file` field
- Returns: `{ ok: true, data: { id, url, mime, width, height, durationS, kind, sizeBytes } }`
- Saves files to `/uploads` directory
- Creates Media record in database

### 2. SSE CORS Headers (`src/realtime/sse.js`)

**Issue**: SSE endpoint `/api/stream` was not properly handling CORS preflight requests and origin validation

**Fixes Applied**:

1. **Added OPTIONS handler** for CORS preflight:
```javascript
router.options('/stream', (req, res) => {
  const origin = req.headers.origin || '';
  if (origin && isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  return res.sendStatus(204);
});
```

2. **Improved GET handler** to use `prepareSseResponse` function:
```javascript
router.get('/stream', (req, res, next) => {
  const origin = req.headers.origin || '';
  if (origin && !isOriginAllowed(origin)) {
    return res.status(403).json({ ok: false, error: 'origin_not_allowed' });
  }
  
  // Prepare SSE response with proper CORS headers
  if (!prepareSseResponse(req, res)) {
    return res.status(403).json({ ok: false, error: 'origin_not_allowed' });
  }
  
  attachClient(req, res, { label: 'router' });
});
```

3. **Updated `sse.routes.js`** (legacy route, kept for compatibility):
   - Added OPTIONS handler
   - Uses `prepareSseResponse` for proper CORS handling
   - Checks origin before allowing connection

### 3. SSE Headers Configuration

The SSE endpoints now properly set:
- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache, no-transform`
- `Connection: keep-alive`
- `X-Accel-Buffering: no` (disables nginx buffering)
- `Access-Control-Allow-Origin: <origin>` (from whitelist or `*`)
- `Access-Control-Allow-Credentials: true` (when origin is allowed)
- `Vary: Origin`

## CORS Whitelist

Origins are checked against whitelist in `src/config/cors.js`:
- `http://192.168.1.7:5174`
- `http://127.0.0.1:5174`
- `http://localhost:5174`
- Plus any origins from environment variables:
  - `ALLOWED_ORIGINS`
  - `CORS_WHITELIST`
  - `STUDIO_URL`
  - `PLAYER_URL`
  - `PLAYER_ORIGIN`

## Testing

### Upload Test
1. Open dashboard at `http://localhost:5174`
2. Navigate to Screens → Create Playlist
3. Upload an image or video file
4. Verify:
   - No 404 errors for `/api/upload/playlist-media`
   - File appears in playlist
   - File exists in `cardbey-core/uploads/` directory
   - Media record created in database

### SSE Test
1. Open dashboard at `http://localhost:5174`
2. Navigate to Screen Management page
3. Check browser console:
   - No CORS errors for `/api/stream`
   - No "connection interrupted" errors
   - SSE connection established successfully
4. Verify network tab:
   - `GET /api/stream` returns 200 with `text/event-stream` content type
   - `OPTIONS /api/stream` returns 204 (preflight successful)
   - Connection stays open (no immediate close)

## Files Changed

1. `src/routes/upload.js` - Added `ok: true` to response
2. `src/realtime/sse.js` - Added OPTIONS handler, improved CORS handling
3. `src/routes/sse.routes.js` - Updated to use proper CORS functions
4. `src/server.js` - Updated OPTIONS handler comment

## Date

Fixed: 2025-01-XX

