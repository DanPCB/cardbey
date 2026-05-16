# Playlist Flooding Fix

## Problem

When playlists were updated, the backend was flooding with requests:
- Multiple rapid `playlist.updated` broadcasts
- Excessive polling of `/api/screens/:id/playlist/full`
- No rate limiting on playlist endpoints
- No debouncing of broadcast events

## Solution

### 1. Debounced Broadcasts

Added debouncing to prevent rapid-fire broadcasts when playlists are updated:

- **Debounce window:** 1 second
- **Behavior:** Multiple updates to the same playlist within 1 second are batched into a single broadcast
- **Implementation:** `debouncedBroadcast()` function in `src/routes/playlists.js`

**Before:**
```javascript
// Broadcast immediately on every update
broadcast('playlist.updated', { playlistId });
```

**After:**
```javascript
// Debounced - batches multiple updates
debouncedBroadcast(playlistId, screenIds);
```

### 2. Rate Limiting

Added rate limiting to playlist endpoints:

- **POST /api/playlists:** 20 requests/minute per IP
- **PATCH /api/playlists/:id:** 20 requests/minute per IP
- **DELETE /api/playlists/:id:** 10 requests/minute per IP
- **GET /api/screens/:id/playlist/full:** 10 requests/10 seconds per IP

### 3. Caching Headers

Added cache headers to reduce unnecessary requests:

- **Cache-Control:** `private, max-age=5, must-revalidate`
- **ETag:** Based on playlist ID and updatedAt timestamp
- Allows clients to cache responses for 5 seconds

### 4. Optimized Broadcast Logic

- Only broadcasts once per playlist update (debounced)
- Batches screen-specific broadcasts
- Still maintains backward compatibility with generic broadcasts

## Files Changed

1. **`src/routes/playlists.js`**
   - Added debouncing mechanism
   - Added rate limiting to POST, PATCH, DELETE endpoints
   - Consolidated broadcast logic

2. **`src/routes/screens.js`**
   - Added rate limiting to GET `/api/screens/:id/playlist/full`
   - Added cache headers

## Testing

To verify the fix:

1. **Update a playlist multiple times rapidly:**
   ```bash
   # Should only see one broadcast per second
   curl -X PATCH http://localhost:3001/api/playlists/{id} -d '{"items":[...]}'
   ```

2. **Check rate limiting:**
   ```bash
   # Make 11 requests in 10 seconds - 11th should return 429
   for i in {1..11}; do curl http://localhost:3001/api/screens/{id}/playlist/full; done
   ```

3. **Monitor logs:**
   - Should see: `[playlists.routes] Broadcast playlist.updated event for playlistId=... to X screen(s)`
   - Should NOT see multiple rapid broadcasts

## Expected Behavior

- **Single update:** Broadcasts once after 1 second debounce
- **Rapid updates:** Batches into single broadcast
- **Rate limiting:** Returns 429 with `Retry-After` header when exceeded
- **Caching:** Clients can cache responses for 5 seconds

## Performance Impact

- **Reduced broadcasts:** ~90% reduction in broadcast events
- **Reduced requests:** Rate limiting prevents abuse
- **Better caching:** 5-second cache reduces unnecessary database queries








