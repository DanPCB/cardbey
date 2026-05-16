# SSE CORS and Sound Alert Fixes

## Summary

Fixed two issues:
1. **SSE CORS errors** - Standardized CORS handling using `cors()` middleware instead of manual header setting
2. **Sound alert console spam** - Reduced error logging noise for corrupt/invalid MP3 files

## Changes Made

### 1. SSE CORS Standardization

**Issue**: SSE routes were manually setting CORS headers, which could conflict with the global `cors()` middleware and cause CORS errors.

**Solution**: Use `cors()` middleware consistently on all SSE routes.

#### Files Changed:

**`src/realtime/sse.js`**:
- Added `cors` import
- Created `sseCorsOptions` object that reuses the same origin checking logic as global CORS
- Updated `setupSseHeaders()` to only set non-CORS headers (Content-Type, Cache-Control, Connection, etc.)
- Deprecated `prepareSseResponse()` - kept for backward compatibility but no longer sets CORS headers
- Updated GET and OPTIONS handlers to use `cors(sseCorsOptions)` middleware

**`src/routes/sse.routes.js`**:
- Added `cors` import
- Created `sseCorsOptions` object
- Updated GET and OPTIONS handlers to use `cors(sseCorsOptions)` middleware
- Removed manual CORS header setting

**`src/server.js`**:
- Updated `sseHeaders()` helper to only set non-CORS headers
- Removed fallback SSE handler (handled by `realtimeRoutes` now)

#### CORS Configuration:

```javascript
const sseCorsOptions = {
  origin(origin, callback) {
    if (!origin || isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: false, // SSE doesn't need credentials
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
```

#### Allowed Origins:

Origins are checked against whitelist in `src/config/cors.js`:
- `http://192.168.1.7:5174`
- `http://127.0.0.1:5174`
- `http://localhost:5174`
- Plus any origins from environment variables

### 2. Sound Alert Error Logging Cleanup

**Issue**: Console was spammed with audio decode errors for corrupt `notify.mp3` file (92 bytes, invalid MP3).

**Solution**: 
- Reduced error logging to only show in dev mode
- Changed `console.warn` to `console.debug` for less critical errors
- Added flag to prevent duplicate error logs
- Beep fallback already works correctly, just made it quieter

#### Files Changed:

**`src/features/alerts/SoundAlerts.tsx`**:
- Added `errorLogged` flag to prevent duplicate error logs
- Changed error logging to only show in dev mode (`import.meta.env?.DEV`)
- Changed `console.warn` to `console.debug` for less critical errors
- Beep fallback continues to work silently

## Testing

### SSE CORS Test:
1. Open dashboard at `http://localhost:5174`
2. Navigate to Screen Management page
3. Check browser console:
   - ✅ No CORS errors for `/api/stream`
   - ✅ No CORS errors for `/api/stream?key=admin`
   - ✅ SSE connection established successfully
4. Verify network tab:
   - `OPTIONS /api/stream` returns 204 (preflight successful)
   - `GET /api/stream` returns 200 with `text/event-stream` content type
   - `Access-Control-Allow-Origin` header matches request origin
   - Connection stays open (no immediate close)

### Sound Alert Test:
1. Enable sound alerts in dashboard
2. Trigger a pairing event
3. Check console:
   - ✅ No error spam about `notify.mp3`
   - ✅ Beep fallback plays correctly
   - ✅ Only debug messages in dev mode (if any)

## Key Improvements

1. **Consistent CORS handling**: All SSE routes now use the same `cors()` middleware, preventing conflicts
2. **No manual CORS headers**: Removed all manual `Access-Control-Allow-Origin` setting from SSE code
3. **Cleaner console**: Sound alert errors only log in dev mode, reducing production noise
4. **Better error handling**: Beep fallback works silently when MP3 is unavailable

## Files Changed

1. `src/realtime/sse.js` - Use cors() middleware, remove manual CORS headers
2. `src/routes/sse.routes.js` - Use cors() middleware, remove manual CORS headers
3. `src/server.js` - Updated sseHeaders() helper, removed fallback handler
4. `src/config/cors.js` - No changes (whitelist already correct)
5. `src/features/alerts/SoundAlerts.tsx` - Reduced error logging noise

## Date

Fixed: 2025-01-XX

